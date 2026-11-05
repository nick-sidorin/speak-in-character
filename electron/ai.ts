import { app, clipboard, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePreset } from './presets';

type AiContext = { additionalContext: string; targetLanguage: string; presetId: string };
export type RewriteResult = { text: string; estimatedTextCostUsd: number };
export type VoiceResult = { transcript: string; translated: string; estimatedTextCostUsd: number };
export type VoicePayload = AiContext & { bytes: Uint8Array; mimeType: string };

function keyPath() { return join(app.getPath('userData'), 'api-key.dat'); }

function getApiKey(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(keyPath())) return null;
    return safeStorage.decryptString(Buffer.from(readFileSync(keyPath(), 'utf8'), 'base64'));
  } catch {
    return null;
  }
}

export function hasApiKey(): boolean { return Boolean(getApiKey()); }

export function setApiKey(value: string): boolean {
  const key = value.trim();
  if (!key) throw new Error('Введите API-ключ OpenAI.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Защищённое хранилище Windows недоступно.');
  writeFileSync(keyPath(), safeStorage.encryptString(key).toString('base64'), { encoding: 'utf8', mode: 0o600 });
  return true;
}

function requiredKey(): string {
  const key = getApiKey();
  if (!key) throw new Error('Сначала сохрани OpenAI API key в настройках InCharacter.');
  return key;
}

async function openAiFetch(url: string, key: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('OpenAI API: неверный ключ (401).');
    if (res.status === 429) throw new Error('OpenAI API: исчерпан лимит запросов или бюджет (429).');
    if (res.status === 413) throw new Error('Аудиофайл слишком большой для распознавания.');
    throw new Error(`OpenAI API: ошибка ${res.status}. Проверь ключ, баланс и соединение.`);
  }
  return res;
}

function cleanContext(value: string, limit: number) {
  return (value || '').trim().slice(0, limit);
}

function instructions(targetLanguage: string): string {
  return [
    'You are InCharacter, a faithful multilingual voice-to-chat editor for roleplaying and everyday communication across any game or social world.',
    `Turn the speaker's transcribed words into ONE natural chat message in this TARGET LANGUAGE: ${targetLanguage}.`,
    'The speaker may use any language or mix languages. Understand the words first; then express the same message in the target language.',
    'Preserve the speaker\'s meaning, facts, perspective, intent, humor and emotional tone. Never invent claims, actions, names or additional dialogue.',
    'STYLE INSTRUCTION PRECEDENCE (strict): The optional speech preset establishes a baseline voice. The user\'s ADDITIONAL CONTEXT is the more specific, higher-priority instruction for this particular speaker or scene. Combine all compatible style cues; when style instructions conflict, follow the additional context over the preset. Preserve the base task of faithful meaning above both.',
    'In particular, if the preset asks for pirate speech and additional context specifies that this character stutters frequently, express BOTH: recognizable pirate vocabulary AND visible frequent but readable stammering (e.g. occasional broken/repeated opening syllables or words such as "I-I" or "th-that"). Do not silently polish away the stutter, do not mock the speaker, and do not add other dialogue. Match the intensity specified by the user: occasional means occasional; strong/frequent means readily noticeable throughout.',
    'Additional context may also describe the character, their register, relationships, game terms, scene and proper nouns. Use these details only for interpretation and style, never to invent new facts, lore or dialogue.',
    'These style changes apply ONLY to the final output message; the original transcription stays faithful to the spoken audio.',
    'Use established canonical localized proper names only when confidently known. If uncertain, preserve the original name rather than invent a translation.',
    'No default dialect, game lore or character stereotype. Without style guidance, use natural language matching the original register.',
    'Output only the final message, with no prefacing, explanation or surrounding quotation marks.',
  ].join(' ');
}

export async function rewriteSpeech(
  transcript: string,
  context: AiContext,
): Promise<RewriteResult> {
  const key = requiredKey();
  const spoken = cleanContext(transcript, 5000);
  if (!spoken) throw new Error('Текст для перевода пуст.');
  const targetLanguage = cleanContext(context.targetLanguage || 'English', 80);
  if (!targetLanguage) throw new Error('Укажи язык реплики.');
  const preset = resolvePreset(context.presetId || '');
  const response = await openAiFetch('https://api.openai.com/v1/chat/completions', key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: instructions(targetLanguage) },
        { role: 'user', content: JSON.stringify({
          targetLanguage,
          originalSpeech: spoken,
          baselineStylePreset: preset ? {
            name: preset.name.en,
            instructions: preset.instructions,
          } : null,
          higherPriorityUserAdditionalContext: cleanContext(context.additionalContext, 1600),
          requiredStylePrecedence: 'core faithful meaning > user additional context > preset; combine compatible style traits',
        }) },
      ],
    }),
  });
  const data: unknown = await response.json();
  const root = data as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const translated = root.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error('OpenAI вернул пустую реплику.');
  clipboard.writeText(translated);
  const cost = ((root.usage?.prompt_tokens || 0) * 0.4 + (root.usage?.completion_tokens || 0) * 1.6) / 1_000_000;
  return { text: translated, estimatedTextCostUsd: cost };

}

export async function processVoice(payload: VoicePayload): Promise<VoiceResult> {
  const key = requiredKey();
  if (!payload?.bytes || !ArrayBuffer.isView(payload.bytes)) {
    throw new Error('Некорректные аудиоданные.');
  }
  const bytes = new Uint8Array(payload.bytes);
  if (bytes.byteLength < 100 || bytes.byteLength > 20_000_000) {
    throw new Error('Запись должна быть от 100 байт до 20 МБ.');
  }
  const mime = payload.mimeType?.includes('ogg') ? 'audio/ogg' : 'audio/webm';
  const extension = mime.includes('ogg') ? 'ogg' : 'webm';
  const preset = resolvePreset(payload.presetId || '');
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `speech.${extension}`);
  form.append('model', 'gpt-4o-transcribe');
  form.append('prompt', [
    'Transcribe the AUDIO exactly as spoken, in its original language(s). Do not invent disfluencies, accents, stutters or repetitions from the character description; do not apply stylistic prompts to the transcript. Preserve audible code-switching and genuine audible repetitions. Do not translate.',
    preset?.recognitionHints || '',
    cleanContext(payload.additionalContext, 650),
  ].filter(Boolean).join(' ').slice(0, 1000));
  const response = await openAiFetch('https://api.openai.com/v1/audio/transcriptions', key, {
    method: 'POST',
    body: form,
  });
  const data: unknown = await response.json();
  const transcript = (data as { text?: string }).text?.trim();
  if (!transcript) throw new Error('Не удалось распознать речь.');
  // If translation fails, let the UI display the raw transcript.
  try {
    const result = await rewriteSpeech(transcript, payload);
    return { transcript, translated: result.text, estimatedTextCostUsd: result.estimatedTextCostUsd };
  } catch {
    return { transcript, translated: '', estimatedTextCostUsd: 0 };
  }
}

export function copyToClipboard(value: string): void {
  const text = value.trim();
  if (!text) throw new Error('Текст для копирования пуст.');
  clipboard.writeText(text);
}
