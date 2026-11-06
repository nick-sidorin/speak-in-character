import { describe, expect, it } from 'vitest';
import {
  MIN_RECORDING_MS, MIN_SIGNAL_RMS, SILENCE_CHECK_MIN_MS,
  isAccidentalTap, shouldDiscardSilentRecording,
} from './recordingPolicy';

describe('recording guard (prevents unnecessary OpenAI requests)', () => {
  it('discards taps shorter than 250ms but allows a single quick word', () => {
    expect(isAccidentalTap(0)).toBe(true);
    expect(isAccidentalTap(MIN_RECORDING_MS - 1)).toBe(true);
    expect(isAccidentalTap(MIN_RECORDING_MS)).toBe(false);
    expect(isAccidentalTap(450)).toBe(false);
  });
  it('does not reject short clips using silence thresholds', () => {
    const levels = { samples: 50, audibleSamples: 0, maxRms: 0 };
    expect(shouldDiscardSilentRecording(SILENCE_CHECK_MIN_MS - 1, levels)).toBe(false);
  });
  it('discards confidently silent longer recordings', () => {
    const levels = { samples: 10, audibleSamples: 0, maxRms: 0 };
    expect(shouldDiscardSilentRecording(SILENCE_CHECK_MIN_MS, levels)).toBe(true);
  });
  it('never rejects audio when microphone analysis is missing or insufficient', () => {
    expect(shouldDiscardSilentRecording(5000, null)).toBe(false);
    expect(shouldDiscardSilentRecording(5000, { samples: 7, audibleSamples: 0, maxRms: 0 })).toBe(false);
  });
  it('keeps audible speech and ambiguous background sound', () => {
    expect(shouldDiscardSilentRecording(5000, {
      samples: 20, audibleSamples: 1, maxRms: MIN_SIGNAL_RMS,
    })).toBe(false);
    expect(shouldDiscardSilentRecording(5000, {
      samples: 20, audibleSamples: 0, maxRms: MIN_SIGNAL_RMS,
    })).toBe(false);
  });
});
