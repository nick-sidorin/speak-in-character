import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({ dataDirectory: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => fake.dataDirectory },
}));

import {
  addRecording, addRewriteCost, clearHistory, deleteRecording, editRecording,
  finishRecording, listHistory, readRecording,
} from './history';

const sample = () => ({
  bytes: new Uint8Array(512).fill(11),
  mimeType: 'audio/webm',
  durationMs: 3200,
  targetLanguage: 'English',
  presetId: 'pirate',
});

beforeEach(() => {
  fake.dataDirectory = mkdtempSync(join(tmpdir(), 'speak-in-character-test-'));
});
afterEach(() => {
  rmSync(fake.dataDirectory, { recursive: true, force: true });
});

describe('persistent recording history', () => {
  it('saves audio and metadata, then reads it back from disk', async () => {
    const snapshot = await addRecording(sample());
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.stored.durationMs).toBe(3200);
    expect(snapshot.stored.audioBytes).toBe(512);
    expect(snapshot.lifetime.recordings).toBe(1);

    const persisted = listHistory();
    expect(persisted.entries[0].id).toBe(snapshot.entries[0].id);
    const audio = readRecording(snapshot.entries[0].id);
    expect(audio.mimeType).toBe('audio/webm');
    expect(audio.bytes.byteLength).toBe(512);
    expect(readdirSync(join(fake.dataDirectory, 'recordings'))).toHaveLength(1);
  });

  it('tracks recognized words, transcription expense, and incremental rewrite cost', async () => {
    const id = (await addRecording(sample())).entries[0].id;
    const result = await finishRecording(id, {
      transcript: 'Hello fellow adventurer',
      english: 'Well met, friend!',
      transcriptionCostUsd: 0.002,
      estimatedTextCostUsd: 0.001,
    });
    expect(result.lifetime.words).toBe(3);
    expect(result.lifetime.estimatedCostUsd).toBeCloseTo(0.003);
    const retry = await addRewriteCost(id, 'A fine day, friend!', 0.0005);
    expect(retry.lifetime.estimatedCostUsd).toBeCloseTo(0.0035);
    const edited = await editRecording(id, { english: 'All right' });
    expect(edited.entries[0].english).toBe('All right');
    expect(edited.lifetime.words).toBe(3);
  });

  it('deletes exactly the selected managed file while preserving all-time totals', async () => {
    const firstId = (await addRecording(sample())).entries[0].id;
    const secondId = (await addRecording(sample())).entries[0].id;
    const snapshot = await deleteRecording(firstId);
    expect(snapshot.entries.map(entry => entry.id)).toEqual([secondId]);
    expect(snapshot.lifetime.recordings).toBe(2);
    expect(snapshot.stored.recordings).toBe(1);
    expect(readdirSync(join(fake.dataDirectory, 'recordings'))).toHaveLength(1);
    await expect(Promise.resolve().then(() => readRecording(firstId))).rejects.toThrow();
  });

  it('deletes recordings older than the requested retention period', async () => {
    const old = (await addRecording(sample())).entries[0].id;
    const recent = (await addRecording(sample())).entries[0].id;
    const file = join(fake.dataDirectory, 'recording-history.json');
    const index = JSON.parse(readFileSync(file, 'utf8'));
    index.entries.find((entry: { id: string }) => entry.id === old).createdAt = Date.now() - 100 * 86400000;
    writeFileSync(file, JSON.stringify(index));
    const snapshot = await clearHistory(30);
    expect(snapshot.entries.map(entry => entry.id)).toEqual([recent]);
    expect(snapshot.lifetime.recordings).toBe(2);
  });

  it('full purge erases audio and resets lifetime statistics', async () => {
    const id = (await addRecording(sample())).entries[0].id;
    await finishRecording(id, {
      transcript: 'Hello', english: 'Hello', transcriptionCostUsd: 0.01, estimatedTextCostUsd: 0,
    });
    const snapshot = await clearHistory(null);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.lifetime).toEqual({ recordings: 0, durationMs: 0, words: 0, estimatedCostUsd: 0 });
    expect(readdirSync(join(fake.dataDirectory, 'recordings'))).toHaveLength(0);
    expect(listHistory().entries).toEqual([]);
  });

  it('full purge removes orphan audio but preserves unrelated files and directories', async () => {
    await addRecording(sample());
    const directory = join(fake.dataDirectory, 'recordings');
    const id = randomUUID();
    writeFileSync(join(directory, id + '.webm'), sample().bytes);
    writeFileSync(join(directory, id + '.ogg'), sample().bytes);
    const unrelated = id + '.backup.webm';
    writeFileSync(join(directory, unrelated), 'keep backup');
    writeFileSync(join(directory, 'notes.txt'), 'keep notes');
    const subdirectory = randomUUID() + '.ogg';
    mkdirSync(join(directory, subdirectory));
    const exported = join(fake.dataDirectory, 'exported.webm');
    writeFileSync(exported, 'keep export');

    await clearHistory(null);

    expect(readdirSync(directory).sort()).toEqual([unrelated, 'notes.txt', subdirectory].sort());
    expect(readFileSync(exported, 'utf8')).toBe('keep export');
  });

  it('does not accept invalid IDs, unsafe input or corrupt a bad index', async () => {
    await expect(addRecording({ ...sample(), bytes: new Uint8Array(10) })).rejects.toThrow();
    expect(() => readRecording('../secrets')).toThrow();
    await expect(clearHistory(45)).rejects.toThrow();
    const file = join(fake.dataDirectory, 'recording-history.json');
    writeFileSync(file, '{"schemaVersion":1,"entries":"broken","lifetime":{}}');
    expect(() => listHistory()).toThrow();
    expect(readFileSync(file, 'utf8')).toContain('"broken"');
  });
});
