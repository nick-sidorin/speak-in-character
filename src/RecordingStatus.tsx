import { Circle, Check, AlertCircle } from 'lucide-react';
import { t, type InterfaceLanguage, type TranslationKey } from './i18n';
import type { RecordingPhase } from '../electron/hudState';

export function phaseLabel(phase: RecordingPhase, hold: boolean, language: InterfaceLanguage): string {
  const keys: Partial<Record<RecordingPhase, TranslationKey>> = {
    recording: 'phaseRecording', requesting: 'phaseRequesting', finalizing: 'phaseFinalizing',
    processing: 'phaseProcessing', ready: 'phaseReady', error: 'phaseError',
  };
  const key = keys[phase];
  return key ? t(language, key) : t(language, hold ? 'phaseHold' : 'phaseTap');
}

export function StateIcon({ phase, language }: { phase: RecordingPhase; language: InterfaceLanguage }) {
  if (phase === 'processing' || phase === 'requesting' || phase === 'finalizing') {
    return <span className="state-spinner" aria-label={t(language, 'iconProcessing')} />;
  }
  if (phase === 'ready') return <span className="state-check" aria-label={t(language, 'iconReady')}><Check size={17} strokeWidth={3} /></span>;
  if (phase === 'error') return <span className="state-error" aria-label={t(language, 'iconError')}><AlertCircle size={19} strokeWidth={2.5}/></span>;
  return <span className={'state-circle ' + (phase === 'recording' ? 'recording' : '')}>
    <Circle size={18} fill="currentColor" strokeWidth={1.8} />
  </span>;
}
