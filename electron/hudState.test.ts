import { describe, expect, it } from 'vitest';
import { INITIAL_HUD_STATE, parseHudState } from './hudState';

describe('HUD display state boundary', () => {
  it('forwards only display fields, without private recorder data', () => {
    expect(parseHudState({ ...INITIAL_HUD_STATE, transcript: 'private', bytes: [1], apiKey: 'private', moveEnabled: true }))
      .toEqual(INITIAL_HUD_STATE);
  });

  it.each([null, {}, { phase: 'invented' }, { language: 'unsupported' }, { hold: 1 }, { recordingShortcut: '' }, { recordingShortcut: 'x'.repeat(65) }])
    ('rejects invalid display state: %j', value => {
      expect(parseHudState(value === null ? null : { ...INITIAL_HUD_STATE, ...value, ...(Object.keys(value).length === 0 ? { phase: undefined } : {}) })).toBeNull();
    });
});
