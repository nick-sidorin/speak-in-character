import { app } from 'electron';
import { mkdirSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';

export type PresetLocale = 'en' | 'ru' | 'fr' | 'es' | 'de';
export type PresetText = { en: string } & Partial<Record<Exclude<PresetLocale, 'en'>, string>>;
export type PresetSource = 'built-in' | 'custom';
export type PresetInfo = {
  id: string;
  name: PresetText;
  description: PresetText;
  source: PresetSource;
};
export type PresetDefinition = PresetInfo & {
  instructions: string;
  recognitionHints: string;
};

function safeText(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maxLength
    ? value.trim()
    : undefined;
}

function localized(value: unknown, maxLength: number): PresetText | undefined {
  if (typeof value === 'string') {
    const en = safeText(value, maxLength);
    return en ? { en } : undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const en = safeText(raw.en, maxLength);
  if (!en) return undefined;
  const result: PresetText = { en };
  for (const language of ['ru', 'fr', 'es', 'de'] as const) {
    const translated = safeText(raw[language], maxLength);
    if (translated) result[language] = translated;
  }
  return result;
}

function parsePreset(input: unknown, source: PresetSource): PresetDefinition | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  const id = safeText(raw.id, 64);
  const name = localized(raw.name, 90);
  const description = localized(raw.description, 280);
  const instructions = safeText(raw.instructions, 2400);
  if (raw.schemaVersion !== 1 || !id || !/^[a-z0-9][a-z0-9_-]*$/.test(id) ||
      !name || !description || !instructions) return undefined;
  const recognitionHints = typeof raw.recognitionHints === 'string'
    ? raw.recognitionHints.trim().slice(0, 600)
    : '';
  return { id, name, description, instructions, recognitionHints, source };
}

function packagedDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'presets')
    : join(app.getAppPath(), 'presets');
}

export function customPresetsDirectory(): string {
  return join(app.getPath('userData'), 'presets');
}

export function ensureCustomPresetsDirectory(): string {
  const directory = customPresetsDirectory();
  mkdirSync(directory, { recursive: true });
  return directory;
}

function readDirectory(directory: string, source: PresetSource): PresetDefinition[] {
  const result: PresetDefinition[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const path = join(directory, entry.name);
    try {
      if (statSync(path).size > 24_000) continue;
      const preset = parsePreset(JSON.parse(readFileSync(path, 'utf8')), source);
      if (preset) result.push(preset);
      else console.warn('Ignored invalid InCharacter preset:', path);
    } catch (error) {
      console.warn('Could not load InCharacter preset:', path, error);
    }
  }
  return result;
}

function allDefinitions(): PresetDefinition[] {
  const map = new Map<string, PresetDefinition>();
  // Personal overrides take precedence over bundled presets with the same ID.
  for (const preset of readDirectory(packagedDirectory(), 'built-in')) map.set(preset.id, preset);
  for (const preset of readDirectory(ensureCustomPresetsDirectory(), 'custom')) map.set(preset.id, preset);
  return [...map.values()].sort((left, right) => left.name.en.localeCompare(right.name.en));
}

export function listPresets(): PresetInfo[] {
  return allDefinitions().map(({ id, name, description, source }) => ({ id, name, description, source }));
}

export function resolvePreset(id: string): PresetDefinition | undefined {
  if (!id) return undefined;
  if (typeof id !== 'string' || id.length > 64 || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw new Error('Invalid preset ID.');
  }
  const preset = allDefinitions().find(item => item.id === id);
  if (!preset) throw new Error('Selected speech preset is missing. Reload presets in Settings.');
  return preset;
}
