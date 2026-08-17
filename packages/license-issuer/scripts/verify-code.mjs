import { decodeLicense, verifyLicensePayload } from '../../server/src/license/crypto.js';
import { EMBEDDED_LICENSE_PUBLIC_KEY_PEM } from '../../server/src/license/public-key.js';

const code = process.argv[2];
if (!code) {
  console.error('usage: node verify-code.mjs <license-code>');
  process.exit(2);
}

const { payload, signature } = decodeLicense(code);
if (!verifyLicensePayload(EMBEDDED_LICENSE_PUBLIC_KEY_PEM, payload, signature)) {
  console.error('verify failed');
  process.exit(1);
}
console.log('ok', payload.machineId);
