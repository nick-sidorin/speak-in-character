import { describe, expect, it } from 'vitest';
import { languageFromSystemLocale } from './locale';

describe('Windows system UI language selection', () => {
  it('honors Russian Windows locale even if region suffix differs', () => {
    expect(languageFromSystemLocale('ru-RU')).toBe('ru');
    expect(languageFromSystemLocale('RU_ru')).toBe('ru');
  });
  it.each(['en-US', 'de-DE', 'fr-FR', 'es-ES'])('uses supported %s system language', value => {
    expect(languageFromSystemLocale(value)).toBe(value.slice(0, 2) as ReturnType<typeof languageFromSystemLocale>);
  });
  it('falls back to English for unsupported or unspecified locales', () => {
    expect(languageFromSystemLocale('nl-NL')).toBe('en');
    expect(languageFromSystemLocale('')).toBe('en');
    expect(languageFromSystemLocale()).toBe('en');
  });
});
