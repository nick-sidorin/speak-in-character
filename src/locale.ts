import { INTERFACE_LANGUAGES, type InterfaceLanguage } from './i18n';

/** Windows/Chromium locales may contain a region or a variant; match UI base. */
export function languageFromSystemLocale(locale?: string): InterfaceLanguage {
  const base = locale?.split(/[-_]/, 1)[0]?.trim().toLowerCase();
  return INTERFACE_LANGUAGES.find(language => language.value === base)?.value ?? 'en';
}
