import { contextBridge, ipcRenderer } from 'electron';

import type { HudState, HudSnapshot } from './hudState';
type HistoryEntry = {
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
type HistoryStats = {
  recordings: number;
  durationMs: number;
  words: number;
  estimatedCostUsd: number;
  audioBytes: number;
};
type HistorySnapshot = {
  entries: HistoryEntry[];
  stored: HistoryStats;
  lifetime: Omit<HistoryStats, 'audioBytes'>;
};


const bridge = {
  editorReady: (): void => ipcRenderer.send('app:editor-ready'),
  onHoldKeyDown: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('hotkey:down', listener);
    return () => ipcRenderer.removeListener('hotkey:down', listener);
  },
  onHoldKeyUp: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('hotkey:up', listener);
    return () => ipcRenderer.removeListener('hotkey:up', listener);
  },
  onToggleRecording: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('recording:toggle', listener);
    return () => ipcRenderer.removeListener('recording:toggle', listener);
  },
  onHudStateChanged: (callback: (state: HudSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: HudSnapshot) => callback(state);
    ipcRenderer.on('hud:state', listener);
    return () => ipcRenderer.removeListener('hud:state', listener);
  },
  getHudState: (): Promise<HudSnapshot> => ipcRenderer.invoke('hud:get-state'),
  publishHudState: (state: HudState): void => ipcRenderer.send('hud:publish-state', state),
  onShortcutStatus: (callback: (status: { recording: boolean; panel: boolean; move: boolean; hold: boolean }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: { recording: boolean; panel: boolean; move: boolean; hold: boolean },
    ) => callback(status);
    ipcRenderer.on('app:shortcuts', listener);
    return () => ipcRenderer.removeListener('app:shortcuts', listener);
  },
  resizeHud: (width: number): void => ipcRenderer.send('hud:resize', width),
  setHudOpacity: (percent: number): void => ipcRenderer.send('hud:set-opacity', percent),
  startHudDrag: () => ipcRenderer.send('overlay:drag-start'),
  moveHudDrag: () => ipcRenderer.send('overlay:drag-move'),
  endHudDrag: () => ipcRenderer.send('overlay:drag-end'),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('ai:key-status'),
  saveApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('ai:save-key', key),
  processVoice: (payload: { bytes: Uint8Array; mimeType: string; additionalContext: string; targetLanguage: string; presetId: string }): Promise<{transcript: string; translated: string; estimatedTextCostUsd: number}> => ipcRenderer.invoke('ai:process', payload),
  rewriteSpeech: (transcript: string, context: {additionalContext:string;targetLanguage:string;presetId:string}): Promise<{text: string; estimatedTextCostUsd: number}> => ipcRenderer.invoke('ai:rewrite', transcript, context),
  listPresets: (): Promise<Array<{
    id: string;
    name: { en: string; ru?: string; fr?: string; es?: string; de?: string };
    description: { en: string; ru?: string; fr?: string; es?: string; de?: string };
    source: 'built-in' | 'custom';
  }>> => ipcRenderer.invoke('presets:list'),
  openPresetsFolder: (): Promise<void> => ipcRenderer.invoke('presets:open-folder'),
  copyText: (value: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', value),
  historyList: (): Promise<HistorySnapshot> => ipcRenderer.invoke('history:list'),
  historyAdd: (input: {bytes: Uint8Array; mimeType:string; durationMs:number; targetLanguage:string; presetId:string}): Promise<HistorySnapshot> => ipcRenderer.invoke('history:add', input),
  historyFinish: (id: string, result: {transcript:string; english:string; transcriptionCostUsd:number; estimatedTextCostUsd:number}): Promise<HistorySnapshot> => ipcRenderer.invoke('history:finish', id, result),
  historyEdit: (id: string, changes: {transcript?:string; english?:string}): Promise<HistorySnapshot> => ipcRenderer.invoke('history:edit', id, changes),
  historyRewrite: (id: string, english: string, cost: number): Promise<HistorySnapshot> => ipcRenderer.invoke('history:rewrite', id, english, cost),
  historyReadAudio: (id: string): Promise<{bytes: Uint8Array; mimeType: string}> => ipcRenderer.invoke('history:read-audio', id),
  historyDelete: (id: string): Promise<HistorySnapshot> => ipcRenderer.invoke('history:delete', id),
  historyClear: (days: number | null): Promise<HistorySnapshot> => ipcRenderer.invoke('history:clear', days),
  historyExport: (id: string): Promise<{canceled:true}|{canceled:false;filePath:string}> => ipcRenderer.invoke('history:export', id),
  openUsage: (): Promise<void> => ipcRenderer.invoke('app:open-usage'),
  getPreferredLanguages: (): Promise<string[]> => ipcRenderer.invoke('app:preferred-languages'),
  setThemeBackground: (scheme: 'light' | 'dark'): void => ipcRenderer.send('app:theme-background', scheme),
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  setShortcutCapture: (active: boolean) => ipcRenderer.send('shortcuts:capture', active),
  setShortcuts: (value: {record:string;panel:string;move:string}) => ipcRenderer.invoke('shortcuts:set', value),
  setHudMoveMode: (enabled: boolean) => ipcRenderer.send('overlay:move-hud', enabled),
  saveRecording: (payload: { bytes: Uint8Array; extension: 'webm' | 'ogg' }) =>
    ipcRenderer.invoke('recording:save', payload),
  quit: () => ipcRenderer.send('app:quit'),
};

const hudBridge = {
  onHudStateChanged: bridge.onHudStateChanged,
  getHudState: bridge.getHudState,
  resizeHud: bridge.resizeHud,
  startHudDrag: bridge.startHudDrag,
  moveHudDrag: bridge.moveHudDrag,
  endHudDrag: bridge.endHudDrag,
  setHudMoveMode: bridge.setHudMoveMode,
};
contextBridge.exposeInMainWorld('inCharacter', process.argv.includes('--speak-window=hud') ? hudBridge : bridge);
