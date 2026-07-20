/**
 * 数据库加密密钥解析
 * - BA_DB_KEY：显式注入（桌面子进程 / 测试）
 * - Windows 开发模式：.runtime/db-key.dpapi（DPAPI 保护）
 * - 其他平台开发模式：.runtime/db-key.hex
 * - BA_DB_PLAIN=1：仅测试/调试时禁用加密
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedKeyHex = '';

export function isPlainDbMode() {
  return process.env.BA_DB_PLAIN === '1';
}

function runtimeDir() {
  if (process.env.BA_RUNTIME_DIR) {
    return process.env.BA_RUNTIME_DIR;
  }
  return path.join(__dirname, '../../.runtime');
}

function dpapiKeyPath() {
  return path.join(runtimeDir(), 'db-key.dpapi');
}

function hexKeyPath() {
  return path.join(runtimeDir(), 'db-key.hex');
}

async function protectWithDpapi(buffer) {
  if (process.platform !== 'win32') return buffer;
  try {
    const { protectData } = await import('@primno/dpapi');
    return protectData(buffer);
  } catch {
    return buffer;
  }
}

async function unprotectWithDpapi(buffer) {
  if (process.platform !== 'win32') return buffer;
  try {
    const { unprotectData } = await import('@primno/dpapi');
    return unprotectData(buffer);
  } catch {
    return buffer;
  }
}

async function readDevRuntimeKey() {
  if (fs.existsSync(dpapiKeyPath())) {
    const protectedBuf = fs.readFileSync(dpapiKeyPath());
    const plain = await unprotectWithDpapi(protectedBuf);
    return plain.toString('utf-8').trim();
  }
  if (fs.existsSync(hexKeyPath())) {
    return fs.readFileSync(hexKeyPath, 'utf-8').trim();
  }
  return '';
}

async function writeDevRuntimeKey(hexKey) {
  fs.mkdirSync(runtimeDir(), { recursive: true });
  if (process.platform === 'win32') {
    const protectedBuf = await protectWithDpapi(Buffer.from(hexKey, 'utf-8'));
    fs.writeFileSync(dpapiKeyPath(), protectedBuf);
    if (fs.existsSync(hexKeyPath())) fs.unlinkSync(hexKeyPath());
    return;
  }
  fs.writeFileSync(hexKeyPath(), hexKey, { encoding: 'utf-8', mode: 0o600 });
}

export async function ensureDbKeyHex() {
  if (isPlainDbMode()) return '';
  if (process.env.BA_DB_KEY) {
    cachedKeyHex = process.env.BA_DB_KEY.trim();
    return cachedKeyHex;
  }
  if (cachedKeyHex) return cachedKeyHex;

  let hexKey = await readDevRuntimeKey();
  if (!hexKey) {
    hexKey = crypto.randomBytes(32).toString('hex');
    await writeDevRuntimeKey(hexKey);
  }
  cachedKeyHex = hexKey;
  process.env.BA_DB_KEY = hexKey;
  return hexKey;
}

export function getDbKeyHexSync() {
  if (isPlainDbMode()) return '';
  if (process.env.BA_DB_KEY) return process.env.BA_DB_KEY.trim();
  if (cachedKeyHex) return cachedKeyHex;
  throw new Error('数据库密钥尚未初始化，请先调用 ensureDbKeyHex()');
}
