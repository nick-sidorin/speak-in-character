export type RecordingPhase = 'idle' | 'requesting' | 'recording' | 'finalizing' | 'processing' | 'ready' | 'error';
export type HudState = {
  phase: RecordingPhase;
  language: 'en' | 'ru' | 'fr' | 'es' | 'de';
  recordingShortcut: string;
  hold: boolean;
};
export type HudSnapshot = HudState & { moveEnabled: boolean; opacityPercent: number };

export const INITIAL_HUD_STATE: HudState = {
  phase: 'idle', language: 'en', recordingShortcut: 'CapsLock', hold: false,
};

// Only the recorder's small display state crosses into the HUD renderer.
export function parseHudState(input: unknown): HudState | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<HudState>;
  if (!['idle', 'requesting', 'recording', 'finalizing', 'processing', 'ready', 'error'].includes(value.phase ?? '') ||
      !['en', 'ru', 'fr', 'es', 'de'].includes(value.language ?? '') ||
      typeof value.recordingShortcut !== 'string' || value.recordingShortcut.length < 1 || value.recordingShortcut.length > 64 ||
      typeof value.hold !== 'boolean') return null;
  return { phase: value.phase!, language: value.language!, recordingShortcut: value.recordingShortcut, hold: value.hold };
}
