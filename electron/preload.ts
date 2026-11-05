import { contextBridge, ipcRenderer } from 'electron';

type ViewMode = 'hud' | 'panel';

contextBridge.exposeInMainWorld('inCharacter', {
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
  onViewModeChanged: (callback: (mode: ViewMode) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: ViewMode) => callback(mode);
    ipcRenderer.on('overlay:mode', listener);
    return () => ipcRenderer.removeListener('overlay:mode', listener);
  },
  onHudMoveModeChanged: (callback: (enabled: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled);
    ipcRenderer.on('overlay:move-mode', listener);
    return () => ipcRenderer.removeListener('overlay:move-mode', listener);
  },
  onShortcutStatus: (callback: (status: { recording: boolean; panel: boolean; move: boolean; hold: boolean }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: { recording: boolean; panel: boolean; move: boolean },
    ) => callback(status);
    ipcRenderer.on('app:shortcuts', listener);
    return () => ipcRenderer.removeListener('app:shortcuts', listener);
  },
  setViewMode: (mode: ViewMode) => ipcRenderer.send('overlay:set-mode', mode),
  startHudDrag: () => ipcRenderer.send('overlay:drag-start'),
  moveHudDrag: () => ipcRenderer.send('overlay:drag-move'),
  endHudDrag: () => ipcRenderer.send('overlay:drag-end'),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('ai:key-status'),
  saveApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('ai:save-key', key),
  processVoice: (payload: { bytes: Uint8Array; mimeType: string; character: string; situation: string }): Promise<{transcript: string; translated: string; estimatedTextCostUsd: number}> => ipcRenderer.invoke('ai:process', payload),
  rewriteSpeech: (transcript: string, context: {character:string;situation:string}): Promise<{text: string; estimatedTextCostUsd: number}> => ipcRenderer.invoke('ai:rewrite', transcript, context),
  copyText: (value: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', value),
  openUsage: (): Promise<void> => ipcRenderer.invoke('app:open-usage'),
  setHudMoveMode: (enabled: boolean) => ipcRenderer.send('overlay:move-hud', enabled),
  saveRecording: (payload: { bytes: Uint8Array; extension: 'webm' | 'ogg' }) =>
    ipcRenderer.invoke('recording:save', payload),
  quit: () => ipcRenderer.send('app:quit'),
});
