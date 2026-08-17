/**
 * Ed25519 授权码：私钥只在发卡工具，程序只验签。
 */
import crypto from 'crypto';
import { normalizeMachineId } from './fingerprint.js';

export const LICENSE_PREFIX = 'BA1';

function canonicalPayload(payload) {
  const machineId = String(payload?.machineId || '').trim();
  const issuedAt = String(payload?.issuedAt || '').trim();
  return JSON.stringify({ v: 1, machineId, issuedAt });
}

export function generateLicenseKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

export function signLicensePayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const data = Buffer.from(canonicalPayload(payload), 'utf8');
  return crypto.sign(null, data, key);
}

export function verifyLicensePayload(publicKeyPem, payload, signature) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const data = Buffer.from(canonicalPayload(payload), 'utf8');
    const sig = Buffer.isBuffer(signature) ? signature : Buffer.from(signature);
    return crypto.verify(null, data, key, sig);
  } catch {
    return false;
  }
}

export function encodeLicense(payload, signature) {
  const body = Buffer.from(canonicalPayload(payload), 'utf8').toString('base64url');
  const sig = Buffer.from(signature).toString('base64url');
  return `${LICENSE_PREFIX}.${body}.${sig}`;
}

export function decodeLicense(code) {
  const raw = String(code || '').trim().replace(/\s+/g, '');
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    throw new Error('授权码格式不正确');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('授权码无法解析');
  }
  const machineId = String(payload?.machineId || '').trim();
  const issuedAt = String(payload?.issuedAt || '').trim();
  if (!machineId) throw new Error('授权码缺少机器标识');
  let signature;
  try {
    signature = Buffer.from(parts[2], 'base64url');
  } catch {
    throw new Error('授权码签名损坏');
  }
  if (!signature.length) throw new Error('授权码签名损坏');
  return { payload: { v: 1, machineId, issuedAt }, signature };
}

export function issueLicenseCode(privateKeyPem, machineId) {
  const payload = {
    v: 1,
    machineId: normalizeMachineId(machineId),
    issuedAt: new Date().toISOString(),
  };
  if (!payload.machineId) throw new Error('请填写机器码');
  const signature = signLicensePayload(privateKeyPem, payload);
  return encodeLicense(payload, signature);
}

export function publicKeyFingerprint(publicKeyPem) {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16).toUpperCase();
}
