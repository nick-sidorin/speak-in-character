import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { INTERFACE_LANGUAGES, REPLY_LANGUAGES, t, type InterfaceLanguage, type ReplyLanguageChoice, type TranslationKey } from './i18n';

type ViewMode = 'hud' | 'panel';
type Tab = 'rp' | 'history' | 'settings';
type Phase = 'idle' | 'requesting' | 'recording' | 'finalizing' | 'processing' | 'ready' | 'error';

type RecordEntry = {
  id: number;
  createdAt: number;
  blob: Blob;
  url: string;
  durationMs: number;
  transcript: string;
  english: string;
  targetLanguage: string;
  estimatedTextCostUsd: number;
  transcriptionCostUsd: number;
};

const TRANSCRIPTION_PER_MINUTE = 0.006;
const MAX_HISTORY = 15;

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
  if (phase === 'ready') return <span className="state-check" aria-label={t(language, 'iconReady')}>✓</span>;
  if (phase === 'error') return <span className="state-error" aria-label={t(language, 'iconError')}>!</span>;
  return <span className={phase === 'recording' ? 'state-dot recording' : 'state-dot'} />;
}

export default function App() {
  const [view, setView] = useState<ViewMode>('hud');
  const [tab, setTab] = useState<Tab>('rp');
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [micProcessing, setMicProcessing] = useState(() => localStorage.getItem('mic-processing') === 'true');
  const [character, setCharacter] = useState(() => localStorage.getItem('character') || '');
  const [situation, setSituation] = useState(() => localStorage.getItem('situation') || '');
  const [uiLanguage, setUiLanguage] = useState<InterfaceLanguage>(() => {
    const stored = localStorage.getItem('interface-language');
    return INTERFACE_LANGUAGES.find(item => item.value === stored)?.value ?? 'ru';
  });
  const [replyChoice, setReplyChoice] = useState<ReplyLanguageChoice>(() => {
    const stored = localStorage.getItem('reply-language');
    if (stored === '__other__') return '__other__';
    return REPLY_LANGUAGES.find(item => item.value === stored)?.value ?? 'English';
  });
  const [customReplyLanguage, setCustomReplyLanguage] = useState(() => localStorage.getItem('custom-reply-language') || '');
  const replyLanguage = replyChoice === '__other__' ? customReplyLanguage.trim() : replyChoice;
  const tr = (key: TranslationKey) => t(uiLanguage, key);
  const [original, setOriginal] = useState('');
  const [english, setEnglish] = useState('');
  const [history, setHistory] = useState<RecordEntry[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [moveEnabled, setMoveEnabled] = useState(false);
  const [shortcuts, setShortcuts] = useState({ recording: true, panel: true, move: true, hold: false });

  const phaseRef = useRef<Phase>('idle');
  const processingRef = useRef(false);
  const hasKeyRef = useRef(false);
  const contextRef = useRef({ character, situation, targetLanguage: replyLanguage });
  const micRef = useRef(micProcessing);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
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

  contextRef.current = { character, situation, targetLanguage: replyLanguage };
  micRef.current = micProcessing;
  hasKeyRef.current = hasKey;

  function setPhase(next: Phase) {
    phaseRef.current = next;
    setPhaseState(next);
  }

  function stopClock() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
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

    setElapsed(Date.now() - startedRef.current);
    stopClock();
    setPhase('finalizing');
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
    setOriginal('');
    setEnglish('');
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

      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        stopClock();
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        processingRef.current = false;
        setPhase('error');
        setMessage(tr('msgMicError'));
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) {
          setPhase('error');
          setMessage(tr('msgEmpty'));
          return;
        }
        const url = URL.createObjectURL(blob);
        urlsRef.current.add(url);
        const id = ++idCounterRef.current;
        const duration = Date.now() - startedRef.current;
        const item: RecordEntry = {
          id,
          url,
          blob,
          createdAt: Date.now(),
          durationMs: duration,
          transcript: '',
          english: '',
          targetLanguage: contextRef.current.targetLanguage,
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
    window.inCharacter.hasApiKey().then(value => setHasKey(value)).catch(() => setHasKey(false));
    const offToggle = window.inCharacter.onToggleRecording(() => toggleRef.current());
    const offDown = window.inCharacter.onHoldKeyDown(() => downRef.current());
    const offUp = window.inCharacter.onHoldKeyUp(() => upRef.current());
    const offMode = window.inCharacter.onViewModeChanged(mode => setView(mode));
    const offMove = window.inCharacter.onHudMoveModeChanged(value => setMoveEnabled(value));
    const offShortcuts = window.inCharacter.onShortcutStatus(value => setShortcuts(value));
    return () => {
      offToggle();
      offDown();
      offUp();
      offMode();
      offMove();
      offShortcuts();
      stopClock();
      streamRef.current?.getTracks().forEach(track => track.stop());
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  async function saveKey() {
    if (!keyDraft.trim()) return;
    setKeyBusy(true);
    try {
      await window.inCharacter.saveApiKey(keyDraft);
      setKeyDraft('');
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
    const known = REPLY_LANGUAGES.some(language => language.value === item.targetLanguage);
    const choice = known ? item.targetLanguage as ReplyLanguageChoice : '__other__';
    setReplyChoice(choice);
    localStorage.setItem('reply-language', choice);
    if (!known) {
      setCustomReplyLanguage(item.targetLanguage);
      localStorage.setItem('custom-reply-language', item.targetLanguage);
    }
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
        <div className="hud-brand">INCHARACTER <span>PREVIEW</span></div>
        <div className="hud-main">
          {moveEnabled ? tr('hudMove') : phaseLabel(phase, shortcuts.hold, uiLanguage)}
          {phase === 'recording' && <span className="hud-timer">{clock(elapsed)}</span>}
        </div>
        <div className="hud-hint">{moveEnabled ? tr('hudLock') : tr('hudHint')}</div>
      </div>
      {moveEnabled && <button type="button" className="hud-lock" title={tr('lockTitle')} onClick={() => window.inCharacter.setHudMoveMode(false)}>✓</button>}
    </div>;
  }

  return <div className="shell">
    <header
      className="topbar"
      onPointerDown={dragWindowStart}
      onPointerMove={dragWindowMove}
      onPointerUp={dragWindowEnd}
      onPointerCancel={dragWindowEnd}
    >
      <div className="monogram">ic</div>
      <div className="brand">
        <div className="brand-name">InCharacter <span>0.3.1</span></div>
        <div className="brand-tag">Speak naturally. Stay in character.</div>
      </div>
      <button className="window-close" title={tr('hidePanel')} type="button" onClick={() => window.inCharacter.setViewMode('hud')}>×</button>
    </header>

    <nav className="tabs" aria-label={tr('tabsAria')}>
      <button type="button" className={tab === 'rp' ? 'selected' : ''} onClick={() => setTab('rp')}>✦ <span>{tr('tabReply')}</span></button>
      <button type="button" className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}>◷ <span>{tr('tabHistory')}</span>{history.length > 0 && <small>{history.length}</small>}</button>
      <button type="button" className={tab === 'settings' ? 'selected' : ''} onClick={() => setTab('settings')}>⚙ <span>{tr('tabSettings')}</span></button>
    </nav>

    <main className="content">
      {tab === 'rp' && <div className="rp-screen">
        <div className="section-intro">
          <h1>{tr('heroTitle')}</h1>
          <p>{tr('heroSub')}</p>
        </div>

        <div className="target-language">
          <label htmlFor="reply-language">{tr('targetLabel')}</label>
          <select
            id="reply-language"
            value={replyChoice}
            onChange={event => {
              const value = event.target.value as ReplyLanguageChoice;
              setReplyChoice(value);
              localStorage.setItem('reply-language', value);
            }}
          >
            {REPLY_LANGUAGES.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
            <option value="__other__">{tr('otherTarget')}</option>
          </select>
          {replyChoice === '__other__' && <input
            type="text"
            maxLength={80}
            value={customReplyLanguage}
            placeholder={tr('targetCustomPlaceholder')}
            onChange={event => {
              setCustomReplyLanguage(event.target.value);
              localStorage.setItem('custom-reply-language', event.target.value);
            }}
          />}
        </div>
        <div className="context-fields">
          <label>
            <span>{tr('charLabel')}</span>
            <input value={character} placeholder="Corvin Sidwell, human, Stormwind…" onChange={event => {
              setCharacter(event.target.value);
              localStorage.setItem('character', event.target.value);
            }} />
          </label>
          <label>
            <span>{tr('situLabel')}</span>
            <input value={situation} placeholder="Goldshire, talking to Borin…" onChange={event => {
              setSituation(event.target.value);
              localStorage.setItem('situation', event.target.value);
            }} />
          </label>
        </div>

        <div className={'record-strip ' + (phase === 'recording' ? 'record-active' : '')}>
          <div className="status-figure"><StateIcon phase={phase} /></div>
          <div className="record-label">
            <strong>{phaseLabel(phase, shortcuts.hold, uiLanguage)}</strong>
            <small>{shortcuts.hold ? tr('releaseHint') : tr('tapHint')}</small>
          </div>
          <span className="record-timer">{clock(elapsed)}</span>
          <button
            type="button"
            className={'record-action ' + (phase === 'recording' ? 'stop-action' : '')}
            disabled={isBusy}
            onClick={() => toggleRef.current()}
            title={phase === 'recording' ? tr('recTitle') : tr('startTitle')}
          >{phase === 'recording' ? '■' : '●'}</button>
        </div>
        <div className="record-shortcut">{tr('shortcutLabel')} <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd></div>

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
            <button type="button" className="secondary-btn" disabled={!hasKey || !original.trim() || inProgress} onClick={() => void rewrite()}>↻ {tr('retryTranslation')}</button>
            <button type="button" className="primary-btn" disabled={!english.trim()} onClick={() => void copyReply()}>▣ {tr('copyToWow')}</button>
          </div>
        </div>
      </div>}

      {tab === 'history' && <section className="history-screen">
        <div className="screen-title">
          <h1>{tr('historyTitle')}</h1>
          <p>{tr('historySub')}</p>
        </div>
        {history.length === 0 ? <div className="empty-state">◷<p>{tr('historyEmpty')}</p><span>{tr('historyEmptyHint')}</span></div>
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
                <button type="button" className="save-icon" title={tr('saveRecording')} onClick={() => void saveEntry(item)}>↓</button>
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
          <select className="interface-language-select" value={uiLanguage} onChange={event => {
            const selected = event.target.value as InterfaceLanguage;
            setUiLanguage(selected);
            localStorage.setItem('interface-language', selected);
            setMessage(t(selected, 'readyMsg'));
          }}>
            {INTERFACE_LANGUAGES.map(language => <option value={language.value} key={language.value}>{language.label}</option>)}
          </select>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>OpenAI API</strong><span className={hasKey ? 'connected' : 'disconnected'}>{hasKey ? tr('connected') : tr('disconnected')}</span></div>
          <p>{tr('apiKeyInfo')}</p>
          <div className="key-input-row">
            <input type="password" value={keyDraft} placeholder={hasKey ? tr('apiKeyPlaceholder') : 'sk-proj-…'} autoComplete="off" onChange={event => setKeyDraft(event.target.value)} />
            <button type="button" disabled={!keyDraft.trim() || keyBusy} onClick={() => void saveKey()}>{tr('save')}</button>
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
            <button type="button" className="outline-btn" onClick={() => window.inCharacter.setHudMoveMode(true)}>{tr('moveAction')}</button>
          </div>
          <div className="keyboard-description">{shortcuts.hold ? tr('keyboardHold') : tr('keyboardTap')}</div>
          {!shortcuts.hold && <p className="tiny warning-text">{tr('hotkeyFallback')}</p>}
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
  </div>;
}
