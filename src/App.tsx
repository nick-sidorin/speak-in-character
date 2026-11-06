import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { INTERFACE_LANGUAGES, t, type InterfaceLanguage, type TranslationKey } from './i18n';
import { Circle, Square, X, Check, AlertCircle, Clock3, History, Settings2, MessageSquareText, ClipboardCopy, Download, Move, RefreshCw, Moon, Sun, Monitor } from 'lucide-react';
import { MantineProvider, ActionIcon, Badge, Button, PasswordInput, SegmentedControl, Select, Switch, Tabs, Textarea, TextInput } from '@mantine/core';
import { appTheme } from './theme';

type ViewMode = 'hud' | 'panel';
type Tab = 'rp' | 'history' | 'settings';
type Appearance = 'system' | 'dark' | 'light';
type Phase = 'idle' | 'requesting' | 'recording' | 'finalizing' | 'processing' | 'ready' | 'error';

type PresetInfo = {
  id: string;
  name: { en: string; ru?: string; fr?: string; es?: string; de?: string };
  description: { en: string; ru?: string; fr?: string; es?: string; de?: string };
  source: 'built-in' | 'custom';
};

function localizedPresetText(text: PresetInfo['name'], language: InterfaceLanguage): string {
  return text[language] || text.en;
}

type RecordEntry = {
  id: number;
  createdAt: number;
  blob: Blob;
  url: string;
  durationMs: number;
  transcript: string;
  english: string;
  targetLanguage: string;
  presetId: string;
  estimatedTextCostUsd: number;
  transcriptionCostUsd: number;
};

const TRANSCRIPTION_PER_MINUTE = 0.006;
const MAX_HISTORY = 15;
// Short accidental taps never create a history entry or incur API charges.
const MIN_RECORDING_MS = 250;
// A deliberately conservative local silence gate: it detects near-silence,
// not actual words. Anything ambiguous is still sent to transcription.
const SILENCE_CHECK_MIN_MS = 1200;
const MIN_SIGNAL_RMS = 0.0045;
type AudioLevelSummary = { samples: number; audibleSamples: number; maxRms: number };

function startAudioLevelMonitor(stream: MediaStream):
  { summary: AudioLevelSummary; stop: () => void } | null {
  try {
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser); // Do not connect to speakers.
    const samples = new Float32Array(analyser.fftSize);
    const summary: AudioLevelSummary = { samples: 0, audibleSamples: 0, maxRms: 0 };
    const interval = setInterval(() => {
      if (context.state !== 'running') return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (let index = 0; index < samples.length; index++) {
        energy += samples[index] * samples[index];
      }
      const rms = Math.sqrt(energy / samples.length);
      summary.samples++;
      summary.maxRms = Math.max(summary.maxRms, rms);
      if (rms >= MIN_SIGNAL_RMS) summary.audibleSamples++;
    }, 45);
    void context.resume().catch(() => {
      // If audio analysis is unavailable, leave the decision to transcription.
    });
    return {
      summary,
      stop: () => {
        clearInterval(interval);
        source.disconnect();
        void context.close().catch(() => {});
      },
    };
  } catch (error) {
    console.warn('Microphone level analysis unavailable:', error);
    return null;
  }
}

function shouldDiscardSilentRecording(durationMs: number, summary: AudioLevelSummary | null): boolean {
  // If the browser suspended its AudioContext, do not discard unanalysed speech.
  return durationMs >= SILENCE_CHECK_MIN_MS &&
    summary !== null &&
    summary.samples >= 8 &&
    summary.audibleSamples === 0 &&
    summary.maxRms < MIN_SIGNAL_RMS;
}

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

function amount(usd: number): string {
  return '$' + usd.toFixed(5);
}

function errorText(error: unknown, lang: InterfaceLanguage): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
    return t(lang, 'micDenied');
  }
  return error instanceof Error ? error.message : t(lang, 'unknownError');
}

function phaseLabel(phase: Phase, hold: boolean, lang: InterfaceLanguage): string {
  const keys: Partial<Record<Phase, TranslationKey>> = {
    recording: 'phaseRecording', requesting: 'phaseRequesting', finalizing: 'phaseFinalizing',
    processing: 'phaseProcessing', ready: 'phaseReady', error: 'phaseError',
  };
  const key = keys[phase];
  return key ? t(lang, key) : t(lang, hold ? 'phaseHold' : 'phaseTap');
}

function StateIcon({ phase, language }: { phase: Phase; language: InterfaceLanguage }) {
  if (phase === 'processing' || phase === 'requesting' || phase === 'finalizing') {
    return <span className="state-spinner" aria-label={t(language, 'iconProcessing')} />;
  }
  if (phase === 'ready') return <span className="state-check" aria-label={t(language, 'iconReady')}><Check size={17} strokeWidth={3} /></span>;
  if (phase === 'error') return <span className="state-error" aria-label={t(language, 'iconError')}><AlertCircle size={19} strokeWidth={2.5}/></span>;
  return <span className={'state-circle ' + (phase === 'recording' ? 'recording' : '')}>
    <Circle size={18} fill="currentColor" strokeWidth={1.8} />
  </span>;
}

type ShortcutAction = 'record' | 'panel' | 'move';
type ShortcutConfig = Record<ShortcutAction,string>;
const DEFAULT_KEYS: ShortcutConfig = { record: 'CapsLock', panel: 'Ctrl+Shift+O', move: 'Ctrl+Shift+M' };

function KeyCaps({ value }: { value: string }) {
  const tokens = value.split('+');
  return <span className="key-caps">{tokens.map((token,index) =>
    <span className="key-part" key={index}>
      {index > 0 && <span className="key-plus">+</span>}
      <kbd>{token}</kbd>
    </span>
  )}</span>;
}

// Use physical keyboard codes to keep shortcuts independent of RU/EN layout.
function shortcutFromEvent(event: KeyboardEvent<HTMLButtonElement>): string | null {
  if (event.repeat) return null;
  const code = event.code;
  if (['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(code)) {
    return null;
  }
  let key = '';
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F(?:[1-9]|1[0-2])$/.test(code)) key = code;
  else if (['CapsLock','Space','Tab','Enter','Backspace','Escape','Delete','Insert','Home','End','PageUp','PageDown','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code)) key = code;
  if (!key) return null;
  const mods = [
    ...(event.ctrlKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
  ];
  return [...mods,key].join('+');
}

function languageFromSystemLocale(locale?: string): InterfaceLanguage {
  const base = locale?.split(/[-_]/, 1)[0]?.trim().toLowerCase();
  return INTERFACE_LANGUAGES.find(language => language.value === base)?.value ?? 'en';
}

export default function App() {
  const [view, setView] = useState<ViewMode>('hud');
  const [tab, setTab] = useState<Tab>('rp');
  const [appearance, setAppearance] = useState<Appearance>(() => {
    const stored = localStorage.getItem('appearance');
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const effectiveTheme: 'light' | 'dark' = appearance === 'system'
    ? (systemDark ? 'dark' : 'light')
    : appearance;
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [micProcessing, setMicProcessing] = useState(() => localStorage.getItem('mic-processing') === 'true');
  const [additionalContext, setAdditionalContext] = useState(() => {
    const saved = localStorage.getItem('additional-context');
    if (saved !== null) return saved;
    // Preserve prompts from previous InCharacter versions.
    return [localStorage.getItem('character'), localStorage.getItem('situation')]
      .map(value => value?.trim()).filter(Boolean).join('\n');
  });
  const [presetId, setPresetId] = useState(() => localStorage.getItem('speech-preset') || '');
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [presetError, setPresetError] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [uiLanguagePreference, setUiLanguagePreference] = useState(() => {
    const stored = localStorage.getItem('interface-language');
    return INTERFACE_LANGUAGES.some(language => language.value === stored) ? stored! : 'system';
  });
  const [systemLanguage, setSystemLanguage] = useState<InterfaceLanguage>(() =>
    languageFromSystemLocale(navigator.languages?.[0] || navigator.language)
  );
  // Keep manually selected languages across upgrades; fresh installs follow Windows.
  // Unsupported system languages fall back to English, not Russian.
  const uiLanguage: InterfaceLanguage = uiLanguagePreference === 'system'
    ? systemLanguage
    : languageFromSystemLocale(uiLanguagePreference);
  const [replyLanguageInput, setReplyLanguageInput] = useState(() => {
    const stored = localStorage.getItem('reply-language');
    if (stored === '__other__') return localStorage.getItem('custom-reply-language') || 'English';
    return stored || 'English';
  });
  const replyLanguage = replyLanguageInput.trim();
  const tr = (key: TranslationKey) => t(uiLanguage, key);
  const [original, setOriginal] = useState('');
  const [english, setEnglish] = useState('');
  const [history, setHistory] = useState<RecordEntry[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [moveEnabled, setMoveEnabled] = useState(false);
  const [shortcuts, setShortcuts] = useState({ recording: true, panel: true, move: true, hold: false });
  const [keyBindings, setKeyBindings] = useState<ShortcutConfig>(DEFAULT_KEYS);
  const [captureAction, setCaptureAction] = useState<ShortcutAction | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [shortcutError, setShortcutError] = useState('');

  const phaseRef = useRef<Phase>('idle');
  const processingRef = useRef(false);
  const hasKeyRef = useRef(false);
  const contextRef = useRef({ additionalContext, targetLanguage: replyLanguage, presetId });
  const micRef = useRef(micProcessing);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const recordedDurationRef = useRef(0);
  const audioLevelMonitorRef = useRef<ReturnType<typeof startAudioLevelMonitor>>(null);
  const draftRef = useRef({ original, english });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingReleaseRef = useRef(false);
  const holdActiveRef = useRef(false);
  const recordingViaHoldRef = useRef(false);
  const idCounterRef = useRef(0);
  const urlsRef = useRef<Set<string>>(new Set());
  const activeIdRef = useRef<number | null>(null);

  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const toggleRef = useRef<() => void>(() => {});
  const downRef = useRef<() => void>(() => {});
  const upRef = useRef<() => void>(() => {});
  const processRef = useRef<(blob: Blob, id: number, duration: number) => Promise<void>>(async () => {});

  contextRef.current = { additionalContext, targetLanguage: replyLanguage, presetId };
  micRef.current = micProcessing;
  hasKeyRef.current = hasKey;
  draftRef.current = { original, english };

  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  function stopClock() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function stopAudioLevelMonitor() {
    audioLevelMonitorRef.current?.stop();
    audioLevelMonitorRef.current = null;
  }

  function discardUnusableRecording(reason: TranslationKey) {
    // Do not replace the player's previous draft or add anything to history.
    setPhase(draftRef.current.english.trim() ? 'ready' : 'idle');
    setMessage(tr(reason));
    setElapsed(0);
  }

  function changeEntry(id: number, changes: Partial<RecordEntry>) {
    setHistory(previous => previous.map(entry => entry.id === id ? { ...entry, ...changes } : entry));
  }

  processRef.current = async (blob: Blob, id: number, duration: number) => {
    if (!hasKeyRef.current) {
      setPhase('ready');
      setMessage(tr('msgNoKey'));
      return;
    }
    processingRef.current = true;
    setPhase('processing');
    setMessage(tr('msgProcessing'));
    changeEntry(id, { transcriptionCostUsd: duration / 60000 * TRANSCRIPTION_PER_MINUTE });

    try {
      const result = await window.inCharacter.processVoice({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type,
        ...contextRef.current,
      });
      changeEntry(id, {
        transcript: result.transcript,
        english: result.translated,
        estimatedTextCostUsd: result.estimatedTextCostUsd,
      });
      if (activeIdRef.current === id) {
        setOriginal(result.transcript);
        setEnglish(result.translated);
      }
      if (!result.translated) {
        setPhase('error');
        setMessage(tr('msgTranscriptOnly'));
      } else {
        setPhase('ready');
        setMessage(tr('msgCopiedReady'));
      }
    } catch (error) {
      setPhase('error');
      setMessage('OpenAI: ' + errorText(error, uiLanguage));
    } finally {
      processingRef.current = false;
    }
  };

  stopRef.current = () => {
    if (phaseRef.current === 'requesting') {
      pendingReleaseRef.current = true;
      return;
    }
    if (phaseRef.current !== 'recording') return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recordedDurationRef.current = Date.now() - startedRef.current;
    setElapsed(recordedDurationRef.current);
    stopClock();
    setPhase('finalizing');
    stopAudioLevelMonitor();
    recorder.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  startRef.current = async () => {
    if (processingRef.current || ['recording', 'requesting', 'processing', 'finalizing'].includes(phaseRef.current)) return;
    if (!replyLanguage) {
      setMessage(tr('msgCustomMissing'));
      setPhase('error');
      return;
    }
    pendingReleaseRef.current = false;
    recordedDurationRef.current = 0;
    setElapsed(0);
    setPhase('requesting');
    setMessage(tr('msgMicAccess'));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: micRef.current,
          echoCancellation: micRef.current,
          autoGainControl: micRef.current,
        },
        video: false,
      });
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(value => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      audioLevelMonitorRef.current = startAudioLevelMonitor(stream);
      // Retain the collected levels after the microphone is released.
      const levels = audioLevelMonitorRef.current?.summary ?? null;

      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        stopClock();
        stopAudioLevelMonitor();
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        processingRef.current = false;
        setPhase('error');
        setMessage(tr('msgMicError'));
      };
      recorder.onstop = () => {
        const duration = recordedDurationRef.current || (Date.now() - startedRef.current);
        // These checks happen BEFORE Blob creation, history insertion, and OpenAI.
        if (duration < MIN_RECORDING_MS) {
          discardUnusableRecording('msgRecordingTooShort');
          return;
        }
        if (shouldDiscardSilentRecording(duration, levels)) {
          discardUnusableRecording('msgRecordingSilent');
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) {
          discardUnusableRecording('msgEmpty');
          return;
        }
        const url = URL.createObjectURL(blob);
        urlsRef.current.add(url);
        const id = ++idCounterRef.current;
        setOriginal('');
        setEnglish('');
        const item: RecordEntry = {
          id,
          url,
          blob,
          createdAt: Date.now(),
          durationMs: duration,
          transcript: '',
          english: '',
          targetLanguage: contextRef.current.targetLanguage,
          presetId: contextRef.current.presetId,
          estimatedTextCostUsd: 0,
          transcriptionCostUsd: 0,
        };
        setHistory(previous => [item, ...previous].slice(0, MAX_HISTORY));
        activeIdRef.current = id;
        setActiveId(id);
        setMessage(tr('msgAudioReady'));
        void processRef.current(blob, id, duration);
      };
      recorder.start(250);
      startedRef.current = Date.now();
      setPhase('recording');
      setMessage(tr('msgRecording'));
      timerRef.current = setInterval(() => setElapsed(Date.now() - startedRef.current), 120);
      if (pendingReleaseRef.current) {
        setTimeout(() => stopRef.current(), 160);
      }
    } catch (error) {
      stopClock();
      stopAudioLevelMonitor();
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setPhase('error');
      setMessage(errorText(error, uiLanguage));
    }
  };

  toggleRef.current = () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'requesting') stopRef.current();
    else if (!processingRef.current) {
      recordingViaHoldRef.current = false;
      void startRef.current();
    }
  };

  downRef.current = () => {
    if (holdActiveRef.current) return;
    holdActiveRef.current = true;
    if (processingRef.current || ['recording', 'requesting', 'processing', 'finalizing'].includes(phaseRef.current)) return;
    recordingViaHoldRef.current = true;
    void startRef.current();
  };

  upRef.current = () => {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    if (recordingViaHoldRef.current) {
      recordingViaHoldRef.current = false;
      stopRef.current();
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemAppearanceChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener('change', onSystemAppearanceChange);
    return () => media.removeEventListener('change', onSystemAppearanceChange);
  }, []);

  useEffect(() => {
    window.inCharacter.setThemeBackground(effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    if (localStorage.getItem('additional-context') === null) {
      localStorage.setItem('additional-context', additionalContext);
    }
    window.inCharacter.hasApiKey().then(value => setHasKey(value)).catch(() => setHasKey(false));
    void window.inCharacter.getPreferredLanguages().then(languages => {
      setSystemLanguage(languageFromSystemLocale(languages[0]));
    }).catch(error => console.warn('Unable to read Windows UI language:', error));
    void window.inCharacter.listPresets().then(values => {
      setPresets(values);
      setPresetError('');
    }).catch(error => setPresetError(error instanceof Error ? error.message : String(error)))
      .finally(() => setPresetsLoading(false));
    void window.inCharacter.getShortcuts().then(result => {
      setKeyBindings(result.shortcuts);
      setShortcuts(result.status);
    }).catch(error => console.warn('Unable to load shortcuts', error));
    const offToggle = window.inCharacter.onToggleRecording(() => toggleRef.current());
    const offDown = window.inCharacter.onHoldKeyDown(() => downRef.current());
    const offUp = window.inCharacter.onHoldKeyUp(() => upRef.current());
    const offMode = window.inCharacter.onViewModeChanged(mode => {
      setView(mode);
      if (mode === 'hud') {
        setCaptureAction(null);
        window.inCharacter.setShortcutCapture(false);
      }
    });
    const offMove = window.inCharacter.onHudMoveModeChanged(value => setMoveEnabled(value));
    const offShortcuts = window.inCharacter.onShortcutStatus(value => setShortcuts(value));
    return () => {
      window.inCharacter.setShortcutCapture(false);
      offToggle();
      offDown();
      offUp();
      offMode();
      offMove();
      offShortcuts();
      stopClock();
      stopAudioLevelMonitor();
      streamRef.current?.getTracks().forEach(track => track.stop());
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  async function reloadPresets() {
    setPresetsLoading(true);
    try {
      const items = await window.inCharacter.listPresets();
      setPresets(items);
      setPresetError('');
      setMessage(tr('presetReloaded'));
    } catch (error) {
      setPresetError(tr('presetLoadError') + errorText(error, uiLanguage));
    } finally {
      setPresetsLoading(false);
    }
  }

  async function openPresetsFolder() {
    try {
      await window.inCharacter.openPresetsFolder();
    } catch (error) {
      setPresetError(tr('presetFolderError') + errorText(error, uiLanguage));
    }
  }

  function selectPreset(id: string) {
    setPresetId(id);
    localStorage.setItem('speech-preset', id);
  }

  async function saveKey() {
    if (!apiKeyDraft.trim()) return;
    setKeyBusy(true);
    try {
      await window.inCharacter.saveApiKey(apiKeyDraft);
      setApiKeyDraft('');
      setHasKey(true);
      setMessage(tr('msgKeySaved'));
    } catch (error) {
      setMessage(tr('msgKeyError') + errorText(error, uiLanguage));
    } finally {
      setKeyBusy(false);
    }
  }

  async function rewrite() {
    if (!original.trim() || processingRef.current) return;
    if (!replyLanguage) {
      setMessage(tr('msgCustomMissing'));
      setPhase('error');
      return;
    }
    processingRef.current = true;
    setPhase('processing');
    setMessage(tr('msgRewriting'));
    try {
      const result = await window.inCharacter.rewriteSpeech(original, contextRef.current);
      setEnglish(result.text);
      if (activeIdRef.current !== null) {
        const item = history.find(entry => entry.id === activeIdRef.current);
        changeEntry(activeIdRef.current, {
          english: result.text,
          transcript: original,
          estimatedTextCostUsd: (item?.estimatedTextCostUsd || 0) + result.estimatedTextCostUsd,
        });
      }
      setPhase('ready');
      setMessage(tr('msgRewriteReady'));
    } catch (error) {
      setPhase('error');
      setMessage(tr('msgRewriteError') + errorText(error, uiLanguage));
    } finally {
      processingRef.current = false;
    }
  }

  function startCapture(action: ShortcutAction) {
    if (inProgress || shortcutBusy) return;
    setShortcutError('');
    window.inCharacter.setShortcutCapture(true);
    setCaptureAction(action);
  }

  function cancelCapture() {
    window.inCharacter.setShortcutCapture(false);
    setCaptureAction(null);
  }

  async function captureShortcut(event: KeyboardEvent<HTMLButtonElement>, action: ShortcutAction) {
    if (captureAction !== action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      cancelCapture();
      return;
    }
    const combo = shortcutFromEvent(event);
    if (!combo || shortcutBusy) return;
    setShortcutBusy(true);
    setShortcutError('');
    try {
      const result = await window.inCharacter.setShortcuts({ ...keyBindings, [action]: combo });
      setKeyBindings(result.shortcuts);
      setShortcuts(result.status);
      setMessage(tr('hotkeySaved'));
      cancelCapture();
    } catch (error) {
      setShortcutError(errorText(error, uiLanguage));
    } finally {
      setShortcutBusy(false);
    }
  }

  async function copyReply() {
    if (!english.trim()) return;
    await window.inCharacter.copyText(english);
    setMessage(tr('msgClipboard'));
  }

  function selectHistoryItem(item: RecordEntry) {
    activeIdRef.current = item.id;
    setActiveId(item.id);
    setOriginal(item.transcript);
    setEnglish(item.english);
    setReplyLanguageInput(item.targetLanguage);
    localStorage.setItem('reply-language', item.targetLanguage);
    selectPreset(item.presetId || '');
    setTab('rp');
  }

  async function saveEntry(item: RecordEntry) {
    try {
      const extension = item.blob.type.includes('ogg') ? 'ogg' : 'webm';
      const result = await window.inCharacter.saveRecording({
        bytes: new Uint8Array(await item.blob.arrayBuffer()),
        extension,
      });
      if (!result.canceled) setMessage(tr('msgSaved') + result.filePath);
    } catch (error) {
      setMessage(tr('msgSaveError') + errorText(error, uiLanguage));
    }
  }

  const dragWindowStart = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.inCharacter.startHudDrag();
  };
  const dragWindowMove = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) window.inCharacter.moveHudDrag();
  };
  const dragWindowEnd = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      window.inCharacter.endHudDrag();
    }
  };

  const selectedPreset = presets.find(item => item.id === presetId);
  const sessionCost = history.reduce((sum, entry) =>
    sum + entry.transcriptionCostUsd + entry.estimatedTextCostUsd, 0);
  const isBusy = phase === 'requesting' || phase === 'finalizing' || phase === 'processing';
  const inProgress = phase === 'recording' || isBusy;

  if (view === 'hud') {
    return <div
      className={'hud ' + (moveEnabled ? 'hud-move' : '')}
      onPointerDown={moveEnabled ? dragWindowStart : undefined}
      onPointerMove={moveEnabled ? dragWindowMove : undefined}
      onPointerUp={moveEnabled ? dragWindowEnd : undefined}
      onPointerCancel={moveEnabled ? dragWindowEnd : undefined}
    >
      <div className="hud-status"><StateIcon phase={phase} language={uiLanguage} /></div>
      <div className="hud-text">
        <div className="hud-brand">SPEAKINCHARACTER</div>
        <div className="hud-main">
          {moveEnabled ? tr('hudMove') : phase === 'idle' ? tr('hudIdle') : phaseLabel(phase, shortcuts.hold, uiLanguage)}
        </div>
      </div>
      {moveEnabled && <button type="button" className="hud-lock" title={tr('lockTitle')} onClick={() => window.inCharacter.setHudMoveMode(false)}><Check size={16} strokeWidth={2.7}/></button>}
    </div>;
  }

  return <MantineProvider theme={appTheme} forceColorScheme={effectiveTheme}>
    <div className="shell" data-ui-theme={effectiveTheme}>
    <header
      className="topbar"
      onPointerDown={dragWindowStart}
      onPointerMove={dragWindowMove}
      onPointerUp={dragWindowEnd}
      onPointerCancel={dragWindowEnd}
    >
      <div className="monogram">sc</div>
      <div className="brand">
        <div className="brand-name">SpeakInCharacter <span>0.9.0</span></div>
        <div className="brand-tag">Speak naturally. Stay in character.</div>
      </div>
      <button className="window-close" title={tr('hidePanel')} type="button" onClick={() => window.inCharacter.setViewMode('hud')}><X size={18} strokeWidth={2.3}/></button>
    </header>

    <nav className="tabs" aria-label={tr('tabsAria')}>
      <button type="button" className={tab === 'rp' ? 'selected' : ''} onClick={() => setTab('rp')}><MessageSquareText size={16} strokeWidth={2}/><span>{tr('tabReply')}</span></button>
      <button type="button" className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}><Clock3 size={16} strokeWidth={2}/><span>{tr('tabHistory')}</span>{history.length > 0 && <small>{history.length}</small>}</button>
      <button type="button" className={tab === 'settings' ? 'selected' : ''} onClick={() => setTab('settings')}><Settings2 size={16} strokeWidth={2}/><span>{tr('tabSettings')}</span></button>
    </nav>

    <main className="content">
      {tab === 'rp' && <div className="rp-screen">
        <div className="section-intro">
          <h1>{tr('heroTitle')}</h1>
          <p>{tr('heroSub')}</p>
        </div>

        <div className="target-language">
          <label htmlFor="reply-language">{tr('targetLabel')}</label>
          <input
            id="reply-language"
            type="text"
            maxLength={80}
            value={replyLanguageInput}
            placeholder="English"
            onChange={event => {
              setReplyLanguageInput(event.target.value);
              localStorage.setItem('reply-language', event.target.value);
            }}
          />
        </div>
        <div className="rp-preset-row">
          <label htmlFor="speech-preset">{tr('presetLabel')}</label>
          <select
            id="speech-preset"
            value={presetId}
            onChange={event => selectPreset(event.target.value)}
          >
            <option value="">{tr('presetNone')}</option>
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {localizedPresetText(preset.name, uiLanguage)}
              </option>
            ))}
            {presetId && !selectedPreset && !presetsLoading &&
              <option value={presetId}>{tr('presetMissing')}</option>}
          </select>
        </div>
        <div className="additional-context">
          <label htmlFor="additional-context">{tr('additionalContextLabel')}</label>
          <textarea
            id="additional-context"
            rows={3}
            value={additionalContext}
            placeholder={tr('additionalContextPlaceholder')}
            onChange={event => {
              setAdditionalContext(event.target.value);
              localStorage.setItem('additional-context', event.target.value);
            }}
          />
        </div>
        <div className={'record-strip ' + (phase === 'recording' ? 'record-active' : '')}>
          <div className="status-figure"><StateIcon phase={phase} language={uiLanguage} /></div>
          <div className="record-label">
            <strong className="record-main-status">
              {phase === 'idle' ? <>
                {tr(shortcuts.hold ? 'phaseHoldVerb' : 'phaseTapVerb')}
                <KeyCaps value={keyBindings.record}/>
              </> : phaseLabel(phase, shortcuts.hold, uiLanguage)}
            </strong>
            <small>{shortcuts.hold ? tr('releaseHint') : tr('tapHint')}</small>
          </div>
          <span className="record-timer">{clock(elapsed)}</span>
          <button
            type="button"
            className={'record-action ' + (phase === 'recording' ? 'stop-action' : '')}
            disabled={isBusy}
            onClick={() => toggleRef.current()}
            title={phase === 'recording' ? tr('recTitle') : tr('startTitle')}
          >{phase === 'recording' ? <Square size={16} fill="currentColor" strokeWidth={1.5}/> : <Circle size={17} fill="currentColor" strokeWidth={1.5}/>}</button>
        </div>
        <div className="record-shortcut">{tr('shortcutLabel')} <KeyCaps value={keyBindings.record}/></div>

        <div className="drafts">
          <div className="draft-header">
            <span>{tr('rawLabel')}</span>
            <small>{tr('rawHint')}</small>
          </div>
          <textarea
            rows={3}
            value={original}
            placeholder={tr('rawPlaceholder')}
            onChange={event => {
              setOriginal(event.target.value);
              if (activeIdRef.current !== null) changeEntry(activeIdRef.current, { transcript: event.target.value });
            }}
          />
          <div className="draft-header english-header">
            <span>{tr('outputLabel')}</span>
            <small>{phase === 'processing' ? tr('outputProcessing') : tr('outputHint')}</small>
          </div>
          <textarea
            rows={4}
            value={english}
            placeholder={tr('outputPlaceholder')}
            onChange={event => {
              setEnglish(event.target.value);
              if (activeIdRef.current !== null) changeEntry(activeIdRef.current, { english: event.target.value });
            }}
          />
          <div className="draft-actions">
            <button type="button" className="secondary-btn" disabled={!hasKey || !original.trim() || inProgress} onClick={() => void rewrite()}><RefreshCw size={15} strokeWidth={2}/>{tr('retryTranslation')}</button>
            <button type="button" className="primary-btn" disabled={!english.trim()} onClick={() => void copyReply()}><ClipboardCopy size={16} strokeWidth={2}/>{tr('copyToWow')}</button>
          </div>
        </div>
      </div>}

      {tab === 'history' && <section className="history-screen">
        <div className="screen-title">
          <h1>{tr('historyTitle')}</h1>
          <p>{tr('historySub')}</p>
        </div>
        {history.length === 0 ? <div className="empty-state"><History size={32} strokeWidth={1.6}/><p>{tr('historyEmpty')}</p><span className="empty-history-shortcut">{tr('historyEmptyAction')} <KeyCaps value={keyBindings.record}/></span></div>
          : <div className="history-list">
            {history.map(item => <div className={'history-item ' + (activeId === item.id ? 'current' : '')} key={item.id}>
              <div className="history-row">
                <div className="history-title">
                  <strong>{new Date(item.createdAt).toLocaleTimeString(uiLanguage, { hour: '2-digit', minute: '2-digit' })}</strong>
                  <span>{clock(item.durationMs)} · {amount(item.transcriptionCostUsd + item.estimatedTextCostUsd)} {tr('roughly')}</span>
                </div>
                <button className="history-restore" type="button" onClick={() => selectHistoryItem(item)}>{tr('openReply')}</button>
              </div>
              <div className="history-preview">{item.english || item.transcript || tr('noTextAudio')}</div>
              <div className="history-audio">
                <audio controls src={item.url} preload="metadata" aria-label={tr('listenRecording')} />
                <button type="button" className="save-icon" title={tr('saveRecording')} onClick={() => void saveEntry(item)}><Download size={18} strokeWidth={2}/></button>
              </div>
            </div>)}
          </div>}
      </section>}

      {tab === 'settings' && <section className="settings-screen">
        <div className="screen-title">
          <h1>{tr('settingsTitle')}</h1>
          <p>{tr('settingsSub')}</p>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>{tr('languageUiLabel')}</strong></div>
          <p>{tr('languageUiDescription')}</p>
          <select className="interface-language-select" value={uiLanguagePreference} onChange={event => {
            const selected = event.target.value;
            setUiLanguagePreference(selected);
            if (selected === 'system') localStorage.removeItem('interface-language');
            else localStorage.setItem('interface-language', selected);
            const resolved = selected === 'system' ? systemLanguage : languageFromSystemLocale(selected);
            setMessage(t(resolved, 'readyMsg'));
          }}>
            <option value="system">{tr('languageSystem')}</option>
            {INTERFACE_LANGUAGES.map(language => <option value={language.value} key={language.value}>{language.label}</option>)}
          </select>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>{tr('presetTitle')}</strong></div>
          <p>{tr('presetManageHint')}</p>
          <div className="preset-actions">
            <button type="button" className="outline-btn" onClick={() => void openPresetsFolder()}>
              {tr('presetFolder')}
            </button>
            <button type="button" className="outline-btn" disabled={presetsLoading} onClick={() => void reloadPresets()}>
              <RefreshCw size={14} strokeWidth={2}/>{tr('presetReload')}
            </button>
          </div>
          {presetError && <p className="preset-error">{presetError}</p>}
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>OpenAI API</strong><span className={'connection-status ' + (hasKey ? 'connected' : 'disconnected')}><span className="connection-dot" />{(hasKey ? tr('connected') : tr('disconnected')).replace(/^[●○]\s*/, '')}</span></div>
          <p>{tr('apiKeyInfo')}</p>
          <div className="key-input-row">
            <input type="password" value={apiKeyDraft} placeholder={hasKey ? tr('apiKeyPlaceholder') : 'sk-proj-…'} autoComplete="off" onChange={event => setApiKeyDraft(event.target.value)} />
            <button type="button" disabled={!apiKeyDraft.trim() || keyBusy} onClick={() => void saveKey()}>{tr('save')}</button>
          </div>
          <p className="tiny">{tr('apiKeyDisclaimer')}</p>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>{tr('microphoneTitle')}</strong></div>
          <label className="toggle-line">
            <input type="checkbox" checked={micProcessing} disabled={inProgress} onChange={event => {
              setMicProcessing(event.target.checked);
              localStorage.setItem('mic-processing', String(event.target.checked));
            }} />
            <span>{tr('micProcessing')}<small>{tr('micProcessingHint')}</small></span>
          </label>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>{tr('overlayTitle')}</strong></div>
          <div className="setting-row"><div>{tr('moveIndicator')}<small>{tr('positionSaved')}</small></div>
            <button type="button" className="outline-btn" onClick={() => window.inCharacter.setHudMoveMode(true)}><Move size={15} strokeWidth={2}/>{tr('moveAction')}</button>
          </div>
          <div className="keyboard-description">{shortcuts.hold ? tr('hotkeyHoldHint') : tr('hotkeyTapHint')}</div>
          {!shortcuts.hold && <p className="tiny warning-text">{tr('hotkeyFallback')}</p>}
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>{tr('hotkeyTitle')}</strong></div>
          <p>{tr('hotkeyDesc')}</p>
          {(['record','panel','move'] as const).map(action => <div className="hotkey-setting-row" key={action}>
            <label>{tr(action === 'record' ? 'hotkeyRecord' : action === 'panel' ? 'hotkeyPanel' : 'hotkeyMove')}</label>
            <KeyCaps value={keyBindings[action]} />
            <button
              type="button"
              className={'shortcut-assign-btn ' + (captureAction === action ? 'capturing' : '')}
              disabled={shortcutBusy || inProgress}
              onClick={() => startCapture(action)}
              onKeyDown={event => void captureShortcut(event, action)}
              onBlur={() => {
                if (captureAction === action && !shortcutBusy) cancelCapture();
              }}
            >
              {captureAction === action ? tr('hotkeyListening') : tr('hotkeyAssign')}
            </button>
          </div>)}
          {captureAction && <p className="hotkey-capture-hint">{tr('hotkeyCaptureHint')}</p>}
          {shortcutError && <p className="hotkey-error">{shortcutError}</p>}
          <p className="tiny">{tr('hotkeyCapsNote')}</p>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>{tr('costTitle')}</strong></div>
          <div className="cost-row"><strong>{amount(sessionCost)}</strong><span>{history.length} {tr('recordingsCount')}</span></div>
          <p>{tr('costDisclaimer')}</p>
          <button className="text-link" type="button" onClick={() => void window.inCharacter.openUsage()}>{tr('openUsage')}</button>
        </div>
      </section>}
    </main>
    <footer className="bottom-bar">
      <span className={'footer-indicator ' + (phase === 'error' ? 'footer-error' : '')}>{message || tr('readyMsg')}</span>
      <button type="button" title={tr('exit')} onClick={() => window.inCharacter.quit()}>{tr('exit')}</button>
    </footer>
    </div>
  </MantineProvider>;
}
