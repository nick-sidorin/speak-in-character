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

    await main.webContents.executeJavaScript('window.inCharacter.setHudOpacity(10)');
    await waitFor(() => Math.abs(hud.getOpacity() - 0.1) < 0.01, '10% HUD-only opacity');
    assert.equal(main.getOpacity(), 1);
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
