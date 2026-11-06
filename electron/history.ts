import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, lstatSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

export type HistoryEntry = {
  id: string;
  createdAt: number;
  durationMs: number;
  transcript: string;
  english: string;
  targetLanguage: string;
  presetId: string;
  estimatedTextCostUsd: number;
  transcriptionCostUsd: number;
  recognizedWords: number;
  extension: 'webm' | 'ogg';
  audioBytes: number;
};
export type HistoryStats = {
  recordings: number;
  durationMs: number;
  words: number;
  estimatedCostUsd: number;
  audioBytes: number;
};
export type HistorySnapshot = {
  entries: HistoryEntry[];
  stored: HistoryStats;
  lifetime: Omit<HistoryStats, 'audioBytes'>;
};
type HistoryDb = {
  schemaVersion: 1;
  entries: HistoryEntry[];
  lifetime: Omit<HistoryStats, 'audioBytes'>;
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AUDIO_BYTES = 20_000_000;
const MAX_ARCHIVE = 10_000;
const ARCHIVE_DIR = 'recordings';
const INDEX = 'recording-history.json';
const emptyStats = () => ({ recordings: 0, durationMs: 0, words: 0, estimatedCostUsd: 0 });
const directory = () => join(app.getPath('userData'), ARCHIVE_DIR);
const indexPath = () => join(app.getPath('userData'), INDEX);

function wordCount(text: string): number {
  // Intl.Segmenter handles languages without spaces better than split(/\\s+/).
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  return [...segmenter.segment(text)].filter(segment => segment.isWordLike).length;
}
function audioPath(entry: Pick<HistoryEntry, 'id' | 'extension'>): string {
  if (!UUID_PATTERN.test(entry.id) || !['webm','ogg'].includes(entry.extension)) {
    throw new Error('Invalid managed recording ID');
  }
  return join(directory(), entry.id + '.' + entry.extension);
}
function cleanRecord(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<HistoryEntry>;
  return typeof e.id === 'string' && UUID_PATTERN.test(e.id) &&
    (e.extension === 'webm' || e.extension === 'ogg') &&
    typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) &&
    typeof e.durationMs === 'number' && Number.isFinite(e.durationMs) && e.durationMs >= 0 &&
    typeof e.audioBytes === 'number' && e.audioBytes >= 0 && e.audioBytes <= MAX_AUDIO_BYTES &&
    typeof e.transcript === 'string' && typeof e.english === 'string' &&
    typeof e.targetLanguage === 'string' && typeof e.presetId === 'string' &&
    typeof e.estimatedTextCostUsd === 'number' && Number.isFinite(e.estimatedTextCostUsd) &&
    typeof e.transcriptionCostUsd === 'number' && Number.isFinite(e.transcriptionCostUsd) &&
    typeof e.recognizedWords === 'number' && Number.isFinite(e.recognizedWords);
}
function load(): HistoryDb {
  if (!existsSync(indexPath())) return { schemaVersion: 1, entries: [], lifetime: emptyStats() };
  const data: unknown = JSON.parse(readFileSync(indexPath(), 'utf8'));
  if (!data || typeof data !== 'object') throw new Error('History index is unreadable; original file was preserved');
  const input = data as Partial<HistoryDb>;
  if (input.schemaVersion !== 1 || !Array.isArray(input.entries) || input.entries.length > MAX_ARCHIVE ||
      !input.entries.every(cleanRecord)) {
    throw new Error('History index is invalid; original file was preserved');
  }
  const all = input.lifetime;
  if (!all || ![all.recordings,all.durationMs,all.words,all.estimatedCostUsd].every(v=>typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
    throw new Error('History totals are invalid; original file was preserved');
  }
  return { schemaVersion: 1, entries: input.entries, lifetime: all };
}
function save(db: HistoryDb): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  const tmp = indexPath() + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(db), { encoding: 'utf8', flag: 'wx' });
    renameSync(tmp, indexPath());
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
}
function snapshot(db: HistoryDb): HistorySnapshot {
  const stored: HistoryStats = { ...emptyStats(), audioBytes: 0 };
  for (const item of db.entries) {
    stored.recordings++;
    stored.durationMs += item.durationMs;
    stored.words += item.recognizedWords;
    stored.estimatedCostUsd += item.estimatedTextCostUsd + item.transcriptionCostUsd;
    stored.audioBytes += item.audioBytes;
  }
  return { entries: db.entries.map(e=>({...e})), stored, lifetime: {...db.lifetime} };
}
// Queue every disk mutation: interleaved edits, completion and deletions cannot
// overwrite one another's metadata.
let pending: Promise<unknown> = Promise.resolve();
function mutation<T>(callback: () => T): Promise<T> {
  const next = pending.then(callback, callback);
  pending = next.catch(() => {});
  return next;
}
export function listHistory(): HistorySnapshot {
  return snapshot(load());
}
export function addRecording(input: {
  bytes: Uint8Array;
  mimeType: string;
  durationMs: number;
  targetLanguage: string;
  presetId: string;
}): Promise<HistorySnapshot> {
  return mutation(() => {
    if (!input || typeof input.durationMs !== 'number' ||
        !Number.isFinite(input.durationMs) || input.durationMs < 200 ||
        input.durationMs > 2 * 60 * 60 * 1000 ||
        typeof input.targetLanguage !== 'string' || typeof input.presetId !== 'string' ||
        typeof input.mimeType !== 'string' ||
        !(input.bytes instanceof Uint8Array) ||
        input.bytes.byteLength < 100 || input.bytes.byteLength > MAX_AUDIO_BYTES) {
      throw new Error('Invalid local recording');
    }
    const db = load();
    if (db.entries.length >= MAX_ARCHIVE) throw new Error('History limit reached. Delete older recordings first.');
    const extension = input.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const item: HistoryEntry = {
      id: randomUUID(), createdAt: Date.now(), durationMs: input.durationMs,
      transcript: '', english: '',
      targetLanguage: input.targetLanguage.slice(0,80),
      presetId: input.presetId.slice(0,64),
      estimatedTextCostUsd: 0, transcriptionCostUsd: 0,
      recognizedWords: 0, extension,
      audioBytes: input.bytes.byteLength,
    };
    mkdirSync(directory(), { recursive: true });
    const path = audioPath(item);
    writeFileSync(path, Buffer.from(input.bytes), { flag: 'wx' });
    try {
      db.entries.unshift(item);
      db.lifetime.recordings++;
      db.lifetime.durationMs += item.durationMs;
      save(db);
      return snapshot(db);
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    }
  });
}
export function finishRecording(id: string, result: {
  transcript: string;
  english: string;
  transcriptionCostUsd: number;
  estimatedTextCostUsd: number;
}): Promise<HistorySnapshot> {
  return mutation(() => {
    const db = load();
    const entry = db.entries.find(e=>e.id === id);
    if (!entry) throw new Error('Recording was removed');
    if (typeof result.transcript !== 'string' || result.transcript.length > 50_000 ||
        typeof result.english !== 'string' || result.english.length > 50_000 ||
        !Number.isFinite(result.transcriptionCostUsd) || result.transcriptionCostUsd < 0 ||
        !Number.isFinite(result.estimatedTextCostUsd) || result.estimatedTextCostUsd < 0) {
      throw new Error('Invalid transcription metadata');
    }
    const words = wordCount(result.transcript);
    db.lifetime.words += words - entry.recognizedWords;
    const previousCost = entry.transcriptionCostUsd + entry.estimatedTextCostUsd;
    const nextCost = result.transcriptionCostUsd + result.estimatedTextCostUsd;
    db.lifetime.estimatedCostUsd += nextCost - previousCost;
    entry.transcript = result.transcript;
    entry.english = result.english;
    entry.recognizedWords = words;
    entry.transcriptionCostUsd = result.transcriptionCostUsd;
    entry.estimatedTextCostUsd = result.estimatedTextCostUsd;
    save(db);
    return snapshot(db);
  });
}
export function editRecording(id: string, changes: { transcript?: string; english?: string }): Promise<HistorySnapshot> {
  return mutation(() => {
    const db = load();
    const e = db.entries.find(item=>item.id === id);
    if (!e) throw new Error('Recording was removed');
    if (typeof changes?.transcript === 'string' && changes.transcript.length <= 50_000) e.transcript = changes.transcript;
    if (typeof changes?.english === 'string' && changes.english.length <= 50_000) e.english = changes.english;
    save(db);
    return snapshot(db);
  });
}
export function addRewriteCost(id: string, english: string, cost: number): Promise<HistorySnapshot> {
  return mutation(() => {
    if (typeof english !== 'string' || english.length > 50_000 || !Number.isFinite(cost) || cost < 0 || cost > 10) {
      throw new Error('Invalid rewrite result');
    }
    const db = load();
    const e = db.entries.find(item=>item.id === id);
    if (!e) throw new Error('Recording was removed');
    e.english = english;
    e.estimatedTextCostUsd += cost;
    db.lifetime.estimatedCostUsd += cost;
    save(db);
    return snapshot(db);
  });
}
export function getRecording(id: string): HistoryEntry {
  const item = load().entries.find(e=>e.id===id);
  if (!item) throw new Error('Recording not found');
  return item;
}
function managedFile(entry: HistoryEntry): string {
  const path = audioPath(entry);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_AUDIO_BYTES) {
    throw new Error('Audio is not a regular managed file');
  }
  return path;
}
export function readRecording(id: string): {bytes: Uint8Array; mimeType: string} {
  const item = getRecording(id);
  const path = managedFile(item);
  return {
    bytes: new Uint8Array(readFileSync(path)),
    mimeType: item.extension === 'ogg' ? 'audio/ogg' : 'audio/webm',
  };
}
export function exportRecording(id: string, destination: string): void {
  const item = getRecording(id);
  copyFileSync(managedFile(item), destination);
}
function unlinkManaged(entry: HistoryEntry): void {
  try {
    const path = audioPath(entry);
    if (!existsSync(path)) return;
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing to delete a non-regular audio file');
    rmSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export function deleteRecording(id: string): Promise<HistorySnapshot> {
  return mutation(() => {
    const db = load();
    const entry = db.entries.find(e=>e.id===id);
    if (!entry) throw new Error('Recording not found');
    unlinkManaged(entry);
    db.entries = db.entries.filter(e=>e.id!==id);
    save(db);
    return snapshot(db);
  });
}
export function clearHistory(days: number | null): Promise<HistorySnapshot> {
  return mutation(() => {
    if (days !== null && (![7,30,90].includes(days))) throw new Error('Unsupported retention cutoff');
    const db = load();
    const threshold = days === null ? Infinity : Date.now() - days * 86400000;
    const selected = db.entries.filter(e=>e.createdAt < threshold);
    const failed = new Set<string>();
    for (const entry of selected) {
      try { unlinkManaged(entry); }
      catch (error) { console.error('Cannot delete managed audio:', entry.id, error); failed.add(entry.id); }
    }
    db.entries = db.entries.filter(e=>!selected.includes(e) || failed.has(e.id));
    if (days === null && failed.size === 0 && existsSync(directory())) {
      // A crash between writing an audio file and the index may leave orphans.
      // Full purge also removes such files, exclusively inside our managed folder.
      for (const file of readdirSync(directory())) {
        if (!UUID_PATTERN.test(file.slice(0,36)) || !/\\.(webm|ogg)$/.test(file)) continue;
        const path = join(directory(), file);
        const info = lstatSync(path);
        if (info.isFile() && !info.isSymbolicLink()) rmSync(path);
      }
    }
    if (days === null && failed.size === 0) {
      // Full purge includes aggregate totals. Single-item and age-based cleanup
      // intentionally retain lifetime counters.
      db.lifetime = emptyStats();
    }
    save(db);
    if (failed.size) throw new Error('Some recordings could not be deleted. Other entries were cleaned.');
    return snapshot(db);
  });
}
