/**
 * 本机授权文件：验签通过后记住，启动时再按当前机器指纹校验。
 */
import fs from 'fs';
import path from 'path';
import { getRuntimeSessionPath } from '../local-api-auth.js';
import { decodeLicense, verifyLicensePayload } from './crypto.js';
import { getLicensePublicKeyPem } from './config.js';
import { getMachineFingerprint, normalizeMachineId } from './fingerprint.js';

export function getLicenseStorePath() {
  if (process.env.BA_LICENSE_PATH) return process.env.BA_LICENSE_PATH;
  return path.join(path.dirname(getRuntimeSessionPath()), 'license.json');
}

export function readStoredLicense() {
  try {
    const raw = fs.readFileSync(getLicenseStorePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredLicense(record) {
  const filePath = getLicenseStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

export function verifyLicenseCode(code, { machineId } = {}) {
  const publicKeyPem = getLicensePublicKeyPem();
  const { payload, signature } = decodeLicense(code);
  if (!verifyLicensePayload(publicKeyPem, payload, signature)) {
    throw new Error('授权码无效');
  }
  const expected = normalizeMachineId(machineId || getMachineFingerprint().machineId);
  const licensed = normalizeMachineId(payload.machineId);
  if (!expected || licensed !== expected) {
    throw new Error('授权码与本机不匹配');
  }
  return payload;
}

export function getStoredActivation() {
  const stored = readStoredLicense();
  if (!stored?.code) return null;
  try {
    const payload = verifyLicenseCode(stored.code);
    return { payload, code: stored.code };
  } catch {
    return null;
  }
}
