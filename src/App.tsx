import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'requesting' | 'recording' | 'ready' | 'error';
type ViewMode = 'hud' | 'panel';

function timeLabel(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatSize(size: number): string {
  return size < 1_000_000 ? `${(size / 1_000).toFixed(0)} KB` : `${(size / 1_000_000).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
    return 'Нет доступа к микрофону. Разреши его в настройках конфиденциальности Windows.';
  }
  if (error instanceof Error) return error.message;
  return 'Не удалось начать запись. Проверь микрофон.';
}

export default function App() {
  const [view, setView] = useState<ViewMode>('hud');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [notice, setNotice] = useState('');
  const [shortcuts, setShortcuts] = useState({ recording: true, panel: true, move: true });
  const [hudMoveMode, setHudMoveMode] = useState(false);
  const [micProcessing, setMicProcessing] = useState(() => localStorage.getItem('mic-processing') === 'true');

  const phaseRef = useRef<Phase>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updatePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    if (!recorderRef.current || recorderRef.current.state === 'inactive') return;
    setElapsed(Date.now() - startedRef.current);
    clearTimer();
    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    updatePhase('ready');
    setNotice('Обработка записи…');
  }, []);

  const start = useCallback(async () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'requesting') return;
    updatePhase('requesting');
    setNotice('Запрашиваю доступ к микрофону…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Микрофон недоступен в этом окружении.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: micProcessing, noiseSuppression: micProcessing, autoGainControl: micProcessing },
        video: false,
      });
      streamRef.current = stream;

      const supported = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(mime => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      const chunks: Blob[] = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        clearTimer();
        stream.getTracks().forEach(track => track.stop());
        updatePhase('error');
        setNotice('Ошибка записи с микрофона.');
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        if (blob.size > 0) {
          blobRef.current = blob;
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setAudioUrl(url);
          setFileSize(blob.size);
          setNotice('Запись готова. Открой панель, чтобы прослушать или сохранить.');
        } else {
          updatePhase('error');
          setNotice('Запись пуста. Проверь выбранный микрофон.');
        }
      };

      recorderRef.current = recorder;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      blobRef.current = null;
      setAudioUrl(null);
      setFileSize(0);
      setElapsed(0);
      recorder.start(250);
      startedRef.current = Date.now();
      updatePhase('recording');
      setNotice('Идёт запись…');
      timerRef.current = setInterval(() => setElapsed(Date.now() - startedRef.current), 200);
    } catch (error) {
      clearTimer();
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      updatePhase('error');
      setNotice(errorMessage(error));
    }
  }, [micProcessing]);

  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
    if (phaseRef.current === 'recording') stop();
    else if (phaseRef.current !== 'requesting') void start();
  };

  useEffect(() => {
    const unsubscribeRecord = window.inCharacter.onToggleRecording(() => toggleRef.current());
    const unsubscribeMode = window.inCharacter.onViewModeChanged(mode => setView(mode));
    const unsubscribeMove = window.inCharacter.onHudMoveModeChanged(enabled => setHudMoveMode(enabled));
    const unsubscribeShortcuts = window.inCharacter.onShortcutStatus(status => setShortcuts(status));
    return () => {
      unsubscribeRecord();
      unsubscribeMode();
      unsubscribeMove();
      unsubscribeShortcuts();
      clearTimer();
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const updateMicProcessing = (enabled: boolean) => {
    setMicProcessing(enabled);
    localStorage.setItem('mic-processing', String(enabled));
  };

  const save = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    try {
      const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const result = await window.inCharacter.saveRecording({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        extension,
      });
      if (!result.canceled) setNotice(`Сохранено: ${result.filePath}`);
    } catch (error) {
      setNotice(`Не удалось сохранить: ${errorMessage(error)}`);
    }
  };

  return view === 'hud' ? (
    <div className={`hud ${hudMoveMode ? 'hud-move' : ''}`} role="status" aria-live="polite">
      <div className={`hud-icon ${phase === 'recording' ? 'pulsing' : ''}`}>●</div>
      <div className="hud-copy">
        <div className="hud-title">INCHARACTER <span className="hud-beta">PREVIEW</span></div>
        <div className="hud-state">
          {phase === 'recording' ? `Recording · ${timeLabel(elapsed)}`
            : phase === 'ready' ? `Recording ready · ${timeLabel(elapsed)}`
              : phase === 'requesting' ? 'Connecting microphone…'
                : phase === 'error' ? 'Microphone issue — open panel'
                  : 'Ready to capture'}
        </div>
        <div className="hud-help">{hudMoveMode ? 'Перетащи окно · Ctrl + Shift + M — закрепить' : 'Ctrl + Shift + Space · Record　 |　 Ctrl + Shift + O · Panel'}</div>
      </div>
      {hudMoveMode && <button className="hud-done" type="button" title="Закрепить оверлей" onClick={() => window.inCharacter.setHudMoveMode(false)}>✓</button>}
    </div>
  ) : (
    <div className="panel">
      <header className="panel-header">
        <div className="brand-mark">IC</div>
        <div className="header-titles">
          <span className="brand-title">InCharacter</span>
          <span className="brand-subtitle">Speak naturally. Stay in character.</span>
        </div>
        <button className="icon-button" onClick={() => window.inCharacter.setViewMode('hud')} title="Свернуть панель">×</button>
      </header>
      <main className="panel-content">
        <div className="eyebrow">LOCAL AUDIO PROTOTYPE · 0.1.1</div>
        <h1>Твой голос. Твоя история.</h1>
        <p className="intro">Проверь запись прямо поверх игры. Распознавание речи и перевод добавим позже.</p>

        <section className={`record-surface ${phase === 'recording' ? 'record-active' : ''}`}>
          <div className="record-topline">
            <span className={`status-dot ${phase === 'recording' ? 'active' : ''}`} />
            <span>{phase === 'recording' ? 'ЗАПИСЫВАЕМ' : phase === 'requesting' ? 'ПОДКЛЮЧАЕМ' : 'МИКРОФОН'}</span>
            <strong className="record-time">{timeLabel(elapsed)}</strong>
          </div>
          <button
            className={`record-button ${phase === 'recording' ? 'stop-button' : ''}`}
            disabled={phase === 'requesting'}
            onClick={() => toggleRef.current()}
          >
            <span className="button-symbol">{phase === 'recording' ? '■' : '●'}</span>
            {phase === 'recording' ? 'Остановить запись' : phase === 'requesting' ? 'Подключение…' : 'Начать запись'}
          </button>
          <div className="shortcut-note">или <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> в любой момент</div>
          <label className="processing-option">
            <input
              type="checkbox"
              checked={micProcessing}
              disabled={phase === 'recording' || phase === 'requesting'}
              onChange={event => updateMicProcessing(event.target.checked)}
            />
            Подавление шума и эха
          </label>
        </section>
        <button className="move-hud-button" type="button" onClick={() => window.inCharacter.setHudMoveMode(true)}>
          ↔ Переместить оверлей <span>Ctrl + Shift + M</span>
        </button>

        <section className="playback">
          <div className="section-heading"><span>Последняя запись</span><span>{fileSize ? formatSize(fileSize) : 'Пока пусто'}</span></div>
          {audioUrl ? (
            <>
              <audio key={audioUrl} controls src={audioUrl} preload="metadata" />
              <button className="secondary-button" onClick={() => void save()}>Сохранить аудиофайл</button>
            </>
          ) : (
            <div className="empty-recording">Здесь появится возможность прослушать свою запись.</div>
          )}
        </section>
        {notice && <div className="notice" title={notice}>{notice}</div>}
        {(!shortcuts.panel || !shortcuts.recording || !shortcuts.move) && (
          <div className="warning">Одна из горячих клавиш занята другой программой. Попробуй кнопку записи или освободи сочетание.</div>
        )}
      </main>
      <footer className="panel-footer">
        <span>🔒 Аудио остаётся на компьютере</span>
        <button className="quit-button" onClick={() => window.inCharacter.quit()}>Выйти</button>
      </footer>
    </div>
  );
}
