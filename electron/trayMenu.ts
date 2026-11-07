import type { MenuItemConstructorOptions } from 'electron';
import type { HudState } from './hudState';

const labels = {
  en: { open: 'Open', quit: 'Quit' },
  ru: { open: 'Открыть', quit: 'Выйти' },
  fr: { open: 'Ouvrir', quit: 'Quitter' },
  es: { open: 'Abrir', quit: 'Salir' },
  de: { open: 'Öffnen', quit: 'Beenden' },
};

export function trayMenuTemplate(language: HudState['language'], open: () => void, quit: () => void): MenuItemConstructorOptions[] {
  return [
    { label: labels[language].open, click: open },
    { type: 'separator' },
    { label: labels[language].quit, click: quit },
  ];
}
