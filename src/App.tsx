import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { INTERFACE_LANGUAGES, t, type InterfaceLanguage, type TranslationKey } from './i18n';
import { Circle, Square, X, Check, AlertCircle, Clock3, History, Settings2, MessageSquareText, ClipboardCopy, Download, Move, RefreshCw, Moon, Sun, Monitor, Trash2, Play, HardDrive, BarChart3 } from 'lucide-react';
import { MantineProvider, AppShell, ActionIcon, Badge, Button, Modal, PasswordInput, SegmentedControl, Select, Slider, Switch, Tabs, Textarea, TextInput, Stack, Group, Grid, SimpleGrid, Paper, Text, Title, Code, ThemeIcon, Divider, Box, Center } from '@mantine/core';
import { appTheme } from './theme';
import { MIN_RECORDING_MS, MIN_SIGNAL_RMS, shouldDiscardSilentRecording, type AudioLevelSummary } from './recordingPolicy';
import { languageFromSystemLocale } from './locale';

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
  id: string;
  createdAt: number;
  durationMs: number;
  transcript: string;
  english: string;
  targetLanguage: string;
  presetId: string;
  estimatedTextCostUsd: number;
  transcriptionCostUsd: number;
  recognizedWords: number;
  extension: 'webm' | 'ogg';
  audioBytes: number;
  url?: string;
};
type HistoryNumbers = {
  recordings: number;
  durationMs: number;
  words: number;
  estimatedCostUsd: number;
  audioBytes?: number;
};
type HistorySnapshot = {
  entries: Omit<RecordEntry,'url'>[];
  stored: HistoryNumbers;
  lifetime: HistoryNumbers;
};
const EMPTY_HISTORY_NUMBERS: HistoryNumbers = {
  recordings: 0, durationMs: 0, words: 0, estimatedCostUsd: 0, audioBytes: 0,
};
function readableSize(bytes: number): string {
  return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
const TRANSCRIPTION_PER_MINUTE = 0.006;
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

export default function App() {
  const [view, setView] = useState<ViewMode>('hud');
  const [tab, setTab] = useState<Tab>('rp');
  const [hudOpacity, setHudOpacity] = useState(() => {
    const raw = Number(localStorage.getItem('hud-opacity'));
    return Number.isFinite(raw) && raw >= 40 && raw <= 100 ? raw : 76;
  });
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [archiveStats, setArchiveStats] = useState<HistoryNumbers>(EMPTY_HISTORY_NUMBERS);
  const [lifetimeStats, setLifetimeStats] = useState<HistoryNumbers>(EMPTY_HISTORY_NUMBERS);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);
  const [historyConfirm, setHistoryConfirm] = useState<{ kind: 'one'; id: string } | { kind: 'age'; days: number } | { kind: 'all' } | null>(null);
  const [historyDeleteAge, setHistoryDeleteAge] = useState<string>('30');
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
  const hudRef = useRef<HTMLDivElement | null>(null);
  const urlsRef = useRef<Set<string>>(new Set());
  const loadedAudioRef = useRef<Map<string,string>>(new Map());
  const editTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEditsRef = useRef<{ id: string; changes: { transcript?: string; english?: string } } | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const toggleRef = useRef<() => void>(() => {});
  const downRef = useRef<() => void>(() => {});
  const upRef = useRef<() => void>(() => {});
  const processRef = useRef<(blob: Blob, id: string, duration: number) => Promise<void>>(async () => {});

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

  function applyHistorySnapshot(snapshot: HistorySnapshot) {
    setArchiveStats(snapshot.stored);
    setLifetimeStats(snapshot.lifetime);
    setHistory(snapshot.entries.map(entry => ({
      ...entry,
      url: loadedAudioRef.current.get(entry.id),
    })));
  }

  function changeEntry(id: string, changes: Partial<RecordEntry>) {
    setHistory(previous => previous.map(entry => entry.id === id ? { ...entry, ...changes } : entry));
  }

  function flushPendingEdits() {
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    editTimerRef.current = null;
    const pending = pendingEditsRef.current;
    pendingEditsRef.current = null;
    if (!pending) return;
    // Do not replay an old disk snapshot into a text field while the user
    // continues typing. The local UI has the newest edit already.
    void window.inCharacter.historyEdit(pending.id, pending.changes)
      .catch(error => setMessage(tr('historyError') + errorText(error, uiLanguage)));
  }

  function scheduleEdit(id: string, changes: { transcript?: string; english?: string }) {
    if (pendingEditsRef.current && pendingEditsRef.current.id !== id) flushPendingEdits();
    const previous = pendingEditsRef.current;
    pendingEditsRef.current = { id, changes: { ...(previous?.id === id ? previous.changes : {}), ...changes } };
    if (editTimerRef.current) clearTimeout(editTimerRef.current);
    editTimerRef.current = setTimeout(flushPendingEdits, 350);
  }

  processRef.current = async (blob: Blob, id: string, duration: number) => {
    if (!hasKeyRef.current) {
      setPhase('ready');
      setMessage(tr('msgNoKey'));
      return;
    }
    processingRef.current = true;
    setPhase('processing');
    setMessage(tr('msgProcessing'));
    const approximateTranscriptionCost = duration / 60000 * TRANSCRIPTION_PER_MINUTE;

    try {
      const result = await window.inCharacter.processVoice({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type,
        ...contextRef.current,
      });
      applyHistorySnapshot(await window.inCharacter.historyFinish(id, {
        transcript: result.transcript,
        english: result.translated,
        transcriptionCostUsd: approximateTranscriptionCost,
        estimatedTextCostUsd: result.estimatedTextCostUsd,
      }));
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
      // An attempted transcription may still be billed even when it fails.
      try {
        applyHistorySnapshot(await window.inCharacter.historyFinish(id, {
          transcript: '', english: '',
          transcriptionCostUsd: approximateTranscriptionCost,
          estimatedTextCostUsd: 0,
        }));
      } catch (storageError) {
        console.error('Could not save recording failure:', storageError);
      }
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
        // Persist the audio and metadata before any network processing.
        // This prevents lost history after app restarts or API errors.
        void (async () => {
          try {
            const snapshot = await window.inCharacter.historyAdd({
              bytes: new Uint8Array(await blob.arrayBuffer()),
              mimeType: blob.type,
              durationMs: duration,
              targetLanguage: contextRef.current.targetLanguage,
              presetId: contextRef.current.presetId,
            });
            applyHistorySnapshot(snapshot);
            const id = snapshot.entries[0].id;
            activeIdRef.current = id;
            setActiveId(id);
            setOriginal('');
            setEnglish('');
            setMessage(tr('msgAudioReady'));
            await processRef.current(blob, id, duration);
          } catch (error) {
            setPhase('error');
            setMessage(tr('historyError') + errorText(error, uiLanguage));
          }
        })();
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
    window.inCharacter.setHudOpacity(hudOpacity);
  }, [hudOpacity]);

  useEffect(() => {
    if (view !== 'hud') return;
    const element = hudRef.current;
    if (!element) return;
    // Measure the intrinsic width of a single line, not the viewport width.
    // Each locale/status/move-control change can resize the native window.
    const measure = () => window.inCharacter.resizeHud(Math.ceil(element.getBoundingClientRect().width));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [view, moveEnabled, phase, uiLanguage, keyBindings.record]);

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
    void window.inCharacter.historyList()
      .then(applyHistorySnapshot)
      .catch(error => setMessage(tr('historyError') + errorText(error, uiLanguage)))
      .finally(() => setHistoryLoading(false));
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
      flushPendingEdits();
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
        flushPendingEdits();
        const snapshot = await window.inCharacter.historyRewrite(activeIdRef.current, result.text, result.estimatedTextCostUsd);
        applyHistorySnapshot(snapshot);
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
    flushPendingEdits();
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
      const result = await window.inCharacter.historyExport(item.id);
      if (!result.canceled) setMessage(tr('msgSaved') + result.filePath);
    } catch (error) {
      setMessage(tr('msgSaveError') + errorText(error, uiLanguage));
    }
  }

  async function loadHistoryAudio(id: string) {
    if (loadedAudioRef.current.has(id) || audioLoadingId) return;
    setAudioLoadingId(id);
    try {
      const result = await window.inCharacter.historyReadAudio(id);
      const buffer = new ArrayBuffer(result.bytes.byteLength);
      new Uint8Array(buffer).set(result.bytes);
      const url = URL.createObjectURL(new Blob([buffer], { type: result.mimeType }));
      loadedAudioRef.current.set(id, url);
      urlsRef.current.add(url);
      changeEntry(id, { url });
    } catch (error) {
      setMessage(tr('historyError') + errorText(error, uiLanguage));
    } finally {
      setAudioLoadingId(null);
    }
  }

  async function confirmHistoryDeletion() {
    if (!historyConfirm || historyBusy || inProgress) return;
    setHistoryBusy(true);
    try {
      const target = historyConfirm;
      const snapshot = target.kind === 'one'
        ? await window.inCharacter.historyDelete(target.id)
        : await window.inCharacter.historyClear(target.kind === 'age' ? target.days : null);
      for (const [id, url] of loadedAudioRef.current) {
        if (snapshot.entries.some(item => item.id === id)) continue;
        URL.revokeObjectURL(url);
        urlsRef.current.delete(url);
        loadedAudioRef.current.delete(id);
      }
      if (activeIdRef.current && !snapshot.entries.some(item => item.id === activeIdRef.current)) {
        activeIdRef.current = null;
        setActiveId(null);
        setOriginal('');
        setEnglish('');
        setPhase('idle');
      }
      applyHistorySnapshot(snapshot);
      setMessage(tr('historyDeleted'));
      setHistoryConfirm(null);
    } catch (error) {
      setMessage(tr('historyError') + errorText(error, uiLanguage));
      // Partial cleanup may have succeeded. Reload the current persisted index.
      void window.inCharacter.historyList().then(applyHistorySnapshot).catch(console.error);
    } finally {
      setHistoryBusy(false);
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
  const sessionCost = lifetimeStats.estimatedCostUsd;
  const isBusy = phase === 'requesting' || phase === 'finalizing' || phase === 'processing';
  const inProgress = phase === 'recording' || isBusy;

  if (view === 'hud') {
    return <div ref={hudRef}
      className={'hud ' + (moveEnabled ? 'hud-move' : '')}
      onPointerDown={moveEnabled ? dragWindowStart : undefined}
      onPointerMove={moveEnabled ? dragWindowMove : undefined}
      onPointerUp={moveEnabled ? dragWindowEnd : undefined}
      onPointerCancel={moveEnabled ? dragWindowEnd : undefined}
    >
      <div className="hud-status"><StateIcon phase={phase} language={uiLanguage}/></div>
      <span className="hud-main">
        {moveEnabled ? tr('hudMoveShort') :
          phase === 'idle' ? `${tr(shortcuts.hold ? 'phaseHoldVerb' : 'phaseTapVerb')} ${keyBindings.record}` :
          phaseLabel(phase, shortcuts.hold, uiLanguage)}
      </span>
      {moveEnabled && <button type="button" className="hud-lock" title={tr('lockTitle')}
        onClick={event => { event.stopPropagation(); window.inCharacter.setHudMoveMode(false); }}>
        <Check size={15} strokeWidth={2.6}/>
      </button>}
    </div>;
  }

  return <MantineProvider theme={appTheme} forceColorScheme={effectiveTheme}>
    <Tabs value={tab} onChange={value => setTab((value || 'rp') as Tab)}>
      <AppShell className="sic-shell" header={{ height: 110 }} footer={{ height: 42 }} padding="md" withBorder={false}>
        <AppShell.Header>
          <Group h={60} px="md" gap="sm" wrap="nowrap" className="sic-drag"
            onPointerDown={dragWindowStart} onPointerMove={dragWindowMove}
            onPointerUp={dragWindowEnd} onPointerCancel={dragWindowEnd}>
            <ThemeIcon variant="filled" color="indigo" size={35} radius="md">
              <MessageSquareText size={20}/>
            </ThemeIcon>
            <Stack gap={1} style={{flex:1,minWidth:0}}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={750}>SpeakInCharacter</Text>
                <Badge size="xs" variant="light" color="gray" radius="sm">0.10.5</Badge>
              </Group>
            </Stack>
            <ActionIcon size="md" variant="subtle" color="gray" title={tr('hidePanel')}
              onClick={() => window.inCharacter.setViewMode('hud')}>
              <X size={18}/>
            </ActionIcon>
          </Group>
          <Tabs.List grow h={50} px="sm">
            <Tabs.Tab value="rp" leftSection={<MessageSquareText size={16}/>}>{tr('tabReply')}</Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<History size={16}/>}
              rightSection={history.length ? <Badge size="xs" circle variant="light" color="indigo">{history.length}</Badge> : undefined}>
              {tr('tabHistory')}
            </Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<Settings2 size={16}/>}>{tr('tabSettings')}</Tabs.Tab>
          </Tabs.List>
        </AppShell.Header>

        <AppShell.Main key={tab} className="sic-main">
          {tab === 'rp' && <Stack gap="sm">
            <Box>
              <Title order={4}>{tr('tabReply')}</Title>
            </Box>
            <Grid gap="sm">
              <Grid.Col span={5}>
                <TextInput label={tr('targetLabel')} value={replyLanguageInput} maxLength={80}
                  placeholder="English" onChange={event => {
                    setReplyLanguageInput(event.currentTarget.value);
                    localStorage.setItem('reply-language', event.currentTarget.value);
                  }}/>
              </Grid.Col>
              <Grid.Col span={7}>
                <Select label={tr('presetLabel')} value={presetId || null} placeholder={tr('presetNone')}
                  clearable searchable={presets.length > 7}
                  comboboxProps={{withinPortal:false}}
                  data={[
                    ...presets.map(item=>({value:item.id,label:localizedPresetText(item.name,uiLanguage)})),
                    ...(presetId && !selectedPreset && !presetsLoading
                      ? [{value:presetId,label:tr('presetMissing')}] : [])
                  ]}
                  onChange={value=>selectPreset(value || '')}/>
              </Grid.Col>
            </Grid>
            <Textarea label={tr('additionalContextLabel')} autosize minRows={2} maxRows={4}
              value={additionalContext} placeholder={tr('additionalContextPlaceholder')}
              onChange={event=>{
                setAdditionalContext(event.currentTarget.value);
                localStorage.setItem('additional-context',event.currentTarget.value);
              }}/>
            <Paper withBorder p="sm" radius="md">
              <Group wrap="nowrap" gap="sm">
                <StateIcon phase={phase} language={uiLanguage}/>
                <Stack gap={2} style={{flex:1,minWidth:0}}>
                  <Group gap="xs" wrap="wrap">
                    <Text fw={650} size="sm">
                      {phase === 'idle' ? tr(shortcuts.hold ? 'phaseHoldVerb' : 'phaseTapVerb') : phaseLabel(phase,shortcuts.hold,uiLanguage)}
                    </Text>
                    {phase === 'idle' && <Code>{keyBindings.record}</Code>}
                  </Group>
                </Stack>
                <Text ff="monospace" fw={650} size="sm" c="dimmed">{clock(elapsed)}</Text>
                <ActionIcon size="lg" variant="light" color="red" disabled={isBusy}
                  title={phase==='recording'?tr('recTitle'):tr('startTitle')}
                  onClick={()=>toggleRef.current()}>
                  {phase==='recording' ? <Square size={17} fill="currentColor"/> : <Circle size={17} fill="currentColor"/>}
                </ActionIcon>
              </Group>
            </Paper>
            <Textarea label={tr('rawLabel')} autosize minRows={2} maxRows={4}
              value={original} placeholder={tr('rawPlaceholder')}
              onChange={event=>{
                setOriginal(event.currentTarget.value);
                if(activeIdRef.current!==null){
                  changeEntry(activeIdRef.current,{transcript:event.currentTarget.value});
                  scheduleEdit(activeIdRef.current,{transcript:event.currentTarget.value});
                }
              }}/>
            <Textarea label={tr('outputLabel')}
              autosize minRows={3} maxRows={5}
              value={english} placeholder={tr('outputPlaceholder')}
              onChange={event=>{
                setEnglish(event.currentTarget.value);
                if(activeIdRef.current!==null){
                  changeEntry(activeIdRef.current,{english:event.currentTarget.value});
                  scheduleEdit(activeIdRef.current,{english:event.currentTarget.value});
                }
              }}/>
            <Group grow gap="sm" wrap="nowrap">
              <Button variant="default" leftSection={<RefreshCw size={15}/>}
                disabled={!hasKey || !original.trim() || inProgress}
                onClick={()=>void rewrite()}>{tr('retryTranslation')}</Button>
              <Button color="indigo" leftSection={<ClipboardCopy size={15}/>}
                disabled={!english.trim()} onClick={()=>void copyReply()}>{tr('copyToWow')}</Button>
            </Group>
          </Stack>}

          {tab === 'history' && <Stack gap="md">
            <Box>
              <Title order={4}>{tr('historyTitle')}</Title>
            </Box>
            <Text size="sm" fw={700}>{tr('historyLifetime')}</Text>
            <SimpleGrid cols={2} spacing="xs">
              {([
                [lifetimeStats.recordings.toLocaleString(uiLanguage),tr('historyStatRecordings')],
                [(lifetimeStats.durationMs/60000).toFixed(1),tr('historyStatMinutes')],
                [lifetimeStats.words.toLocaleString(uiLanguage),tr('historyStatWords')],
                [amount(lifetimeStats.estimatedCostUsd),tr('historyStatCost')],
              ] as [string,string][]).map(([value,label])=><Paper withBorder p="sm" radius="md" key={label}>
                <Text size="lg" fw={750} ff="monospace">{value}</Text>
                <Text c="dimmed" size="xs">{label}</Text>
              </Paper>)}
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              <HardDrive size={13} style={{verticalAlign:'middle',marginRight:5}}/>
              {tr('historyOnDisk')}: {archiveStats.recordings} · {readableSize(archiveStats.audioBytes || 0)}
            </Text>
            <Divider label={tr('historyRecordings')} labelPosition="left"/>
            {historyLoading ? <Text c="dimmed" size="sm">{tr('historyLoading')}</Text> :
              history.length===0 ? <Center py="xl"><Stack align="center" gap="xs">
                <History size={28} strokeWidth={1.5}/>
                <Text size="sm" c="dimmed">{tr('historyEmpty')}</Text>
                <Code>{keyBindings.record}</Code>
              </Stack></Center> :
              <Stack gap="xs">
                {history.map((item,index)=><Stack gap="xs" key={item.id}>
                  {(index===0 || new Date(history[index-1].createdAt).toDateString()!==new Date(item.createdAt).toDateString()) &&
                    <Text size="xs" fw={750} c="dimmed" mt="xs">{new Date(item.createdAt).toLocaleDateString(uiLanguage,{day:'numeric',month:'long',year:'numeric'})}</Text>}
                  <Paper withBorder p="sm" radius="md">
                    <Stack gap="xs">
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Box style={{minWidth:0}}>
                          <Text size="sm" fw={700}>{new Date(item.createdAt).toLocaleTimeString(uiLanguage,{hour:'2-digit',minute:'2-digit'})}</Text>
                          <Text c="dimmed" size="xs">{clock(item.durationMs)} · {item.recognizedWords} {tr('historyWordsShort')} · {amount(item.transcriptionCostUsd+item.estimatedTextCostUsd)}</Text>
                        </Box>
                        <Group gap={4} wrap="nowrap">
                          <Button variant="subtle" size="xs" onClick={()=>selectHistoryItem(item)}>{tr('openReply')}</Button>
                          <ActionIcon variant="subtle" color="red" disabled={historyBusy || inProgress}
                            title={tr('historyDeleteOne')} onClick={()=>setHistoryConfirm({kind:'one',id:item.id})}><Trash2 size={16}/></ActionIcon>
                        </Group>
                      </Group>
                      <Text size="xs" lineClamp={2} c="dimmed">{item.english || item.transcript || tr('noTextAudio')}</Text>
                      <Group gap="xs" wrap="nowrap">
                        {item.url ?
                          <audio controls src={item.url} preload="metadata" aria-label={tr('listenRecording')} className="sic-audio"/> :
                          <Button size="xs" variant="default" fullWidth leftSection={<Play size={14}/>}
                            loading={audioLoadingId===item.id} onClick={()=>void loadHistoryAudio(item.id)}>{tr('historyListen')}</Button>}
                        <ActionIcon size="lg" variant="default" title={tr('saveRecording')}
                          onClick={()=>void saveEntry(item)}><Download size={17}/></ActionIcon>
                      </Group>
                    </Stack>
                  </Paper>
                </Stack>)}
              </Stack>}
            <Divider/>
            <Paper withBorder radius="md" p="sm">
              <Stack gap="xs">
                <Text size="sm" fw={700}>{tr('historyCleanupTitle')}</Text>
                <Group align="end" wrap="nowrap" grow>
                  <Select aria-label={tr('historyRetentionLabel')} value={historyDeleteAge}
                    comboboxProps={{withinPortal:false}} allowDeselect={false}
                    data={[{value:'7',label:tr('historyOlder7')},{value:'30',label:tr('historyOlder30')},{value:'90',label:tr('historyOlder90')}]}
                    onChange={value=>setHistoryDeleteAge(value || '30')}/>
                  <Button variant="default" disabled={historyBusy || inProgress || !history.length}
                    onClick={()=>setHistoryConfirm({kind:'age',days:Number(historyDeleteAge)})}>{tr('historyRemoveOld')}</Button>
                </Group>
                <Button fullWidth color="red" variant="light" leftSection={<Trash2 size={15}/>}
                  disabled={historyBusy || inProgress || (!history.length && !lifetimeStats.recordings)}
                  onClick={()=>setHistoryConfirm({kind:'all'})}>{tr('historyDeleteAll')}</Button>
              </Stack>
            </Paper>
          </Stack>}

          {tab === 'settings' && <Stack gap="sm">
            <Box>
              <Title order={4}>{tr('settingsTitle')}</Title>
            </Box>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">{tr('themeTitle')}</Text>
                <SegmentedControl fullWidth size="sm" value={appearance}
                  onChange={value=>{
                    const choice=value as Appearance;
                    setAppearance(choice);
                    localStorage.setItem('appearance',choice);
                  }}
                  data={[{value:'system',label:tr('themeSystem')},{value:'dark',label:tr('themeDark')},{value:'light',label:tr('themeLight')}]}/>
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">{tr('languageUiLabel')}</Text>
                <Select value={uiLanguagePreference} allowDeselect={false} comboboxProps={{withinPortal:false}}
                  data={[{value:'system',label:tr('languageSystem')},...INTERFACE_LANGUAGES.map(language=>({value:language.value,label:language.label}))]}
                  onChange={value=>{
                    const selected=value || 'system';
                    setUiLanguagePreference(selected);
                    if(selected==='system')localStorage.removeItem('interface-language');
                    else localStorage.setItem('interface-language',selected);
                    setMessage(t(selected==='system'?systemLanguage:languageFromSystemLocale(selected),'readyMsg'));
                  }}/>
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">{tr('presetTitle')}</Text>
                <Group grow gap="sm" wrap="nowrap">
                  <Button variant="default" onClick={()=>void openPresetsFolder()}>{tr('presetFolder')}</Button>
                  <Button variant="default" leftSection={<RefreshCw size={14}/>} disabled={presetsLoading}
                    onClick={()=>void reloadPresets()}>{tr('presetReload')}</Button>
                </Group>
                {presetError && <Text c="red" size="xs">{presetError}</Text>}
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group justify="space-between" gap="xs">
                  <Text fw={700} size="sm">OpenAI API</Text>
                  <Badge variant="light" color={hasKey?'green':'orange'} size="sm">
                    {hasKey?tr('connected'):tr('disconnected')}
                  </Badge>
                </Group>
                <Group align="end" wrap="nowrap" gap="xs">
                  <PasswordInput style={{flex:1,minWidth:0}} autoComplete="off" value={apiKeyDraft}
                    placeholder={hasKey?tr('apiKeyPlaceholder'):'sk-proj-…'}
                    onChange={event=>setApiKeyDraft(event.currentTarget.value)}/>
                  <Button disabled={!apiKeyDraft.trim() || keyBusy} onClick={()=>void saveKey()}>{tr('save')}</Button>
                </Group>
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Switch label={tr('micProcessing')}
                checked={micProcessing} disabled={inProgress}
                onChange={event=>{
                  setMicProcessing(event.currentTarget.checked);
                  localStorage.setItem('mic-processing',String(event.currentTarget.checked));
                }}/>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">{tr('overlayTitle')}</Text>
                <Group justify="space-between" wrap="nowrap" align="center">
                  <Box style={{minWidth:0}}>
                    <Text size="sm">{tr('moveIndicator')}</Text>
                  </Box>
                  <Button variant="default" leftSection={<Move size={15}/>}
                    onClick={()=>window.inCharacter.setHudMoveMode(true)}>{tr('moveAction')}</Button>
                </Group>
                <Stack gap={6}>
                  <Group justify="space-between" align="baseline" gap="xs">
                    <Text size="sm">{tr('hudOpacityLabel')}</Text>
                    <Text size="sm" fw={700} ff="monospace">{hudOpacity}%</Text>
                  </Group>
                  <Slider
                    aria-label={tr('hudOpacityLabel')}
                    color="indigo"
                    min={40}
                    max={100}
                    step={5}
                    value={hudOpacity}
                    marks={[{ value: 40, label: '40%' }, { value: 100, label: '100%' }]}
                    mb="sm"
                    onChange={value => {
                      setHudOpacity(value);
                      localStorage.setItem('hud-opacity', String(value));
                    }}
                  />
                </Stack>
                {!shortcuts.hold && <Text size="xs" c="orange">{tr('hotkeyFallback')}</Text>}
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text size="sm" fw={700}>{tr('hotkeyTitle')}</Text>
                {(['record','panel','move'] as const).map(action=><Group key={action} justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="xs" style={{flex:1}}>{tr(action==='record'?'hotkeyRecord':action==='panel'?'hotkeyPanel':'hotkeyMove')}</Text>
                  <Code>{keyBindings[action]}</Code>
                  <Button variant={captureAction===action?'filled':'default'} size="xs"
                    disabled={shortcutBusy || inProgress}
                    onClick={()=>startCapture(action)}
                    onKeyDown={event=>void captureShortcut(event,action)}
                    onBlur={()=>{if(captureAction===action && !shortcutBusy)cancelCapture();}}>
                    {captureAction===action?tr('hotkeyListening'):tr('hotkeyAssign')}
                  </Button>
                </Group>)}
                {captureAction && <Text size="xs" c="indigo">{tr('hotkeyCaptureHint')}</Text>}
                {shortcutError && <Text size="xs" c="red">{shortcutError}</Text>}
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Text size="sm" fw={700}>{tr('costTitle')}</Text>
                <Group justify="space-between" align="center">
                  <Title order={4}>{amount(sessionCost)}</Title>
                  <Text size="xs" c="dimmed">{lifetimeStats.recordings} {tr('recordingsCount')}</Text>
                </Group>
                <Button variant="subtle" size="xs" onClick={()=>void window.inCharacter.openUsage()}>{tr('openUsage')}</Button>
              </Stack>
            </Paper>
          </Stack>}
        </AppShell.Main>
        <AppShell.Footer className="sic-footer">
          <Group px="sm" h="100%" justify="space-between" gap="sm" wrap="nowrap">
            <Text size="xs" c={phase==='error'?'red':'dimmed'} truncate style={{flex:1,minWidth:0}}>
              {message || tr('readyMsg')}
            </Text>
            <Button size="compact-xs" variant="subtle" color="gray" onClick={()=>window.inCharacter.quit()}>{tr('exit')}</Button>
          </Group>
        </AppShell.Footer>
      </AppShell>

      <Modal opened={historyConfirm!==null} onClose={()=>!historyBusy && setHistoryConfirm(null)}
        title={tr('historyConfirmTitle')} centered withinPortal={false} size="sm">
        <Stack gap="sm">
          <Text size="sm">{historyConfirm?.kind==='one' ? tr('historyConfirmOne') :
            historyConfirm?.kind==='age' ? tr('historyConfirmOld') : tr('historyConfirmAll')}</Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={historyBusy} onClick={()=>setHistoryConfirm(null)}>{tr('historyCancel')}</Button>
            <Button color="red" loading={historyBusy} onClick={()=>void confirmHistoryDeletion()}>{tr('historyConfirmDelete')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Tabs>
  </MantineProvider>;

}
