const copy = {
  en: { loading: 'Loading…', failed: 'Could not load the application.', retry: 'Retry' },
  ru: { loading: 'Загрузка…', failed: 'Не удалось загрузить приложение.', retry: 'Повторить' },
  fr: { loading: 'Chargement…', failed: 'Impossible de charger l’application.', retry: 'Réessayer' },
  es: { loading: 'Cargando…', failed: 'No se pudo cargar la aplicación.', retry: 'Reintentar' },
  de: { loading: 'Wird geladen…', failed: 'Die Anwendung konnte nicht geladen werden.', retry: 'Erneut versuchen' },
};

export function startupText(locale?: string) {
  const base = locale?.split(/[-_]/, 1)[0]?.toLowerCase() as keyof typeof copy;
  return copy[base] ?? copy.en;
}
