import { useEffect, useState } from 'react';
import type { RecordingPhase } from '../electron/hudState';

export const MICROPHONE_PREPARATION_HINT_DELAY_MS = 400;

export function useRecordingPresentation(phase: RecordingPhase, message: string) {
  const [presentation, setPresentation] = useState({ phase, message });
  useEffect(() => {
    const next = { phase, message };
    if (phase !== 'requesting') {
      setPresentation(next);
      return;
    }
    const timer = setTimeout(() => setPresentation(next), MICROPHONE_PREPARATION_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, message]);

  // Recording/error transitions stay immediate; only microphone preparation waits.
  return phase === 'requesting' ? presentation : { phase, message };
}
