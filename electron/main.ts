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
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { copyToClipboard, hasApiKey, processVoice, rewriteSpeech, setApiKey } from './ai';
import { ensureCustomPresetsDirectory, listPresets } from './presets';
import { addRecording, addRewriteCost, clearHistory, deleteRecording, editRecording, exportRecording, finishRecording, getRecording, listHistory, readRecording } from './history';
import { writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INITIAL_HUD_STATE, parseHudState, type HudState } from './hudState';

// Keep the original Electron userData folder after the public-facing rename.
// This preserves encrypted API keys, keyboard shortcuts, browser localStorage,
// custom presets and overlay positions for existing InCharacter users.
app.setPath('userData', join(app.getPath('appData'), 'InCharacter'));

type WindowRole = 'hud' | 'panel';
type SaveResult = { canceled: true } | { canceled: false; filePath: string };

// HUD width is measured from its one-line content; the window is resized to fit.
const HUD = { width: 170, height: 40 };
const HUD_MIN_WIDTH = 96;
const HUD_MAX_WIDTH = 390;
const PANEL = { width: 520, height: 705 };
type ShortcutSettings = { record: string; panel: string; move: string };
const DEFAULT_SHORTCUTS: ShortcutSettings = {
  record: 'CapsLock',
  panel: 'Ctrl+Shift+O',
  move: 'Ctrl+Shift+M',
};
const LEGACY_SHORTCUTS: ShortcutSettings = {
  record: 'Ctrl+Shift+Space',
  panel: 'Ctrl+Shift+O',
  move: 'Ctrl+Shift+M',
};
let shortcuts: ShortcutSettings = { ...DEFAULT_SHORTCUTS };
const shortcutFile = join(app.getPath('userData'), 'shortcuts.json');

const STANDARD_KEYS = new Set([
  'Space','CapsLock','Tab','Enter','Backspace','Escape',
  'Delete','Insert','Home','End','PageUp','PageDown',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
]);

function normalizeShortcut(input: string): string {
  if (typeof input !== 'string' || input.length > 64) throw new Error('Некорректное сочетание клавиш.');
  const parts = input.split('+').map(part => part.trim()).filter(Boolean);
  const modifiers = new Set<string>();
  let key = '';
  for (const part of parts) {
    const lowered = part.toLowerCase();
    if (lowered === 'ctrl' || lowered === 'control') modifiers.add('Ctrl');
    else if (lowered === 'shift') modifiers.add('Shift');
    else if (lowered === 'alt') modifiers.add('Alt');
    else if (!key && (/^[a-z0-9]$/i.test(part) || /^f(?:[1-9]|1[0-2])$/i.test(part))) {
      key = part.toUpperCase();
    } else if (!key && [...STANDARD_KEYS].some(k => k.toLowerCase() === lowered)) {
      key = [...STANDARD_KEYS].find(k => k.toLowerCase() === lowered)!;
    } else {
      throw new Error('Используй одну клавишу или сочетание с Ctrl, Alt и Shift.');
    }
  }
  if (!key) throw new Error('Назначь основную клавишу (одиночные Ctrl/Alt/Shift не поддерживаются).');
  return [...['Ctrl','Alt','Shift'].filter(v => modifiers.has(v)),key].join('+');
}

function validateShortcuts(input: ShortcutSettings): ShortcutSettings {
  if (!input || typeof input !== 'object') throw new Error('Некорректные настройки клавиш.');
  const next = {
    record: normalizeShortcut(input.record),
    panel: normalizeShortcut(input.panel),
    move: normalizeShortcut(input.move),
  };
  if (new Set(Object.values(next)).size !== 3) throw new Error('У разных действий должны быть разные клавиши.');
  const primaryKeys = Object.values(next).map(value => value.split('+').at(-1));
  if (new Set(primaryKeys).size !== 3) {
    throw new Error('Для разных действий используй разные основные клавиши, чтобы сочетания не срабатывали одновременно.');
  }
  return next;
}

function loadShortcuts() {
  try {
    if (existsSync(shortcutFile)) {
      shortcuts = validateShortcuts(JSON.parse(readFileSync(shortcutFile, 'utf8')));
      if (Object.keys(shortcuts).every(action =>
        shortcuts[action as keyof ShortcutSettings] === LEGACY_SHORTCUTS[action as keyof ShortcutSettings])) {
        shortcuts = { ...DEFAULT_SHORTCUTS };
        storeShortcuts();
      }
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


let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let hudState: HudState = { ...INITIAL_HUD_STATE };
let shortcutStatus = { recording: false, panel: false, move: false, hold: false };
let hotkeyHelper: ChildProcessWithoutNullStreams | null = null;
let isQuitting = false;
let shortcutCaptureActive = false;
let hudMoveEnabled = false;
let hudOpacity = 0.76; // Default matches the previous HUD appearance.
let dragAnchor: { cursor: {x:number;y:number}; position: {x:number;y:number} } | null = null;

type SavedPosition = { x: number; y: number };
type SavedPositions = Partial<Record<WindowRole, SavedPosition>>;
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

function rememberPosition(view: WindowRole) {
  const window = view === 'hud' ? hudWindow : mainWindow;
  if (!window || window.isDestroyed()) return;
  if (view === 'panel' && window.isMinimized()) return;
  const { x, y } = window.getBounds();
  positions[view] = { x, y };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPositions, 400);
}

function windowBounds(view: WindowRole) {
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
  if (view === 'panel') {
    const { workArea } = screen.getPrimaryDisplay();
    return {
      x: Math.round(workArea.x + Math.max(0, (workArea.width - size.width) / 2)),
      y: Math.round(workArea.y + Math.max(0, (workArea.height - size.height) / 2)),
      ...size,
    };
  }
  return defaultBounds(size);
}

function sendHudState() {
  hudWindow?.webContents.send('hud:state', { ...hudState, moveEnabled: hudMoveEnabled });
}

function setHudMoveMode(enabled: boolean) {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  hudMoveEnabled = enabled;
  if (!enabled) dragAnchor = null;
  hudWindow.setIgnoreMouseEvents(!enabled, { forward: true });
  hudWindow.showInactive();
  sendHudState();
}

function toggleHudMoveMode() {
  setHudMoveMode(!hudMoveEnabled);
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized() || !mainWindow.isVisible() || !mainWindow.isFocused()) {
    mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow.minimize();
  }
}

function defaultBounds(size: { width: number; height: number }) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - size.width - 24,
    y: workArea.y + 30,
    ...size,
  };
}

function updateHudWidth(nextWidth: number) {
  if (!Number.isFinite(nextWidth) || !hudWindow || hudWindow.isDestroyed()) return;
  const width = Math.max(HUD_MIN_WIDTH, Math.min(HUD_MAX_WIDTH, Math.round(nextWidth)));
  if (Math.abs(width - HUD.width) <= 1) return;
  const previous = HUD.width;
  HUD.width = width;
  const current = hudWindow.getBounds();
  const display = screen.getDisplayMatching(current).workArea;
  const isRight = current.x + previous / 2 > display.x + display.width / 2;
  const desiredX = isRight ? current.x + previous - width : current.x;
  const x = Math.max(display.x, Math.min(desiredX, display.x + display.width - width));
  hudWindow.setBounds({ x, y: current.y, width, height: HUD.height }, false);
  rememberPosition('hud');
}

function requestWindowsRoundedCorners(window: BrowserWindow) {
  if (process.platform !== 'win32' || window.isDestroyed()) return;
  const handle = window.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
  // Keep the opaque HUD model: alpha windows previously produced a ghost frame.
  execFile(nativeHotkeyBinary(), ['--round-corners', hwnd], { windowsHide: true, timeout: 3000 }, error => {
    if (error) console.warn('Could not request DWM rounded corners:', error.message);
  });
}

function loadWindow(window: BrowserWindow, view: WindowRole) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    if (view === 'hud') url.searchParams.set('view', view);
    void window.loadURL(url.toString());
  } else {
    // Keep the editor's original file URL so existing localStorage stays intact.
    void window.loadFile(join(__dirname, '../dist/index.html'), view === 'hud' ? { query: { view } } : undefined);
  }
}

function createWindows() {
  mainWindow = new BrowserWindow({
    ...windowBounds('panel'),
    useContentSize: true,
    minWidth: 520,
    minHeight: 600,
    title: `SpeakInCharacter ${app.getVersion()}`,
    frame: true,
    transparent: false,
    backgroundColor: '#242424',
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: false, webSecurity: true,
      // This renderer owns the sole recorder even while minimized in the game.
      backgroundThrottling: false,
      additionalArguments: ['--speak-window=panel'],
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('moved', () => rememberPosition('panel'));
  mainWindow.on('closed', () => { mainWindow = null; if (!isQuitting) app.quit(); });
  mainWindow.on('blur', () => setShortcutCapture(false));
  mainWindow.on('minimize', () => setShortcutCapture(false));
  mainWindow.webContents.on('did-finish-load', reportShortcutStatus);
  loadWindow(mainWindow, 'panel');

  hudWindow = new BrowserWindow({
    ...windowBounds('hud'),
    title: '', frame: false, transparent: false, backgroundColor: '#202a2e',
    resizable: false, movable: true, thickFrame: true, hasShadow: false,
    roundedCorners: true, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: false, webSecurity: true,
      additionalArguments: ['--speak-window=hud'],
    },
  });
  const hud = hudWindow;
  hud.setMenuBarVisibility(false);
  hud.setAlwaysOnTop(true, 'screen-saver');
  hud.setOpacity(hudOpacity);
  hud.setIgnoreMouseEvents(true, { forward: true });
  hud.once('show', () => requestWindowsRoundedCorners(hud));
  hud.once('ready-to-show', () => hud.showInactive());
  hud.on('moved', () => rememberPosition('hud'));
  hud.on('close', event => { if (!isQuitting) event.preventDefault(); });
  hud.on('closed', () => { hudWindow = null; });
  hud.webContents.on('did-finish-load', sendHudState);
  loadWindow(hud, 'hud');
}

function setShortcutCapture(active: boolean) {
  shortcutCaptureActive = active;
  if (active) mainWindow?.webContents.send('hotkey:up');
  if (hotkeyHelper?.stdin.writable) hotkeyHelper.stdin.write(active ? 'CAPTURE_ON\n' : 'CAPTURE_OFF\n');
}

function handleMain(channel: string, listener: Parameters<typeof ipcMain.handle>[1]) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Main window required');
    return listener(event, ...args);
  });
}

function stopHoldHelper() {
  const child = hotkeyHelper;
  hotkeyHelper = null;
  if (child) {
    child.removeAllListeners('error');
    child.removeAllListeners('exit');
    child.stdout.removeAllListeners('data');
    child.stdin.end();
    child.kill();
  }
}

function reportShortcutStatus() {
  mainWindow?.webContents.send('app:shortcuts', shortcutStatus);
}

function registerToggleFallback() {
  if (!shortcutStatus.hold || isQuitting) return;
  shortcutStatus.hold = false;
  shortcutStatus.recording = globalShortcut.register(shortcuts.record, () => {
    if (!shortcutCaptureActive) mainWindow?.webContents.send('recording:toggle');
  });
  shortcutStatus.panel = globalShortcut.register(shortcuts.panel, () => {
    if (!shortcutCaptureActive) toggleMainWindow();
  });
  shortcutStatus.move = globalShortcut.register(shortcuts.move, () => {
    if (!shortcutCaptureActive) toggleHudMoveMode();
  });
  reportShortcutStatus();
}

function nativeHotkeyBinary(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'native', 'hotkey.exe')
    : join(__dirname, '../native/hotkey.exe');
}

async function getWindowsUILanguages(): Promise<string[]> {
  const preferred = app.getPreferredSystemLanguages();
  if (process.platform !== 'win32') return preferred;
  try {
    const { stdout } = await execFileAsync(nativeHotkeyBinary(), ['--system-language'], {
      windowsHide: true, timeout: 3000,
    });
    const language = stdout.trim().split(/\r?\n/)[0];
    if (/^[a-z]{2,3}(?:-[a-zA-Z0-9]+)*$/i.test(language)) {
      // Windows display-language API is authoritative; application preference
      // order can differ from the language of Windows menus and Settings.
      return [language, ...preferred.filter(value => value.toLowerCase() !== language.toLowerCase())];
    }
  } catch (error) {
    console.warn('Native Windows display language unavailable:', error);
  }
  return preferred;
}

function startHoldHelper(): boolean {
  if (process.platform !== 'win32') return false;
  const binary = nativeHotkeyBinary();
  if (!existsSync(binary)) return false;

  try {
    const child = spawn(binary, [shortcuts.record, shortcuts.panel, shortcuts.move, ...(shortcutCaptureActive ? ['--capture'] : [])], { windowsHide: true });
    hotkeyHelper = child;
    let buffer = '';
    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const event = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (shortcutCaptureActive) continue;
        if (event === 'RECORD_DOWN') mainWindow?.webContents.send('hotkey:down');
        else if (event === 'RECORD_UP') mainWindow?.webContents.send('hotkey:up');
        else if (event === 'PANEL_DOWN') toggleMainWindow();
        else if (event === 'MOVE_DOWN') toggleHudMoveMode();
      }
    });
    child.stderr.on('data', (data: Buffer) => console.error('Native hotkeys:', data.toString('utf8').trim()));
    child.on('error', error => {
      console.error('Hotkey helper error:', error);
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
    console.error('Unable to launch hotkey helper:', error);
    return false;
  }
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  stopHoldHelper();
  const hold = startHoldHelper();
  shortcutStatus = {
    recording: hold || globalShortcut.register(shortcuts.record, () => {
      if (!shortcutCaptureActive) mainWindow?.webContents.send('recording:toggle');
    }),
    hold,
    panel: hold || globalShortcut.register(shortcuts.panel, () => {
      if (!shortcutCaptureActive) toggleMainWindow();
    }),
    move: hold || globalShortcut.register(shortcuts.move, () => {
      if (!shortcutCaptureActive) toggleHudMoveMode();
    }),
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
  app.setAppUserModelId('io.speakincharacter.app');

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && webContents.id === mainWindow?.webContents.id);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media' && webContents?.id === mainWindow?.webContents.id;
  });

  ipcMain.on('hud:publish-state', (event, value: unknown) => {
    if (event.sender !== mainWindow?.webContents) return;
    const next = parseHudState(value);
    if (!next) return;
    hudState = next;
    sendHudState();
  });
  ipcMain.handle('hud:get-state', event => {
    if (event.sender !== hudWindow?.webContents) throw new Error('HUD window required');
    return { ...hudState, moveEnabled: hudMoveEnabled };
  });
  ipcMain.on('hud:resize', (event, width: number) => {
    if (event.sender === hudWindow?.webContents) updateHudWidth(width);
  });
  ipcMain.on('hud:set-opacity', (event, opacityPercent: number) => {
    if (event.sender !== mainWindow?.webContents || !Number.isFinite(opacityPercent)) return;
    if (opacityPercent < 10 || opacityPercent > 100) return;
    hudOpacity = opacityPercent / 100;
    hudWindow?.setOpacity(hudOpacity);
  });
  ipcMain.on('overlay:move-hud', (event, enabled: boolean) => {
    if (event.sender !== mainWindow?.webContents && event.sender !== hudWindow?.webContents) return;
    if (typeof enabled === 'boolean') setHudMoveMode(enabled);
  });
  ipcMain.on('overlay:drag-start', event => {
    if (event.sender !== hudWindow?.webContents || !hudMoveEnabled || !hudWindow) return;
    const { x, y } = hudWindow.getBounds();
    dragAnchor = { cursor: screen.getCursorScreenPoint(), position: { x, y } };
  });
  ipcMain.on('overlay:drag-move', event => {
    if (event.sender !== hudWindow?.webContents || !dragAnchor || !hudMoveEnabled || !hudWindow) return;
    const cursor = screen.getCursorScreenPoint();
    hudWindow.setBounds({
      x: Math.round(dragAnchor.position.x + cursor.x - dragAnchor.cursor.x),
      y: Math.round(dragAnchor.position.y + cursor.y - dragAnchor.cursor.y),
      width: HUD.width, height: HUD.height,
    }, false);
  });
  ipcMain.on('overlay:drag-end', event => {
    if (event.sender !== hudWindow?.webContents) return;
    dragAnchor = null;
    rememberPosition('hud');
    flushPositions();
  });

  // All network requests, secrets and clipboard writes stay in the privileged main process.
  handleMain('ai:key-status', () => hasApiKey());
  handleMain('ai:save-key', (_event, key: string) => setApiKey(key));
  handleMain('ai:process', (_event, payload: Parameters<typeof processVoice>[0]) => processVoice(payload));
  handleMain('ai:rewrite', (_event, transcript: string, context: {additionalContext:string;targetLanguage:string;presetId:string}) => rewriteSpeech(transcript, context));
  handleMain('presets:list', () => listPresets());
  handleMain('presets:open-folder', async () => {
    const folder = ensureCustomPresetsDirectory();
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
  });
  handleMain('clipboard:copy', (_event, value: string) => copyToClipboard(value));
  // Persistent audio/metadata remain in userData. Renderer never supplies paths.
  handleMain('history:list', () => listHistory());
  handleMain('history:add', (_event, payload: Parameters<typeof addRecording>[0]) => addRecording(payload));
  handleMain('history:finish', (_event, id: string, result: Parameters<typeof finishRecording>[1]) => finishRecording(id, result));
  handleMain('history:edit', (_event, id: string, changes: { transcript?: string; english?: string }) => editRecording(id, changes));
  handleMain('history:rewrite', (_event, id: string, english: string, cost: number) => addRewriteCost(id, english, cost));
  handleMain('history:read-audio', (_event, id: string) => readRecording(id));
  handleMain('history:delete', (_event, id: string) => deleteRecording(id));
  handleMain('history:clear', (_event, days: number | null) => clearHistory(days));
  handleMain('history:export', async (_event, id: string): Promise<SaveResult> => {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Window unavailable');
    const entry = getRecording(id);
    const date = new Date(entry.createdAt).toISOString().replace(/[:.]/g, '-');
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Save voice recording',
      defaultPath: join(app.getPath('documents'), `SpeakInCharacter-${date}.${entry.extension}`),
      filters: [{ name: 'Voice recording', extensions: [entry.extension] }],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    exportRecording(id, choice.filePath);
    return { canceled: false, filePath: choice.filePath };
  });
  handleMain('app:open-usage', () => shell.openExternal('https://platform.openai.com/usage'));
  handleMain('app:preferred-languages', () => getWindowsUILanguages());
  ipcMain.on('app:theme-background', (event, scheme: string) => {
    if (event.sender !== mainWindow?.webContents || (scheme !== 'dark' && scheme !== 'light')) return;
    mainWindow?.setBackgroundColor(scheme === 'dark' ? '#242424' : '#ffffff');
  });
  handleMain('shortcuts:get', () => ({ shortcuts: { ...shortcuts }, status: { ...shortcutStatus } }));
  handleMain('shortcuts:set', (_event, value: ShortcutSettings) => updateShortcuts(value));
  ipcMain.on('shortcuts:capture', (event, active: boolean) => {
    if (event.sender === mainWindow?.webContents) setShortcutCapture(active === true);
  });
  ipcMain.on('app:quit', event => {
    if (event.sender === mainWindow?.webContents) app.quit();
  });

  handleMain('recording:save', async (_event, payload: {
    bytes: Uint8Array;
    extension: 'webm' | 'ogg';
  }): Promise<SaveResult> => {
    if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Window unavailable');
    if (payload?.extension !== 'webm' && payload?.extension !== 'ogg') {
      throw new Error('Unsupported audio format');
    }
    if (!payload.bytes || payload.bytes.byteLength === 0 || payload.bytes.byteLength > 100_000_000) {
      throw new Error('Invalid recording size');
    }
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `SpeakInCharacter-${date}.${payload.extension}`;
    const choice = await dialog.showSaveDialog(mainWindow, {
      title: 'Save voice recording',
      defaultPath: join(app.getPath('documents'), name),
      filters: [{ name: 'Voice recording', extensions: [payload.extension] }],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    await writeFile(choice.filePath, Buffer.from(payload.bytes));
    return { canceled: false, filePath: choice.filePath };
  });

  createWindows();
  registerShortcuts();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('activate', () => {
  if (!mainWindow) return;
  mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
app.on('will-quit', () => {
  isQuitting = true;
  if (saveTimer) flushPositions();
  stopHoldHelper();
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());
