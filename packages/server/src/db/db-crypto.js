/**
 * 数据库文件静态加密（AES-256-GCM）
 * 磁盘上的 .db 非标准 SQLite 格式，无法用 DB Browser 直接打开
 */
import crypto from 'crypto';

export const DB_MAGIC = Buffer.from('BAENC01\0');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** 安装包内种子库专用密钥（防安装目录被直接拷贝解析，非用户级密钥） */
export function deriveInstallSeedKey() {
  return crypto.scryptSync('PocketBA-InstallSeed-v1', 'ba-packet.catalog.seed', 32);
}

export function normalizeDbKey(key) {
  if (!key) return null;
  if (Buffer.isBuffer(key)) {
    if (key.length !== 32) throw new Error('数据库密钥长度必须为 32 字节');
    return key;
  }
  const hex = String(key).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('BA_DB_KEY 必须为 64 位十六进制字符串');
  }
  return Buffer.from(hex, 'hex');
}

export function isEncryptedDbFile(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= DB_MAGIC.length &&
    buffer.subarray(0, DB_MAGIC.length).equals(DB_MAGIC)
  );
}

export function isPlainSqliteFile(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 16 &&
    buffer.subarray(0, 16).toString('utf-8') === 'SQLite format 3\u0000'
  );
}

export function encryptDbBuffer(plainBuffer, key) {
  const normalizedKey = normalizeDbKey(key);
  if (!normalizedKey) throw new Error('缺少数据库加密密钥');

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', normalizedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([DB_MAGIC, iv, tag, encrypted]);
}

export function decryptDbBuffer(encBuffer, key) {
  const normalizedKey = normalizeDbKey(key);
  if (!normalizedKey) throw new Error('缺少数据库解密密钥');
  if (!isEncryptedDbFile(encBuffer)) {
    throw new Error('不是有效的加密数据库文件');
  }

  const iv = encBuffer.subarray(DB_MAGIC.length, DB_MAGIC.length + IV_LENGTH);
  const tag = encBuffer.subarray(
    DB_MAGIC.length + IV_LENGTH,
    DB_MAGIC.length + IV_LENGTH + TAG_LENGTH
  );
  const ciphertext = encBuffer.subarray(DB_MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', normalizedKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptInstallSeed(plainBuffer) {
  return encryptDbBuffer(plainBuffer, deriveInstallSeedKey());
}

export function decryptInstallSeed(encBuffer) {
  return decryptDbBuffer(encBuffer, deriveInstallSeedKey());
}

export function loadSeedPlainBuffer(seedPath, fileBuffer) {
  const buffer = fileBuffer || null;
  if (!buffer) throw new Error('缺少种子库内容');

  if (seedPath.endsWith('.enc') || isEncryptedDbFile(buffer)) {
    return decryptInstallSeed(buffer);
  }
  if (isPlainSqliteFile(buffer)) {
    return buffer;
  }
  throw new Error(`无法识别的种子库格式: ${seedPath}`);
}
