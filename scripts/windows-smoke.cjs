const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

// Exercise the real windows/renderer with fake media and isolated, key-free data.
const profile = mkdtempSync(join(tmpdir(), 'speak-window-smoke-'));
const startedAt = Date.now();
app.setPath('appData', profile);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
delete process.env.VITE_DEV_SERVER_URL;
require('../dist-electron/main.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${label}`);
}
const select = role => BrowserWindow.getAllWindows().find(window => {
  const url = window.webContents.getURL();
  return url.startsWith('file:') && (role === 'hud' ? url.includes('view=hud') : !url.includes('view=hud'));
});
let smokeComplete = false;
let watchdog;
app.on('before-quit', () => {
  if (!smokeComplete) {
    console.error('Application quit before smoke checks completed');
    app.exit(1);
  } else {
    clearTimeout(watchdog);
    console.log('Explicit Exit quits the application after close-to-tray checks.');
  }
});

app.whenReady().then(async () => {
  watchdog = setTimeout(() => { console.error('Windows smoke test exceeded 60 seconds'); app.exit(1); }, 60000);
  try {
    await waitFor(() => select('panel') && select('hud'), 'two window roles');
    const main = select('panel');
    const hud = select('hud');
    await waitFor(() => !main.webContents.isLoading() && !hud.webContents.isLoading(), 'renderer load');
    await waitFor(() => main.webContents.executeJavaScript("Boolean(document.querySelector('[role=tab]'))"), 'editor UI');
    await waitFor(() => hud.webContents.executeJavaScript("Boolean(document.querySelector('.hud'))"), 'HUD UI');
    await waitFor(() => main.isVisible() && hud.isVisible(), 'initial windows visible');
    console.log(`Startup windows visible after ${Date.now() - startedAt} ms from test initialization.`);
    assert.equal(BrowserWindow.getAllWindows().length, 2);
    assert.equal(main.isAlwaysOnTop(), false);
    assert.equal(main.isResizable(), true);
    assert.equal(hud.isAlwaysOnTop(), true);
    assert.equal(hud.isFocusable(), false);
    assert.equal(await hud.webContents.executeJavaScript('typeof window.inCharacter.processVoice'), 'undefined');
    assert.equal(await hud.webContents.executeJavaScript('typeof window.inCharacter.historyList'), 'undefined');
    assert.equal(await hud.webContents.executeJavaScript('typeof window.inCharacter.editorReady'), 'undefined');
    assert(hud.webContents.getURL().includes('/hud.html?'), 'HUD has a separate lightweight entry');
    console.log('Editor navigation timings:', await main.webContents.executeJavaScript("JSON.stringify(performance.getEntriesByType('mark').map(({name, startTime}) => ({name, ms: Math.round(startTime)})))"));

    main.minimize();
    await waitFor(() => main.isMinimized(), 'native editor minimize');
    main.webContents.send('hotkey:down');
    await waitFor(() => hud.webContents.executeJavaScript("Boolean(document.querySelector('.state-circle.recording'))"), 'recording status relay');
    await delay(500);
    main.webContents.send('hotkey:up');
    await waitFor(() => hud.webContents.executeJavaScript("Boolean(document.querySelector('.state-check'))"), 'recording completion relay');
    const snapshot = await main.webContents.executeJavaScript('window.inCharacter.historyList()');
    assert.equal(snapshot.entries.length, 1, 'one recorder produces one history entry');
    assert.equal(main.isMinimized(), true, 'recording does not restore/focus the editor');
    assert.equal(hud.isVisible(), true, 'HUD survives editor minimization');

    assert.equal(await main.webContents.executeJavaScript("/\\d/.test(document.querySelectorAll('[role=tab]')[1].textContent)"), false, 'history tab has no count badge');
    await main.webContents.executeJavaScript('window.inCharacter.setHudOpacity(10)');
    await waitFor(() => hud.webContents.executeJavaScript("Math.abs(Number(getComputedStyle(document.querySelector('.hud')).opacity) - 0.1) < 0.01"), '10% HTML HUD opacity');
    assert.equal(main.getOpacity(), 1);
    assert.equal(hud.getOpacity(), 1, 'transparent native host opacity is never changed');
    await hud.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const image = await hud.webContents.capturePage();
    const { width, height } = image.getSize(1);
    const pixels = image.toBitmap({ scaleFactor: 1 });
    assert.equal(pixels.length, width * height * 4);
    const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [3, 3]]) {
      assert.equal(alphaAt(x, y), 0, `HUD renderer corner ${x},${y} is transparent`);
    }
    const centerAlpha = alphaAt(Math.floor(width / 2), Math.floor(height / 2));
    assert(centerAlpha > 0 && centerAlpha < 255, 'inner HUD paints partially opaque pixels');
    console.log('HUD renderer alpha passed: clear corners, painted inner bubble, native opacity 1. Desktop DWM composition still needs owner review.');
    main.restore();
    await waitFor(() => !main.isMinimized(), 'native editor restore');
    assert.equal(hud.isVisible(), true);
    main.close();
    await waitFor(() => !main.isVisible(), 'close hides editor to tray');
    assert.equal(main.isDestroyed(), false, 'closing retains the recorder renderer');
    assert.equal(hud.isVisible(), true);
    main.webContents.send('hotkey:down');
    await waitFor(() => hud.webContents.executeJavaScript("Boolean(document.querySelector('.state-circle.recording'))"), 'recording while hidden');
    await delay(500);
    main.webContents.send('hotkey:up');
    await waitFor(() => hud.webContents.executeJavaScript("Boolean(document.querySelector('.state-check'))"), 'hidden recording completion');
    assert.equal((await main.webContents.executeJavaScript('window.inCharacter.historyList()')).entries.length, 2);
    assert.equal(main.isVisible(), false, 'recording does not reopen the editor');
    app.emit('activate');
    await waitFor(() => main.isVisible(), 'reactivating the background editor');
    assert.equal(BrowserWindow.getAllWindows().length, 2);
    console.log('Windows smoke passed: startup, minimized/hidden recording, two history entries, close to tray, reactivation, HUD-only opacity, restricted bridge.');
    smokeComplete = true;
    void main.webContents.executeJavaScript('window.inCharacter.quit()').catch(() => {});
  } catch (error) {
    console.error(error);
    clearTimeout(watchdog);
    app.exit(1);
  }
});
app.on('quit', () => { try { rmSync(profile, { recursive: true, force: true }); } catch {} });
