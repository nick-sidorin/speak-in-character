import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

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
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [character, setCharacter] = useState(() => localStorage.getItem('character') || '');
  const [situation, setSituation] = useState(() => localStorage.getItem('situation') || '');
  const [transcript, setTranscript] = useState('');
  const [english, setEnglish] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
  const hasKeyRef = useRef(false);
  const characterRef = useRef('');
  const situationRef = useRef('');
  const processRef = useRef<(blob: Blob) => Promise<void>>(async () => {});
  hasKeyRef.current = hasKey;
  characterRef.current = character;
  situationRef.current = situation;

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
          if (hasKeyRef.current) {
            void processRef.current(blob);
          } else {
            setNotice('Запись готова. Добавь OpenAI API-ключ для распознавания.');
          }
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

  processRef.current = async (blob: Blob) => {
    setAiStatus('processing');
    setNotice('Распознаю речь и готовлю английскую реплику…');
    setTranscript('');
    setEnglish('');
    try {
      const result = await window.inCharacter.processVoice({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type,
        character: characterRef.current,
        situation: situationRef.current,
      });
      setTranscript(result.transcript);
      setEnglish(result.translated);
      if (!result.translated) {
        setAiStatus('error');
        setNotice('Речь распознана, но перевод не получился. Проверь API и нажми «Перевести ещё раз».');
      } else {
        setAiStatus('ready');
        setNotice('Реплика готова и скопирована в буфер обмена. Можно вставлять в WoW!');
      }
    } catch (error) {
      setAiStatus('error');
      setNotice(`Ошибка ИИ: ${errorMessage(error)}`);
    }
  };

  const saveKey = async () => {
    if (!keyDraft.trim()) {
      setNotice('Вставь OpenAI API-ключ в поле.');
      return;
    }
    try {
      await window.inCharacter.saveApiKey(keyDraft);
      setKeyDraft('');
      setHasKey(true);
      hasKeyRef.current = true;
      setNotice('Ключ сохранён в защищённом хранилище Windows.');
      setShowSettings(false);
    } catch (error) {
      setNotice(`Не удалось сохранить ключ: ${errorMessage(error)}`);
    }
  };

  const translateEdited = async () => {
    if (!transcript.trim()) return;
    setAiStatus('processing');
    setNotice('Перевожу исправленную расшифровку…');
    try {
      const text = await window.inCharacter.rewriteSpeech(transcript, { character, situation });
      setEnglish(text);
      setAiStatus('ready');
      setNotice('Реплика обновлена и скопирована в буфер.');
    } catch (error) {
      setAiStatus('error');
      setNotice(`Не получилось перевести: ${errorMessage(error)}`);
    }
  };

  const copyEnglish = async () => {
    try {
      await window.inCharacter.copyText(english);
      setNotice('Английская реплика скопирована в буфер.');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const dragHudStart = (event: PointerEvent<HTMLDivElement>) => {
    if (!hudMoveMode || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.inCharacter.startHudDrag();
  };
  const dragHudMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (hudMoveMode && event.currentTarget.hasPointerCapture(event.pointerId)) {
      window.inCharacter.moveHudDrag();
    }
  };
  const dragHudEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      window.inCharacter.endHudDrag();
    }
  };

  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
    if (phaseRef.current === 'recording') stop();
    else if (phaseRef.current !== 'requesting') void start();
  };

  useEffect(() => {
    window.inCharacter.hasApiKey().then(available => {
      hasKeyRef.current = available;
      setHasKey(available);
      if (!available) setShowSettings(true);
    }).catch(() => setShowSettings(true));
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
    <div
      className={`hud ${hudMoveMode ? 'hud-move' : ''}`}
      role="status"
      aria-live="polite"
      onPointerDown={dragHudStart}
      onPointerMove={dragHudMove}
      onPointerUp={dragHudEnd}
      onPointerCancel={dragHudEnd}
    >
      <div className={`hud-icon ${phase === 'recording' ? 'pulsing' : ''}`}>●</div>
      <div className="hud-copy">
        <div className="hud-title">INCHARACTER <span className="hud-beta">PREVIEW</span></div>
        <div className="hud-state">
          {phase === 'recording' ? `Recording · ${timeLabel(elapsed)}`
            : aiStatus === 'processing' ? 'Processing speech…'
              : aiStatus === 'ready' ? 'Reply copied to clipboard'
                : aiStatus === 'error' ? 'AI issue — open panel'
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
        <div className="eyebrow">VOICE TO RP · 0.2.0</div>
        <h1>Говори свободно.</h1>
        <p className="intro">Говори по-русски, по-английски или вперемешку. ИИ подготовит реплику для RP-чата.</p>

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

        <section className="ai-settings">
          <div className="section-heading">
            <span>OpenAI API</span>
            <button className="settings-link" onClick={() => setShowSettings(!showSettings)}>{hasKey ? (showSettings ? 'Скрыть' : 'Сменить ключ') : 'Подключить'}</button>
          </div>
          {showSettings && <div className="settings-editor">
            <label htmlFor="api-key">API-ключ (хранится защищённым Windows)</label>
            <div className="key-row">
              <input id="api-key" type="password" value={keyDraft} placeholder="sk-…" autoComplete="off" onChange={event => setKeyDraft(event.target.value)}/>
              <button onClick={() => void saveKey()}>Сохранить</button>
            </div>
            <div className="tiny-note">После настройки запись автоматически отправляется в OpenAI для распознавания и перевода. API оплачивается отдельно от ChatGPT.</div>
          </div>}
          <div className="context-grid">
            <label>Персонаж / манера речи
              <input
                value={character}
                placeholder="Corvin Sidwell, human, Stormwind…"
                onChange={event => { setCharacter(event.target.value); localStorage.setItem('character', event.target.value); }}
              />
            </label>
            <label>Контекст / игровые названия
              <input
                value={situation}
                placeholder="Goldshire, talking with Borin about Ironforge…"
                onChange={event => { setSituation(event.target.value); localStorage.setItem('situation', event.target.value); }}
              />
            </label>
          </div>
          {blobRef.current && hasKey && aiStatus !== 'processing' && (
            <button className="secondary-button" onClick={() => void processRef.current(blobRef.current!)}>
              Распознать последнюю запись ещё раз
            </button>
          )}
        </section>
        {(transcript || english || aiStatus === 'processing') && (
          <section className="transcription">
            <div className="section-heading"><span>Реплика для RP</span><span>{aiStatus === 'processing' ? 'Обрабатываю…' : english ? 'Готова' : 'Нужна проверка'}</span></div>
            <label>Твоя речь — можно исправить распознавание
              <textarea rows={3} value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Оригинальная расшифровка…" />
            </label>
            <button className="secondary-button" disabled={!hasKey || !transcript.trim() || aiStatus === 'processing'} onClick={() => void translateEdited()}>
              Перевести исправленный текст
            </button>
            <label>Английская реплика — можно отредактировать
              <textarea className="english-output" rows={3} value={english} onChange={event => setEnglish(event.target.value)} placeholder="Готовая реплика появится здесь…" />
            </label>
            <button className="copy-button" disabled={!english.trim()} onClick={() => void copyEnglish()}>Скопировать для WoW (Ctrl+V)</button>
          </section>
        )}
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
        <span>🔒 Аудио локально без ключа · с ключом → OpenAI</span>
        <button className="quit-button" onClick={() => window.inCharacter.quit()}>Выйти</button>
      </footer>
    </div>
  );
}
