import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getResourcePath,
  startServer,
  waitForServer,
} from './server-launcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow = null;
let serverProcess = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  if (isDev) {
    process.env.BA_RESOURCES_PATH = path.resolve(__dirname, '..');
  } else {
    process.env.BA_RESOURCES_PATH = process.resourcesPath;
  }

  const { child, port, apiToken } = await startServer({ userDataPath: app.getPath('userData') });
  serverProcess = child;
  await waitForServer(port);

  const apiBase = `http://127.0.0.1:${port}`;
  const preloadArgs = isDev
    ? []
    : [`--api-base=${apiBase}`, `--api-token=${apiToken}`];

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '监管资料库搜索',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: preloadArgs,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173/#/');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = getResourcePath('web', 'index.html');
    await mainWindow.loadFile(indexPath);
  }
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', stopServer);
