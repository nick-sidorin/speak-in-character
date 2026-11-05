import { useEffect, useRef, useState, type PointerEvent } from 'react';

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

function errorText(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
    return 'Нет доступа к микрофону. Проверь разрешения Windows.';
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка. Попробуй ещё раз.';
}

function phaseLabel(phase: Phase, hold: boolean): string {
  if (phase === 'recording') return 'Записываю речь';
  if (phase === 'requesting') return 'Подключаю микрофон';
  if (phase === 'finalizing') return 'Завершаю запись';
  if (phase === 'processing') return 'Распознаю и перевожу…';
  if (phase === 'ready') return 'Реплика готова';
  if (phase === 'error') return 'Нужна проверка';
  return hold ? 'Удерживай Ctrl + Shift + Space' : 'Нажми Ctrl + Shift + Space';
}

function StateIcon({ phase }: { phase: Phase }) {
  if (phase === 'processing' || phase === 'requesting' || phase === 'finalizing') {
    return <span className="state-spinner" aria-label="Обработка" />;
  }
  if (phase === 'ready') return <span className="state-check" aria-label="Готово">✓</span>;
  if (phase === 'error') return <span className="state-error" aria-label="Ошибка">!</span>;
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
  const [original, setOriginal] = useState('');
  const [english, setEnglish] = useState('');
  const [history, setHistory] = useState<RecordEntry[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [message, setMessage] = useState('Готов к разговору.');
  const [moveEnabled, setMoveEnabled] = useState(false);
  const [shortcuts, setShortcuts] = useState({ recording: true, panel: true, move: true, hold: false });

  const phaseRef = useRef<Phase>('idle');
  const processingRef = useRef(false);
  const hasKeyRef = useRef(false);
  const contextRef = useRef({ character, situation });
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

  contextRef.current = { character, situation };
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
      setMessage('Аудио записано. Подключи OpenAI в настройках, чтобы распознать речь.');
      return;
    }
    processingRef.current = true;
    setPhase('processing');
    setMessage('Обработка в OpenAI…');
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
        setMessage('Речь распознана, но перевод не получен. Исправь текст и повтори перевод.');
      } else {
        setPhase('ready');
        setMessage('Готово! Английская реплика уже в буфере обмена.');
      }
    } catch (error) {
      setPhase('error');
      setMessage('OpenAI: ' + errorText(error));
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
    pendingReleaseRef.current = false;
    setOriginal('');
    setEnglish('');
    setElapsed(0);
    setPhase('requesting');
    setMessage('Запрашиваю доступ к микрофону…');

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
        setMessage('Ошибка записи микрофона.');
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) {
          setPhase('error');
          setMessage('Запись пустая, попробуй ещё раз.');
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
          estimatedTextCostUsd: 0,
          transcriptionCostUsd: 0,
        };
        setHistory(previous => [item, ...previous].slice(0, MAX_HISTORY));
        activeIdRef.current = id;
        setActiveId(id);
        setMessage('Запись готова.');
        void processRef.current(blob, id, duration);
      };
      recorder.start(250);
      startedRef.current = Date.now();
      setPhase('recording');
      setMessage('Записываю…');
      timerRef.current = setInterval(() => setElapsed(Date.now() - startedRef.current), 120);
      if (pendingReleaseRef.current) {
        setTimeout(() => stopRef.current(), 160);
      }
    } catch (error) {
      stopClock();
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setPhase('error');
      setMessage(errorText(error));
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
      setMessage('API-ключ сохранён в защищённом хранилище Windows.');
    } catch (error) {
      setMessage('Не удалось сохранить ключ: ' + errorText(error));
    } finally {
      setKeyBusy(false);
    }
  }

  async function rewrite() {
    if (!original.trim() || processingRef.current) return;
    processingRef.current = true;
    setPhase('processing');
    setMessage('Перевожу исправленный текст…');
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
      setMessage('Перевод обновлён и скопирован.');
    } catch (error) {
      setPhase('error');
      setMessage('Перевод: ' + errorText(error));
    } finally {
      processingRef.current = false;
    }
  }

  async function copyReply() {
    if (!english.trim()) return;
    await window.inCharacter.copyText(english);
    setMessage('Реплика скопирована. Вставь её в чат WoW через Ctrl+V.');
  }

  function selectHistoryItem(item: RecordEntry) {
    activeIdRef.current = item.id;
    setActiveId(item.id);
    setOriginal(item.transcript);
    setEnglish(item.english);
    setTab('rp');
  }

  async function saveEntry(item: RecordEntry) {
    try {
      const extension = item.blob.type.includes('ogg') ? 'ogg' : 'webm';
      const result = await window.inCharacter.saveRecording({
        bytes: new Uint8Array(await item.blob.arrayBuffer()),
        extension,
      });
      if (!result.canceled) setMessage('Запись сохранена: ' + result.filePath);
    } catch (error) {
      setMessage('Сохранение: ' + errorText(error));
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
      <div className="hud-status"><StateIcon phase={phase} /></div>
      <div className="hud-text">
        <div className="hud-brand">INCHARACTER <span>PREVIEW</span></div>
        <div className="hud-main">
          {moveEnabled ? 'Перетащи окно · закрепи ✓' : phaseLabel(phase, shortcuts.hold)}
          {phase === 'recording' && <span className="hud-timer">{clock(elapsed)}</span>}
        </div>
        <div className="hud-hint">{moveEnabled ? 'Ctrl + Shift + M · Закрепить' : 'Ctrl + Shift + Space · Голос  |  Ctrl + Shift + O · Панель'}</div>
      </div>
      {moveEnabled && <button type="button" className="hud-lock" title="Закрепить" onClick={() => window.inCharacter.setHudMoveMode(false)}>✓</button>}
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
        <div className="brand-name">InCharacter <span>0.3.0</span></div>
        <div className="brand-tag">Speak naturally. Stay in character.</div>
      </div>
      <button className="window-close" title="Скрыть панель" type="button" onClick={() => window.inCharacter.setViewMode('hud')}>×</button>
    </header>

    <nav className="tabs" aria-label="Разделы">
      <button type="button" className={tab === 'rp' ? 'selected' : ''} onClick={() => setTab('rp')}>✦ <span>Реплика</span></button>
      <button type="button" className={tab === 'history' ? 'selected' : ''} onClick={() => setTab('history')}>◷ <span>История</span>{history.length > 0 && <small>{history.length}</small>}</button>
      <button type="button" className={tab === 'settings' ? 'selected' : ''} onClick={() => setTab('settings')}>⚙ <span>Настройки</span></button>
    </nav>

    <main className="content">
      {tab === 'rp' && <div className="rp-screen">
        <div className="section-intro">
          <h1>Говори свободно.</h1>
          <p>Русский, English или всё сразу — реплика получится на английском.</p>
        </div>

        <div className="context-fields">
          <label>
            <span>Персонаж / манера речи</span>
            <input value={character} placeholder="Corvin Sidwell, human, Stormwind…" onChange={event => {
              setCharacter(event.target.value);
              localStorage.setItem('character', event.target.value);
            }} />
          </label>
          <label>
            <span>Ситуация / названия</span>
            <input value={situation} placeholder="Goldshire, talking to Borin…" onChange={event => {
              setSituation(event.target.value);
              localStorage.setItem('situation', event.target.value);
            }} />
          </label>
        </div>

        <div className={'record-strip ' + (phase === 'recording' ? 'record-active' : '')}>
          <div className="status-figure"><StateIcon phase={phase} /></div>
          <div className="record-label">
            <strong>{phaseLabel(phase, shortcuts.hold)}</strong>
            <small>{shortcuts.hold ? 'Отпусти сочетание, чтобы закончить запись' : 'Нажми сочетание ещё раз, чтобы закончить'}</small>
          </div>
          <span className="record-timer">{clock(elapsed)}</span>
          <button
            type="button"
            className={'record-action ' + (phase === 'recording' ? 'stop-action' : '')}
            disabled={isBusy}
            onClick={() => toggleRef.current()}
            title={phase === 'recording' ? 'Завершить запись' : 'Записать голос'}
          >{phase === 'recording' ? '■' : '●'}</button>
        </div>
        <div className="record-shortcut">Горячая клавиша: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd></div>

        <div className="drafts">
          <div className="draft-header">
            <span>Твоя речь</span>
            <small>Расшифровку можно исправить</small>
          </div>
          <textarea
            rows={3}
            value={original}
            placeholder="После записи здесь появятся твои слова…"
            onChange={event => {
              setOriginal(event.target.value);
              if (activeIdRef.current !== null) changeEntry(activeIdRef.current, { transcript: event.target.value });
            }}
          />
          <div className="draft-header english-header">
            <span>Реплика на английском</span>
            <small>{phase === 'processing' ? 'Перевожу…' : 'Можно отредактировать'}</small>
          </div>
          <textarea
            rows={4}
            value={english}
            placeholder="Ready for the conversation…"
            onChange={event => {
              setEnglish(event.target.value);
              if (activeIdRef.current !== null) changeEntry(activeIdRef.current, { english: event.target.value });
            }}
          />
          <div className="draft-actions">
            <button type="button" className="secondary-btn" disabled={!hasKey || !original.trim() || inProgress} onClick={() => void rewrite()}>↻ Перевести снова</button>
            <button type="button" className="primary-btn" disabled={!english.trim()} onClick={() => void copyReply()}>▣ Копировать для WoW</button>
          </div>
        </div>
      </div>}

      {tab === 'history' && <section className="history-screen">
        <div className="screen-title">
          <h1>История сессии</h1>
          <p>Последние записи и реплики. История исчезнет после выхода из приложения.</p>
        </div>
        {history.length === 0 ? <div className="empty-state">◷<p>Здесь пока нет записей.</p><span>Произнеси первую реплику через Ctrl + Shift + Space.</span></div>
          : <div className="history-list">
            {history.map(item => <div className={'history-item ' + (activeId === item.id ? 'current' : '')} key={item.id}>
              <div className="history-row">
                <div className="history-title">
                  <strong>{new Date(item.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong>
                  <span>{clock(item.durationMs)} · {amount(item.transcriptionCostUsd + item.estimatedTextCostUsd)} приблизительно</span>
                </div>
                <button className="history-restore" type="button" onClick={() => selectHistoryItem(item)}>Открыть реплику</button>
              </div>
              <div className="history-preview">{item.english || item.transcript || 'Аудиозапись без текста'}</div>
              <div className="history-audio">
                <audio controls src={item.url} preload="metadata" aria-label="Прослушать запись" />
                <button type="button" className="save-icon" title="Сохранить аудиозапись" onClick={() => void saveEntry(item)}>↓</button>
              </div>
            </div>)}
          </div>}
      </section>}

      {tab === 'settings' && <section className="settings-screen">
        <div className="screen-title">
          <h1>Настройки</h1>
          <p>Настраивай один раз, а потом просто разговаривай.</p>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>OpenAI API</strong><span className={hasKey ? 'connected' : 'disconnected'}>{hasKey ? '● Подключено' : '○ Не подключено'}</span></div>
          <p>Ключ сохраняется локально в защищённом хранилище Windows.</p>
          <div className="key-input-row">
            <input type="password" value={keyDraft} placeholder={hasKey ? 'Введите новый ключ для замены' : 'sk-proj-…'} autoComplete="off" onChange={event => setKeyDraft(event.target.value)} />
            <button type="button" disabled={!keyDraft.trim() || keyBusy} onClick={() => void saveKey()}>Сохранить</button>
          </div>
          <p className="tiny">Записи отправляются в OpenAI только после добавления ключа. Оплата API отдельно от ChatGPT.</p>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>Микрофон</strong></div>
          <label className="toggle-line">
            <input type="checkbox" checked={micProcessing} disabled={inProgress} onChange={event => {
              setMicProcessing(event.target.checked);
              localStorage.setItem('mic-processing', String(event.target.checked));
            }} />
            <span>Подавление шума, эха и автоусиление<small>По умолчанию выключено — голос звучит естественнее.</small></span>
          </label>
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>Оверлей</strong></div>
          <div className="setting-row"><div>Переместить индикатор<small>Позиция сохранится после перезапуска.</small></div>
            <button type="button" className="outline-btn" onClick={() => window.inCharacter.setHudMoveMode(true)}>Переместить ↗</button>
          </div>
          <div className="keyboard-description">{shortcuts.hold ? 'Удерживай' : 'Нажимай'} Ctrl + Shift + Space для записи. Ctrl + Shift + O открывает панель, Ctrl + Shift + M перемещает HUD.</div>
          {!shortcuts.hold && <p className="tiny warning-text">Windows-компонент удержания недоступен: используется режим переключения записи.</p>}
        </div>
        <div className="settings-section">
          <div className="settings-heading"><strong>Стоимость текущей сессии</strong></div>
          <div className="cost-row"><strong>{amount(sessionCost)}</strong><span>{history.length} записей</span></div>
          <p>Оценка: аудио по $0.006/мин + фактическое число текстовых токенов. Окончательные списания смотри в OpenAI Usage.</p>
          <button className="text-link" type="button" onClick={() => void window.inCharacter.openUsage()}>Открыть OpenAI Usage ↗</button>
        </div>
      </section>}
    </main>
    <footer className="bottom-bar">
      <span className={'footer-indicator ' + (phase === 'error' ? 'footer-error' : '')}>{message}</span>
      <button type="button" title="Завершить приложение" onClick={() => window.inCharacter.quit()}>Выйти</button>
    </footer>
  </div>;
}
