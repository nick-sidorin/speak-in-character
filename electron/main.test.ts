import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({
  directory: '',
  windows: [] as any[],
  trays: [] as any[],
  handlers: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  shortcuts: new Map<string, () => void>(),
  appEvents: new Map<string, () => void>(),
  start: () => {},
  permissionCheck: (..._args: any[]) => false,
  quit: vi.fn(),
  hasApiKey: vi.fn(() => false),
  instanceLock: vi.fn(() => true),
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
    hide = vi.fn(() => { this.visible = false; this.focused = false; this.emit('blur'); });
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
  class Tray extends EventEmitter {
    destroyed = false;
    menu: any;
    constructor(_icon: unknown) { super(); fake.trays.push(this); }
    isDestroyed() { return this.destroyed; }
    setToolTip = vi.fn();
    setContextMenu(menu: unknown) { this.menu = menu; }
    destroy = vi.fn(() => { this.destroyed = true; });
  }
  return {
    BrowserWindow: Window,
    Tray,
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    Menu: { buildFromTemplate: (items: unknown[]) => ({ items }) },
    app: {
      getPath: () => fake.directory, setPath: vi.fn(), getVersion: () => '0.11.0', setAppUserModelId: vi.fn(),
      whenReady: () => ({ then: (callback: () => void) => { fake.start = callback; } }),
      on: (name: string, callback: () => void) => fake.appEvents.set(name, callback),
      quit: fake.quit,
      requestSingleInstanceLock: fake.instanceLock,
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
  fake.trays.length = 0;
  fake.handlers.clear(); fake.listeners.clear(); fake.shortcuts.clear(); fake.appEvents.clear();
  fake.quit.mockClear(); fake.hasApiKey.mockClear();
  fake.instanceLock.mockReturnValue(true);
  await import('./main');
  fake.start();
});
afterEach(() => {
  fake.appEvents.get('will-quit')?.();
  rmSync(fake.directory, { recursive: true, force: true });
});
const sender = (index: number) => ({ sender: fake.windows[index].webContents });
const emit = (channel: string, index: number, ...args: unknown[]) => fake.listeners.get(channel)!(sender(index), ...args);
const readyWindows = () => {
  fake.windows.forEach(window => window.emit('ready-to-show'));
  emit('app:editor-ready', 0);
};

describe('independent editor and HUD windows', () => {
  it('opens a native taskbar editor plus a non-focusable HUD; only the editor owns media', () => {
    const [main, hud] = fake.windows;
    readyWindows();
    expect(fake.windows).toHaveLength(2);
    expect(main.options).toMatchObject({ frame: true, skipTaskbar: false, alwaysOnTop: false, webPreferences: { backgroundThrottling: false } });
    expect(hud.options).toMatchObject({ frame: false, transparent: true, backgroundColor: '#00000000', thickFrame: false, roundedCorners: false, skipTaskbar: true, alwaysOnTop: true, focusable: false });
    expect(main.options.icon).toMatch(/assets[\\/]app-icon\.png$/);
    expect(main.show).toHaveBeenCalledOnce();
    expect(main.loadFile.mock.calls[0][1]).toBeUndefined();
    expect(hud.loadFile.mock.calls[0][0]).toMatch(/dist[\\/]hud\.html$/);
    expect(hud.loadFile.mock.calls[0][1]).toEqual({ query: { view: 'hud' } });
    expect(hud.showInactive).toHaveBeenCalledOnce();
    expect(hud.focus).not.toHaveBeenCalled();
    expect(fake.permissionCheck(main.webContents, 'media')).toBe(true);
    expect(fake.permissionCheck(hud.webContents, 'media')).toBe(false);
  });

  it('repeatedly minimizes/restores the editor without hiding/reloading the HUD or rerouting recording', () => {
    const [main, hud] = fake.windows;
    readyWindows();
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
    expect(fake.handlers.get('hud:get-state')!(sender(1))).toEqual({ ...state, moveEnabled: false, opacityPercent: 76 });
    emit('hud:publish-state', 1, { ...state, phase: 'ready' });
    emit('hud:publish-state', 0, { ...state, phase: 'invalid' });
    expect(fake.handlers.get('hud:get-state')!(sender(1)).phase).toBe('recording');
    expect(() => fake.handlers.get('hud:get-state')!(sender(0))).toThrow('HUD window required');
  });

  it('changes HUD opacity and move mode without changing the editor or focusing the HUD', () => {
    const [main, hud] = fake.windows;
    emit('hud:set-opacity', 0, 40);
    emit('hud:set-opacity', 0, 10);
    emit('hud:set-opacity', 0, 9);
    emit('hud:set-opacity', 0, 101);
    emit('hud:set-opacity', 1, 100);
    expect(hud.setOpacity).not.toHaveBeenCalled();
    expect(fake.handlers.get('hud:get-state')!(sender(1)).opacityPercent).toBe(10);
    expect(hud.webContents.send).toHaveBeenLastCalledWith('hud:state', expect.objectContaining({ opacityPercent: 10 }));
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

  it('changes editor theme without painting an opaque background into the HUD host', () => {
    const [main, hud] = fake.windows;
    emit('app:theme-background', 0, 'light');
    emit('app:theme-background', 0, 'dark');
    emit('app:theme-background', 1, 'light');
    expect(main.setBackgroundColor.mock.calls).toEqual([['#ffffff'], ['#242424']]);
    expect(hud.setBackgroundColor).not.toHaveBeenCalled();
    expect(hud.setOpacity).not.toHaveBeenCalled();
  });

  it('persists separate legacy position keys without saving minimize coordinates', () => {
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
  });

  it('shows the editor loader before revealing the HUD and waits for recorder subscriptions', () => {
    const [main, hud] = fake.windows;
    hud.emit('ready-to-show');
    expect(hud.showInactive).not.toHaveBeenCalled();
    main.emit('ready-to-show');
    expect(main.visible).toBe(true);
    expect(hud.visible).toBe(false);
    emit('app:editor-ready', 1);
    expect(hud.visible).toBe(false);
    emit('app:editor-ready', 0);
    expect(hud.visible).toBe(true);
    emit('app:editor-ready', 0);
    expect(hud.showInactive).toHaveBeenCalledOnce();
    expect(main.show.mock.invocationCallOrder[0]).toBeLessThan(hud.showInactive.mock.invocationCallOrder[0]);
  });

  it('keeps the recorder/HUD alive on close and reopens from the tray without a new window', () => {
    const [main, hud] = fake.windows;
    readyWindows();
    const event = { preventDefault: vi.fn() };
    main.emit('close', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(main.visible).toBe(false);
    expect(hud.visible).toBe(true);
    expect(fake.quit).not.toHaveBeenCalled();
    fake.shortcuts.get('CapsLock')!();
    expect(main.webContents.send).toHaveBeenCalledWith('recording:toggle');
    fake.trays[0].emit('click');
    expect(main.visible).toBe(true);
    expect(main.focused).toBe(true);
    expect(fake.windows).toHaveLength(2);
    expect(main.loadFile).toHaveBeenCalledOnce();
  });

  it('respects closing to tray before the editor first paint arrives', () => {
    const [main, hud] = fake.windows;
    fake.trays[0].emit('click');
    main.emit('close', { preventDefault: vi.fn() });
    hud.emit('ready-to-show'); main.emit('ready-to-show');
    emit('app:editor-ready', 0);
    expect(main.visible).toBe(false);
    expect(hud.visible).toBe(true);
  });

  it('localizes the tray menu, allows explicit quit, and removes the tray on shutdown', () => {
    emit('hud:publish-state', 0, { phase: 'idle', language: 'ru', recordingShortcut: 'CapsLock', hold: true });
    const tray = fake.trays[0];
    expect(tray.menu.items.map((item: any) => item.label)).toEqual(['Открыть', undefined, 'Выйти']);
    tray.menu.items[0].click();
    expect(fake.windows[0].visible).toBe(true);
    tray.menu.items[2].click();
    expect(fake.quit).toHaveBeenCalledOnce();
    fake.appEvents.get('before-quit')!();
    const event = { preventDefault: vi.fn() };
    fake.windows[0].emit('close', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    fake.appEvents.get('will-quit')!();
    expect(tray.isDestroyed()).toBe(true);
  });

  it('reactivates the existing editor on a second launch', () => {
    readyWindows();
    fake.windows[0].hide();
    fake.appEvents.get('second-instance')!();
    expect(fake.windows[0].visible).toBe(true);
    expect(fake.windows).toHaveLength(2);
  });

  it('does not create windows or a tray when another instance owns the lock', async () => {
    fake.instanceLock.mockReturnValue(false);
    vi.resetModules();
    await import('./main');
    fake.start();
    expect(fake.quit).toHaveBeenCalledOnce();
    expect(fake.windows).toHaveLength(2);
    expect(fake.trays).toHaveLength(1);
  });
});
