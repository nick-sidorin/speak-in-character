/** Small, testable safety checks used before sending audio to OpenAI. */
export const MIN_RECORDING_MS = 250;
export const SILENCE_CHECK_MIN_MS = 1200;
export const MIN_SIGNAL_RMS = 0.0045;
export const MIN_ANALYSED_SAMPLES = 8;

export type AudioLevelSummary = {
  samples: number;
  audibleSamples: number;
  maxRms: number;
};

/** Conservative: unknown microphone analysis must not discard real speech. */
export function shouldDiscardSilentRecording(durationMs: number, summary: AudioLevelSummary | null): boolean {
  return durationMs >= SILENCE_CHECK_MIN_MS &&
    summary !== null &&
    summary.samples >= MIN_ANALYSED_SAMPLES &&
    summary.audibleSamples === 0 &&
    summary.maxRms < MIN_SIGNAL_RMS;
}

/** Accidental keyboard taps are discarded without producing a Blob or API call. */
export function isAccidentalTap(durationMs: number): boolean {
  return durationMs < MIN_RECORDING_MS;
}
