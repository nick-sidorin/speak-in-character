import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  session,
} from 'electron';
import { copyToClipboard, hasApiKey, processVoice, rewriteSpeech, setApiKey } from './ai';
import { writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type ViewMode = 'hud' | 'panel';
type SaveResult = { canceled: true } | { canceled: false; filePath: string };

const HUD = { width: 330, height: 92 };
const PANEL = { width: 500, height: 790 };
const SHORTCUT_RECORD = 'CommandOrControl+Shift+Space';
const SHORTCUT_PANEL = 'CommandOrControl+Shift+O';
const SHORTCUT_MOVE = 'CommandOrControl+Shift+M';

let overlay: BrowserWindow | null = null;
let mode: ViewMode = 'hud';
let shortcutStatus = { recording: false, panel: false, move: false };
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
    if (visible) return { ...saved, ...size };
  }
  return defaultBounds(size);
}

function setHudMoveMode(enabled: boolean) {
  if (!overlay || overlay.isDestroyed() || mode !== 'hud') return;
  hudMoveEnabled = enabled;
  overlay.setFocusable(enabled);
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
    overlay.setFocusable(true);
    overlay.setIgnoreMouseEvents(false);
    overlay.setBounds(windowBounds('panel'));
    overlay.show();
    overlay.focus();
  } else {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setFocusable(false);
    overlay.setBounds(windowBounds('hud'));
    overlay.showInactive();
  }
  overlay.webContents.send('overlay:mode', mode);
  overlay.webContents.send('overlay:move-mode', hudMoveEnabled);
}

function createOverlay() {
  overlay = new BrowserWindow({
    ...windowBounds('hud'),
    title: 'InCharacter',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    thickFrame: false,
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

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setFocusable(false);

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

function registerShortcuts() {
  shortcutStatus = {
    recording: globalShortcut.register(SHORTCUT_RECORD, () => {
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('recording:toggle');
      }
    }),
    panel: globalShortcut.register(SHORTCUT_PANEL, () => {
      changeMode(mode === 'hud' ? 'panel' : 'hud');
    }),
    move: globalShortcut.register(SHORTCUT_MOVE, toggleHudMoveMode),
  };
  overlay?.webContents.send('app:shortcuts', shortcutStatus);
}

app.whenReady().then(() => {
  loadPositions();
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
    if (!hudMoveEnabled || mode !== 'hud' || !overlay || overlay.isDestroyed()) return;
    dragAnchor = { cursor: screen.getCursorScreenPoint(), position: overlay.getPosition().reduce((p, v, i) => ({ ...p, [i === 0 ? 'x' : 'y']: v }), { x: 0, y: 0 }) };
  });
  ipcMain.on('overlay:drag-move', () => {
    if (!dragAnchor || !hudMoveEnabled || !overlay || overlay.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    overlay.setPosition(
      Math.round(dragAnchor.position.x + cursor.x - dragAnchor.cursor.x),
      Math.round(dragAnchor.position.y + cursor.y - dragAnchor.cursor.y),
    );
  });
  ipcMain.on('overlay:drag-end', () => {
    dragAnchor = null;
    rememberPosition();
  });

  // All network requests, secrets and clipboard writes stay in the privileged main process.
  ipcMain.handle('ai:key-status', () => hasApiKey());
  ipcMain.handle('ai:save-key', (_event, key: string) => setApiKey(key));
  ipcMain.handle('ai:process', (_event, payload: Parameters<typeof processVoice>[0]) => processVoice(payload));
  ipcMain.handle('ai:rewrite', (_event, transcript: string, context: {character:string;situation:string}) => rewriteSpeech(transcript, context));
  ipcMain.handle('clipboard:copy', (_event, value: string) => copyToClipboard(value));

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
  if (saveTimer) flushPositions();
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());
