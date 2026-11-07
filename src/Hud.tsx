import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check } from 'lucide-react';
import type { HudSnapshot } from '../electron/hudState';
import { t } from './i18n';
import { phaseLabel, StateIcon } from './RecordingStatus';

export default function Hud() {
  const [state, setState] = useState<HudSnapshot>({
    phase: 'idle', language: 'en', recordingShortcut: 'CapsLock', hold: false, moveEnabled: false, opacityPercent: 76,
  });
  const hudRef = useRef<HTMLDivElement | null>(null);
  const tr = (key: Parameters<typeof t>[1]) => t(state.language, key);

  useEffect(() => {
    let receivedUpdate = false;
    let active = true;
    const unsubscribe = window.inCharacter.onHudStateChanged(value => {
      receivedUpdate = true;
      setState(value);
    });
    void window.inCharacter.getHudState().then(value => {
      if (active && !receivedUpdate) setState(value);
    }).catch(console.error);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const element = hudRef.current;
    if (!element) return;
    const measure = () => window.inCharacter.resizeHud(Math.ceil(element.getBoundingClientRect().width));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const dragStart = (event: PointerEvent<HTMLElement>) => {
    if (!state.moveEnabled || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.inCharacter.startHudDrag();
  };
  const dragMove = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) window.inCharacter.moveHudDrag();
  };
  const dragEnd = (event: PointerEvent<HTMLElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.inCharacter.endHudDrag();
  };

  return <div ref={hudRef} className="hud-window">
    <div className={'hud ' + (state.moveEnabled ? 'hud-move' : '')} style={{ opacity: state.opacityPercent / 100 }}
      onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
      <div className="hud-status"><StateIcon phase={state.phase} language={state.language}/></div>
      <span className="hud-main">
        {state.moveEnabled ? tr('hudMoveShort') : state.phase === 'idle'
          ? `${tr(state.hold ? 'phaseHoldVerb' : 'phaseTapVerb')} ${state.recordingShortcut}`
          : phaseLabel(state.phase, state.hold, state.language)}
      </span>
      {state.moveEnabled && <button type="button" className="hud-lock" title={tr('lockTitle')}
        onClick={() => window.inCharacter.setHudMoveMode(false)}><Check size={15} strokeWidth={2.6}/></button>}
    </div>
  </div>;
}
