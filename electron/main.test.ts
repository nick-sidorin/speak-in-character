import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({
  directory: '',
  windows: [] as any[],
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  shortcuts: new Map<string, () => void>(),
  appEvents: new Map<string, () => void>(),
  start: () => {},
  permissionCheck: (..._args: any[]) => false,
  quit: vi.fn(),
  hasApiKey: vi.fn(() => false),
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    options: any;
    bounds: any;
    minimized = false;
    visible = false;
    focused = false;
    webContents = Object.assign(new EventEmitter(), {
      id: fake.windows.length + 1,
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    });
    constructor(options: any) { super(); this.options = options; this.bounds = { ...options }; fake.windows.push(this); }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    isVisible() { return this.visible; }
    isFocused() { return this.focused; }
    show = vi.fn(() => { this.visible = true; this.focused = true; this.emit('show'); });
    showInactive = vi.fn(() => { this.visible = true; this.emit('show'); });
    focus = vi.fn(() => { this.focused = true; });
    minimize() { this.minimized = true; this.focused = false; this.emit('minimize'); }
    restore() { this.minimized = false; }
    loadFile = vi.fn();
    loadURL = vi.fn();
    setMenuBarVisibility = vi.fn();
    setAlwaysOnTop = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    setOpacity = vi.fn();
    setBackgroundColor = vi.fn();
    getBounds() { return this.bounds; }
    setBounds(value: any) { Object.assign(this.bounds, value); }
  }
  return {
    BrowserWindow: Window,
    app: {
      getPath: () => fake.directory, setPath: vi.fn(), getVersion: () => '0.11.0', setAppUserModelId: vi.fn(),
      whenReady: () => ({ then: (callback: () => void) => { fake.start = callback; } }),
      on: (name: string, callback: () => void) => fake.appEvents.set(name, callback),
      quit: fake.quit,
    },
    ipcMain: {
      on: (name: string, callback: (...args: any[]) => any) => fake.listeners.set(name, callback),
      handle: (name: string, callback: (...args: any[]) => any) => fake.handlers.set(name, callback),
    },
    globalShortcut: { register: (key: string, callback: () => void) => { fake.shortcuts.set(key, callback); return true; }, unregisterAll: vi.fn() },
    screen: {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
      getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    },
    session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: (callback: any) => { fake.permissionCheck = callback; } } },
    dialog: {}, shell: {},
  };
});
vi.mock('./ai', () => ({ hasApiKey: fake.hasApiKey }));
vi.mock('./history', () => ({}));
vi.mock('./presets', () => ({}));

beforeEach(async () => {
  vi.resetModules();
  fake.directory = mkdtempSync(join(tmpdir(), 'speak-windows-'));
  fake.windows.length = 0;
  fake.handlers.clear(); fake.listeners.clear(); fake.shortcuts.clear(); fake.appEvents.clear();
  fake.quit.mockClear(); fake.hasApiKey.mockClear();
  await import('./main');
  fake.start();
  fake.windows.forEach(window => window.emit('ready-to-show'));
});
afterEach(() => {
  fake.appEvents.get('will-quit')?.();
  rmSync(fake.directory, { recursive: true, force: true });
});
const sender = (index: number) => ({ sender: fake.windows[index].webContents });
const emit = (channel: string, index: number, ...args: unknown[]) => fake.listeners.get(channel)!(sender(index), ...args);

describe('independent editor and HUD windows', () => {
  it('opens a native taskbar editor plus a non-focusable HUD; only the editor owns media', () => {
    const [main, hud] = fake.windows;
    expect(fake.windows).toHaveLength(2);
    expect(main.options).toMatchObject({ frame: true, skipTaskbar: false, alwaysOnTop: false, webPreferences: { backgroundThrottling: false } });
    expect(hud.options).toMatchObject({ frame: false, skipTaskbar: true, alwaysOnTop: true, focusable: false });
    expect(main.show).toHaveBeenCalledOnce();
    expect(main.loadFile.mock.calls[0][1]).toBeUndefined();
    expect(hud.loadFile.mock.calls[0][1]).toEqual({ query: { view: 'hud' } });
    expect(hud.showInactive).toHaveBeenCalledOnce();
    expect(hud.focus).not.toHaveBeenCalled();
    expect(fake.permissionCheck(main.webContents, 'media')).toBe(true);
    expect(fake.permissionCheck(hud.webContents, 'media')).toBe(false);
  });

  it('repeatedly minimizes/restores the editor without hiding/reloading the HUD or rerouting recording', () => {
    const [main, hud] = fake.windows;
    const toggle = fake.shortcuts.get('Ctrl+Shift+O')!;
    toggle(); expect(main.minimized).toBe(true);
    fake.shortcuts.get('CapsLock')!();
    expect(main.webContents.send).toHaveBeenCalledWith('recording:toggle');
    expect(hud.webContents.send).not.toHaveBeenCalledWith('recording:toggle');
    toggle(); expect(main.minimized).toBe(false);
    main.focused = false;
    toggle(); expect(main.minimized).toBe(false);
    expect(main.focused).toBe(true);
    toggle(); expect(main.minimized).toBe(true);
    expect(hud.visible).toBe(true);
    expect(main.loadFile).toHaveBeenCalledOnce(); expect(hud.loadFile).toHaveBeenCalledOnce();
  });

  it('relays sanitized owner status to the HUD and rejects status from another renderer', () => {
    const state = { phase: 'recording', language: 'ru', hold: true, recordingShortcut: 'F8' };
    emit('hud:publish-state', 0, { ...state, transcript: 'private' });
    expect(fake.handlers.get('hud:get-state')!(sender(1))).toEqual({ ...state, moveEnabled: false });
    emit('hud:publish-state', 1, { ...state, phase: 'ready' });
    emit('hud:publish-state', 0, { ...state, phase: 'invalid' });
    expect(fake.handlers.get('hud:get-state')!(sender(1)).phase).toBe('recording');
    expect(() => fake.handlers.get('hud:get-state')!(sender(0))).toThrow('HUD window required');
  });

  it('changes HUD opacity and move mode without changing the editor or focusing the HUD', () => {
    const [main, hud] = fake.windows;
    emit('hud:set-opacity', 0, 40);
    emit('hud:set-opacity', 0, 101);
    emit('hud:set-opacity', 1, 100);
    expect(hud.setOpacity.mock.calls).toEqual([[0.76], [0.4]]);
    expect(main.setOpacity).not.toHaveBeenCalled();
    emit('overlay:move-hud', 0, true);
    expect(hud.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(main.minimized).toBe(false);
    expect(hud.focus).not.toHaveBeenCalled();
    expect(fake.handlers.get('hud:get-state')!(sender(1)).moveEnabled).toBe(true);
  });

  it('rejects privileged IPC from the HUD', () => {
    expect(() => fake.handlers.get('ai:key-status')!(sender(1))).toThrow('Main window required');
    expect(fake.hasApiKey).not.toHaveBeenCalled();
    expect(fake.handlers.get('ai:key-status')!(sender(0))).toBe(false);
  });

  it('persists separate legacy position keys and quits the application when the editor closes', () => {
    const [main, hud] = fake.windows;
    main.bounds = { ...main.bounds, x: 20, y: 30 };
    hud.bounds = { ...hud.bounds, x: 40, y: 50 };
    main.emit('moved');
    main.minimize();
    main.bounds = { ...main.bounds, x: -32000, y: -32000 };
    main.emit('moved');
    hud.emit('moved');
    emit('overlay:drag-end', 1);
    expect(JSON.parse(readFileSync(join(fake.directory, 'window-positions.json'), 'utf8'))).toEqual({ panel: { x: 20, y: 30 }, hud: { x: 40, y: 50 } });
    main.emit('closed');
    expect(fake.quit).toHaveBeenCalledOnce();
  });
});
