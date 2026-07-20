import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { getOrCreateDbKeyHex } from './db-key-store.js';

export function getResourcePath(...segments) {
  if (process.env.BA_RESOURCES_PATH) {
    return path.join(process.env.BA_RESOURCES_PATH, ...segments);
  }
  return path.join(__dirname, ...segments);
}

function getSeedDbPath() {
  const packagedEnc = getResourcePath('seed', 'catalog.db.enc');
  if (fs.existsSync(packagedEnc)) {
    return packagedEnc;
  }
  const packagedSeed = getResourcePath('seed', 'catalog.db');
  if (fs.existsSync(packagedSeed)) {
    return packagedSeed;
  }
  const devEnc = getResourcePath('server', 'data', 'catalog.db.enc');
  if (fs.existsSync(devEnc)) {
    return devEnc;
  }
  return getResourcePath('server', 'data', 'catalog.db');
}

export function ensureUserDatabase(userDataPath) {
  const dbDir = path.join(userDataPath, 'data');
  const dbPath = path.join(dbDir, 'catalog.db');
  fs.mkdirSync(dbDir, { recursive: true });
  return dbPath;
}

function pickListenPort(preferred) {
  if (preferred) return preferred;
  return 49152 + Math.floor(Math.random() * (65535 - 49152));
}

export async function startServer({ userDataPath, port, dbKeyHex } = {}) {
  const dbPath = ensureUserDatabase(userDataPath);
  const listenPort = pickListenPort(port);
  const apiToken = crypto.randomBytes(32).toString('hex');
  const dbKey = dbKeyHex || (await getOrCreateDbKeyHex(userDataPath));
  const seedPath = getSeedDbPath();
  const serverEntry = getResourcePath('server', 'src', 'index.js');

  if (!fs.existsSync(seedPath) && !fs.existsSync(dbPath)) {
    throw new Error(`未找到预置数据库: ${seedPath}`);
  }

  const env = {
    ...process.env,
    BA_DB_PATH: dbPath,
    BA_DB_KEY: dbKey,
    BA_SEED_PATH: fs.existsSync(dbPath) ? '' : seedPath,
    BA_PORT: String(listenPort),
    BA_HOST: '127.0.0.1',
    BA_API_TOKEN: apiToken,
    BA_RESOURCES_PATH: getResourcePath(),
    ELECTRON_RUN_AS_NODE: '1',
    NODE_PATH: getResourcePath('node_modules'),
  };

  const child = spawn(process.execPath, [serverEntry], {
    env,
    stdio: 'pipe',
    windowsHide: true,
  });

  child.stdout?.on('data', (chunk) => {
    console.log(`[server] ${chunk.toString().trim()}`);
  });

  child.stderr?.on('data', (chunk) => {
    console.error(`[server] ${chunk.toString().trim()}`);
  });

  return { child, port: listenPort, dbPath, apiToken };
}

export function waitForServer(port, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
          return;
        }
        retry();
      });

      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('本地服务启动超时'));
        return;
      }
      setTimeout(tick, 300);
    };

    tick();
  });
}
