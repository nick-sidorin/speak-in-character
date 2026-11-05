import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
} from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyToClipboard, hasApiKey, processVoice, rewriteSpeech, setApiKey } from './ai';
import { writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type ViewMode = 'hud' | 'panel';
type SaveResult = { canceled: true } | { canceled: false; filePath: string };

const HUD = { width: 370, height: 116 };
const PANEL = { width: 520, height: 705 };
type ShortcutSettings = { record: string; panel: string; move: string };
const DEFAULT_SHORTCUTS: ShortcutSettings = {
  record: 'Ctrl+Shift+Space',
  panel: 'Ctrl+Shift+O',
  move: 'Ctrl+Shift+M',
};
let shortcuts: ShortcutSettings = { ...DEFAULT_SHORTCUTS };
const shortcutFile = join(app.getPath('userData'), 'shortcuts.json');

function normalizeShortcut(input: string): string {
  if (typeof input !== 'string') throw new Error('Неверное сочетание клавиш.');
  const parts = input.split('+').map(part => part.trim());
  const modifiers = new Set<string>();
  let key = '';
  for (const part of parts) {
    const lowered = part.toLowerCase();
    if (lowered === 'ctrl' || lowered === 'control') modifiers.add('Ctrl');
    else if (lowered === 'shift') modifiers.add('Shift');
    else if (lowered === 'alt') modifiers.add('Alt');
    else if (!key && (/^[A-Za-z0-9]$/.test(part) || /^F(?:[1-9]|1[0-2])$/i.test(part) || lowered === 'space')) {
      key = lowered === 'space' ? 'Space' : part.toUpperCase();
    } else throw new Error('Сочетание должно состоять из модификатора и одной клавиши A–Z, 0–9, F1–F12 или Space.');
  }
  if (!modifiers.size || !key) throw new Error('Нужно указать модификатор и основную клавишу.');
  return [...['Ctrl','Alt','Shift'].filter(v=>modifiers.has(v)),key].join('+');
}

function validateShortcuts(input: ShortcutSettings): ShortcutSettings {
  if (!input || typeof input !== 'object') throw new Error('Некорректные настройки горячих клавиш.');
  const result = {
    record: normalizeShortcut(input.record),
    panel: normalizeShortcut(input.panel),
    move: normalizeShortcut(input.move),
  };
  if (new Set(Object.values(result)).size !== 3) throw new Error('Для трёх действий нужны разные сочетания клавиш.');
  return result;
}

function loadShortcuts() {
  try {
    if (existsSync(shortcutFile)) {
      shortcuts = validateShortcuts(JSON.parse(readFileSync(shortcutFile, 'utf8')));
    }
  } catch (error) {
    console.warn('Invalid saved shortcuts, using defaults:', error);
    shortcuts = { ...DEFAULT_SHORTCUTS };
  }
}

function storeShortcuts() {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(shortcutFile, JSON.stringify(shortcuts, null, 2), 'utf8');
}


let overlay: BrowserWindow | null = null;
let mode: ViewMode = 'hud';
let shortcutStatus = { recording: false, panel: false, move: false, hold: false };
let hotkeyHelper: ChildProcessWithoutNullStreams | null = null;
let isQuitting = false;
let hudMoveEnabled = false;
let dragAnchor: { cursor: {x:number;y:number}; position: {x:number;y:number} } | null = null;

type SavedPosition = { x: number; y: number };
type SavedPositions = Partial<Record<ViewMode, SavedPosition>>;
const positionFile = join(app.getPath('userData'), 'window-positions.json');
let positions: SavedPositions = {};
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function loadPositions() {
  try {
    if (existsSync(positionFile)) {
      const value: unknown = JSON.parse(readFileSync(positionFile, 'utf8'));
      if (value && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        for (const view of ['hud', 'panel'] as const) {
          const item = source[view];
          if (item && typeof item === 'object') {
            const candidate = item as Record<string, unknown>;
            if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y)) {
              positions[view] = { x: candidate.x as number, y: candidate.y as number };
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Unable to load saved overlay positions:', error);
  }
}

function flushPositions() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(positionFile, JSON.stringify(positions, null, 2), 'utf8');
  } catch (error) {
    console.warn('Unable to save overlay positions:', error);
  }
}

function rememberPosition() {
  if (!overlay || overlay.isDestroyed()) return;
  const { x, y } = overlay.getBounds();
  positions[mode] = { x, y };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPositions, 400);
}

function windowBounds(view: ViewMode) {
  const size = view === 'hud' ? HUD : PANEL;
  const saved = positions[view];
  if (saved) {
    // Prevent an invisible overlay when a monitor is disconnected.
    const visible = screen.getAllDisplays().some(({ workArea }) => {
      const overlapX = Math.max(0, Math.min(saved.x + size.width, workArea.x + workArea.width) - Math.max(saved.x, workArea.x));
      const overlapY = Math.max(0, Math.min(saved.y + size.height, workArea.y + workArea.height) - Math.max(saved.y, workArea.y));
      return overlapX >= Math.min(120, size.width) && overlapY >= Math.min(60, size.height);
    });
    if (visible) {
      const { workArea: work } = screen.getDisplayMatching({ ...saved, ...size });
      return {
        x: Math.max(work.x, Math.min(saved.x, work.x + Math.max(0, work.width - size.width))),
        y: Math.max(work.y, Math.min(saved.y, work.y + Math.max(0, work.height - size.height))),
        ...size,
      };
    }
  }
  return defaultBounds(size);
}

function setHudMoveMode(enabled: boolean) {
  if (!overlay || overlay.isDestroyed() || mode !== 'hud') return;
  hudMoveEnabled = enabled;
  // Keep the window focusable to avoid Windows redraws of native decorations.
  // Click-through is controlled only via ignoreMouseEvents.
  if (!enabled) dragAnchor = null;
  if (enabled) {
    overlay.setIgnoreMouseEvents(false);
    overlay.showInactive();
  } else {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.showInactive();
  }
  overlay.webContents.send('overlay:move-mode', enabled);
}

function toggleHudMoveMode() {
  if (!overlay || overlay.isDestroyed()) return;
  if (mode !== 'hud') changeMode('hud');
  setHudMoveMode(!hudMoveEnabled);
}

function defaultBounds(size: { width: number; height: number }) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - size.width - 24,
    y: workArea.y + 30,
    width: size.width,
    height: size.height,
  };
}

function changeMode(next: ViewMode) {
  if (!overlay || overlay.isDestroyed()) return;
  if (mode === 'hud' && hudMoveEnabled) setHudMoveMode(false);
  mode = next;
  if (next === 'panel') {
    overlay.setIgnoreMouseEvents(false);
    overlay.setBounds(windowBounds('panel'));
    overlay.show();
    overlay.focus();
  } else {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setBounds(windowBounds('hud'));
    overlay.showInactive();
  }
  overlay.webContents.send('overlay:mode', mode);
  overlay.webContents.send('overlay:move-mode', hudMoveEnabled);
}

function createOverlay() {
  overlay = new BrowserWindow({
    ...windowBounds('hud'),
    title: '',
    frame: false,
    // Opaque frameless windows avoid a known Windows 11 inactive DWM decoration bug.
    transparent: false,
    backgroundColor: '#171c20',
    resizable: false,
    movable: true,
    thickFrame: false,
    hasShadow: false,
    roundedCorners: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  overlay.setMenuBarVisibility(false);
  overlay.setHasShadow(false);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });

  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('did-finish-load', () => {
    overlay?.webContents.send('overlay:mode', mode);
    overlay?.webContents.send('overlay:move-mode', hudMoveEnabled);
    overlay?.webContents.send('app:shortcuts', shortcutStatus);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void overlay.loadURL(devUrl);
  } else {
    void overlay.loadFile(join(__dirname, '../dist/index.html'));
  }
  overlay.on('moved', rememberPosition);
  overlay.once('ready-to-show', () => overlay?.showInactive());
  overlay.on('closed', () => { overlay = null; });
}

function stopHoldHelper() {
  const child = hotkeyHelper;
  hotkeyHelper = null;
  if (child) {
    child.removeAllListeners('error');
    child.removeAllListeners('exit');
    child.stdout.removeAllListeners('data');
    child.kill();
  }
}

function reportShortcutStatus() {
  overlay?.webContents.send('app:shortcuts', shortcutStatus);
}

function registerToggleFallback() {
  if (!shortcutStatus.hold || isQuitting) return;
  shortcutStatus.hold = false;
  shortcutStatus.recording = globalShortcut.register(shortcuts.record, () => {
    overlay?.webContents.send('recording:toggle');
  });
  reportShortcutStatus();
}

function startHoldHelper(): boolean {
  if (process.platform !== 'win32') return false;
  const binary = app.isPackaged
    ? join(process.resourcesPath, 'native', 'hotkey.exe')
    : join(__dirname, '../native/hotkey.exe');
  if (!existsSync(binary)) return false;

  try {
    const child = spawn(binary, [shortcuts.record], { windowsHide: true });
    hotkeyHelper = child;
    let buffer = '';
    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line === 'DOWN' || line === 'UP') {
          overlay?.webContents.send(line === 'DOWN' ? 'hotkey:down' : 'hotkey:up');
        }
      }
    });
    child.on('error', error => {
      console.error('Push-to-talk helper error:', error);
      if (hotkeyHelper === child) {
        hotkeyHelper = null;
        registerToggleFallback();
      }
    });
    child.on('exit', () => {
      if (hotkeyHelper === child) {
        hotkeyHelper = null;
        registerToggleFallback();
      }
    });
    return true;
  } catch (error) {
    console.error('Unable to launch push-to-talk helper:', error);
    return false;
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  stopHoldHelper();
  const hold = startHoldHelper();
  shortcutStatus = {
    recording: hold || globalShortcut.register(shortcuts.record, () => {
      overlay?.webContents.send('recording:toggle');
    }),
    hold,
    panel: globalShortcut.register(shortcuts.panel, () => {
      changeMode(mode === 'hud' ? 'panel' : 'hud');
    }),
    move: globalShortcut.register(shortcuts.move, toggleHudMoveMode),
  };
  reportShortcutStatus();
}

function updateShortcuts(input: ShortcutSettings) {
  const previous = { ...shortcuts };
  const proposed = validateShortcuts(input);
  shortcuts = proposed;
  registerShortcuts();
  if (!shortcutStatus.recording || !shortcutStatus.panel || !shortcutStatus.move) {
    shortcuts = previous;
    registerShortcuts();
    throw new Error('Не удалось зарегистрировать сочетание: оно, возможно, занято другой программой.');
  }
  try {
    storeShortcuts();
  } catch (error) {
    shortcuts = previous;
    registerShortcuts();
    throw error;
  }
  return { shortcuts: { ...shortcuts }, status: { ...shortcutStatus } };
}

app.whenReady().then(() => {
  loadPositions();
  loadShortcuts();
  app.setAppUserModelId('io.incharacter.speak');

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && webContents.id === overlay?.webContents.id);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' && webContents?.id === overlay?.webContents.id;
  });

  ipcMain.on('overlay:set-mode', (_event, next: ViewMode) => {
    if (next === 'panel' || next === 'hud') changeMode(next);
  });

  ipcMain.on('overlay:move-hud', (_event, enabled: boolean) => {
    if (enabled && mode !== 'hud') changeMode('hud');
    setHudMoveMode(Boolean(enabled));
  });

  ipcMain.on('overlay:drag-start', () => {
    if ((mode === 'hud' && !hudMoveEnabled) || !overlay || overlay.isDestroyed()) return;
    dragAnchor = { cursor: screen.getCursorScreenPoint(), position: overlay.getPosition().reduce((p, v, i) => ({ ...p, [i === 0 ? 'x' : 'y']: v }), { x: 0, y: 0 }) };
  });
  ipcMain.on('overlay:drag-move', () => {
    if (!dragAnchor || (mode === 'hud' && !hudMoveEnabled) || !overlay || overlay.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    overlay.setBounds({
      x: Math.round(dragAnchor.position.x + cursor.x - dragAnchor.cursor.x),
      y: Math.round(dragAnchor.position.y + cursor.y - dragAnchor.cursor.y),
      width: mode === 'hud' ? HUD.width : PANEL.width,
      height: mode === 'hud' ? HUD.height : PANEL.height,
    }, false);
  });
  ipcMain.on('overlay:drag-end', () => {
    dragAnchor = null;
    rememberPosition();
    flushPositions();
  });

  // All network requests, secrets and clipboard writes stay in the privileged main process.
  ipcMain.handle('ai:key-status', () => hasApiKey());
  ipcMain.handle('ai:save-key', (_event, key: string) => setApiKey(key));
  ipcMain.handle('ai:process', (_event, payload: Parameters<typeof processVoice>[0]) => processVoice(payload));
  ipcMain.handle('ai:rewrite', (_event, transcript: string, context: {character:string;situation:string}) => rewriteSpeech(transcript, context));
  ipcMain.handle('clipboard:copy', (_event, value: string) => copyToClipboard(value));
  ipcMain.handle('app:open-usage', () => shell.openExternal('https://platform.openai.com/usage'));
  ipcMain.handle('shortcuts:get', () => ({ shortcuts: { ...shortcuts }, status: { ...shortcutStatus } }));
  ipcMain.handle('shortcuts:set', (_event, value: ShortcutSettings) => updateShortcuts(value));

  ipcMain.on('app:quit', () => app.quit());

  ipcMain.handle('recording:save', async (_event, payload: {
    bytes: Uint8Array;
    extension: 'webm' | 'ogg';
  }): Promise<SaveResult> => {
    if (!overlay || overlay.isDestroyed()) throw new Error('Window unavailable');
    if (payload?.extension !== 'webm' && payload?.extension !== 'ogg') {
      throw new Error('Unsupported audio format');
    }
    if (!payload.bytes || payload.bytes.byteLength === 0 || payload.bytes.byteLength > 100_000_000) {
      throw new Error('Invalid recording size');
    }
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `InCharacter-${date}.${payload.extension}`;
    const choice = await dialog.showSaveDialog(overlay, {
      title: 'Save voice recording',
      defaultPath: join(app.getPath('documents'), name),
      filters: [{ name: 'Voice recording', extensions: [payload.extension] }],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    await writeFile(choice.filePath, Buffer.from(payload.bytes));
    return { canceled: false, filePath: choice.filePath };
  });

  createOverlay();
  registerShortcuts();
});

app.on('will-quit', () => {
  isQuitting = true;
  if (saveTimer) flushPositions();
  stopHoldHelper();
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());
