import { EMBEDDED_LICENSE_PUBLIC_KEY_PEM } from './public-key.js';

export function isLicenseCheckDisabled() {
  if (process.env.BA_LICENSE_DISABLED === '1') return true;
  if (process.env.BA_LICENSE_FORCE === '1') return false;
  if (process.env.NODE_TEST_CONTEXT) return true;
  return false;
}

export function getLicensePublicKeyPem() {
  const fromEnv = String(process.env.BA_LICENSE_PUBLIC_KEY || '').trim();
  if (fromEnv) {
    return fromEnv.includes('BEGIN PUBLIC KEY')
      ? fromEnv.replace(/\\n/g, '\n')
      : `-----BEGIN PUBLIC KEY-----\n${fromEnv}\n-----END PUBLIC KEY-----\n`;
  }
  return EMBEDDED_LICENSE_PUBLIC_KEY_PEM;
}
