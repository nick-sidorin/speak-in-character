import { app, clipboard, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type AiContext = { character: string; situation: string; targetLanguage: string };
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
    'You are a faithful multilingual editor for a human roleplayer in World of Warcraft.',
    `Rewrite the player's speech into ONE natural chat message in this TARGET LANGUAGE: ${targetLanguage}.`,
    'Speech can be in Russian, English, French, German or other languages, including code-switching. Understand the speech first, then express the intended message in the target language.',
    'Preserve the exact facts, meaning, intent, speaker perspective and emotion from the original speech. Never invent new claims, actions, names, or conversation turns.',
    'The character field may describe the speaker, personality, RP register and preferred manner of speaking IN ANY LANGUAGE. Apply that speaking style to the FINAL MESSAGE: vocabulary, idioms, contractions, humor and subtle dialect flavor. A style description is a real stylistic instruction, not merely a hint about proper names.',
    'For example, an explicitly cheerful fantasy dwarf using colloquial language can sound warm, boisterous and slightly Scottish-inspired in English: occasional aye, ye, lad/lass, dinnae, or dropped g. Use natural phrasing, not a repetitive caricature or a wall of phonetic spellings. In other target languages, use culturally and linguistically natural analogues, rather than untranslated English catchphrases.',
    'If the character profile does not specify a special style, stay close to the original register. Never let a roleplaying style change what the player actually said or make their character take actions they did not describe.',
    'The situation field is background context for understanding people, places and game names. It does not authorize inventing dialogue, lore or facts.',
    'For World of Warcraft proper names, use established canonical names in the target-language localization ONLY when confidently known.',
    'Never invent item or place names: if the precise localized form is uncertain, keep the original proper name unchanged.',
    'No intro, no explanations, no quotation marks around the whole result; return only the final chat message.',
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
  const response = await openAiFetch('https://api.openai.com/v1/chat/completions', key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: instructions(targetLanguage) },
        { role: 'user', content: JSON.stringify({
          character: cleanContext(context.character, 700),
          situation: cleanContext(context.situation, 700),
          targetLanguage,
          spoken,
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
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `speech.${extension}`);
  form.append('model', 'gpt-4o-transcribe');
  form.append('prompt', [
    'Speech may be in any language, or a mixture. Transcribe it in the original language(s). Preserve code-switching; do not translate.',
    'The setting is World of Warcraft. Names may include Stormwind, Ironforge, Goldshire, Elwynn Forest, The Crossroads, Orgrimmar.',
    cleanContext(payload.character, 400),
    cleanContext(payload.situation, 400),
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
