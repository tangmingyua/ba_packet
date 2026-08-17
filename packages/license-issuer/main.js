import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function licenseLibDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'license');
  return path.join(__dirname, '../server/src/license');
}

function bundledPrivateKeyPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'keys', 'private.pem');
  return path.join(__dirname, 'keys', 'private.pem');
}

function userPrivateKeyPath() {
  return path.join(app.getPath('userData'), 'ed25519-private.pem');
}

const [
  { generateLicenseKeyPair, issueLicenseCode, publicKeyFingerprint },
  { EMBEDDED_LICENSE_PUBLIC_KEY_PEM },
  { normalizeMachineId },
] = await Promise.all([
  import(pathToFileURL(path.join(licenseLibDir(), 'crypto.js')).href),
  import(pathToFileURL(path.join(licenseLibDir(), 'public-key.js')).href),
  import(pathToFileURL(path.join(licenseLibDir(), 'fingerprint.js')).href),
]);

function derivePublicKeyPem(privateKeyPem) {
  return crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({
    type: 'spki',
    format: 'pem',
  });
}

function loadOrCreatePrivateKey() {
  const userPath = userPrivateKeyPath();
  if (fs.existsSync(userPath)) {
    return fs.readFileSync(userPath, 'utf8');
  }
  const bundled = bundledPrivateKeyPath();
  if (fs.existsSync(bundled)) {
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.copyFileSync(bundled, userPath);
    return fs.readFileSync(userPath, 'utf8');
  }
  const generated = generateLicenseKeyPair();
  fs.mkdirSync(path.dirname(userPath), { recursive: true });
  fs.writeFileSync(userPath, generated.privateKeyPem, { encoding: 'utf8', mode: 0o600 });
  if (!app.isPackaged) {
    try {
      fs.mkdirSync(path.dirname(bundled), { recursive: true });
      fs.writeFileSync(bundled, generated.privateKeyPem, { encoding: 'utf8', mode: 0o600 });
    } catch {
      /* ignore */
    }
  }
  return generated.privateKeyPem;
}

function keyStatus() {
  const privateKeyPem = loadOrCreatePrivateKey();
  const publicKeyPem = derivePublicKeyPem(privateKeyPem);
  const embeddedFp = publicKeyFingerprint(EMBEDDED_LICENSE_PUBLIC_KEY_PEM);
  const issuerFp = publicKeyFingerprint(publicKeyPem);
  return {
    publicKeyPem,
    fingerprint: issuerFp,
    matchesApp: issuerFp === embeddedFp,
    privateKeyPath: userPrivateKeyPath(),
  };
}

ipcMain.handle('license:status', () => keyStatus());

ipcMain.handle('license:issue', (_event, machineId) => {
  const privateKeyPem = loadOrCreatePrivateKey();
  const code = issueLicenseCode(privateKeyPem, normalizeMachineId(machineId));
  return { code };
});

ipcMain.handle('license:copy', (_event, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 640,
    height: 720,
    minWidth: 520,
    minHeight: 600,
    title: '口袋BA 授权工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
