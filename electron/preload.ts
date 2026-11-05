import { contextBridge, ipcRenderer } from 'electron';

type ViewMode = 'hud' | 'panel';

contextBridge.exposeInMainWorld('inCharacter', {
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
  onShortcutStatus: (callback: (status: { recording: boolean; panel: boolean }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: { recording: boolean; panel: boolean },
    ) => callback(status);
    ipcRenderer.on('app:shortcuts', listener);
    return () => ipcRenderer.removeListener('app:shortcuts', listener);
  },
  setViewMode: (mode: ViewMode) => ipcRenderer.send('overlay:set-mode', mode),
  saveRecording: (payload: { bytes: Uint8Array; extension: 'webm' | 'ogg' }) =>
    ipcRenderer.invoke('recording:save', payload),
  quit: () => ipcRenderer.send('app:quit'),
});
