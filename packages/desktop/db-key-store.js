/**
 * 桌面端数据库密钥：Windows DPAPI 保护，绑定当前 Windows 用户
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function keyFilePath(userDataPath) {
  return path.join(userDataPath, 'secure', 'db-key.dpapi');
}

function fallbackKeyFilePath(userDataPath) {
  return path.join(userDataPath, 'secure', 'db-key.hex');
}

async function protect(buffer) {
  if (process.platform === 'win32') {
    try {
      const { protectData } = await import('@primno/dpapi');
      return protectData(buffer);
    } catch {
      /* fallback */
    }
  }
  return buffer;
}

async function unprotect(buffer) {
  if (process.platform === 'win32') {
    try {
      const { unprotectData } = await import('@primno/dpapi');
      return unprotectData(buffer);
    } catch {
      /* fallback */
    }
  }
  return buffer;
}

export async function getOrCreateDbKeyHex(userDataPath) {
  const secureDir = path.join(userDataPath, 'secure');
  fs.mkdirSync(secureDir, { recursive: true });

  const dpapiPath = keyFilePath(userDataPath);
  if (fs.existsSync(dpapiPath)) {
    const plain = await unprotect(fs.readFileSync(dpapiPath));
    return plain.toString('utf-8').trim();
  }

  const fallbackPath = fallbackKeyFilePath(userDataPath);
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf-8').trim();
  }

  const hexKey = crypto.randomBytes(32).toString('hex');
  const protectedBuf = await protect(Buffer.from(hexKey, 'utf-8'));
  if (process.platform === 'win32' && !protectedBuf.equals(Buffer.from(hexKey, 'utf-8'))) {
    fs.writeFileSync(dpapiPath, protectedBuf);
  } else {
    fs.writeFileSync(fallbackPath, hexKey, { encoding: 'utf-8', mode: 0o600 });
  }
  return hexKey;
}
