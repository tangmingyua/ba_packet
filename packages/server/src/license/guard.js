/**
 * 未激活时拦截业务 API，只放行健康检查与激活接口。
 */
import { isLicenseCheckDisabled } from './config.js';
import { getMachineFingerprint, formatMachineId } from './fingerprint.js';
import { getStoredActivation, verifyLicenseCode, writeStoredLicense } from './store.js';

const OPEN_PATHS = new Set(['/api/health', '/api/license/status', '/api/license/activate']);

export function getLicenseStatus() {
  if (isLicenseCheckDisabled()) {
    const fp = getMachineFingerprint();
    return {
      activated: true,
      disabled: true,
      machineId: fp.machineId,
      machineIdDisplay: fp.machineIdDisplay,
    };
  }
  const fp = getMachineFingerprint();
  const stored = getStoredActivation();
  return {
    activated: Boolean(stored),
    disabled: false,
    machineId: fp.machineId,
    machineIdDisplay: stored
      ? formatMachineId(stored.payload.machineId)
      : fp.machineIdDisplay,
  };
}

export function activateLicense(code) {
  if (isLicenseCheckDisabled()) {
    return getLicenseStatus();
  }
  const fp = getMachineFingerprint();
  const payload = verifyLicenseCode(code, { machineId: fp.machineId });
  writeStoredLicense({
    code: String(code || '').trim().replace(/\s+/g, ''),
    activatedAt: new Date().toISOString(),
    machineId: payload.machineId,
  });
  return getLicenseStatus();
}

export function registerLicenseGuard(app) {
  app.addHook('onRequest', async (request, reply) => {
    if (isLicenseCheckDisabled()) return;
    const pathname = String(request.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) return;
    if (OPEN_PATHS.has(pathname)) return;
    if (getStoredActivation()) return;
    return reply.code(403).send({
      code: 'LICENSE_REQUIRED',
      message: '尚未激活，请先完成本机授权',
    });
  });
}
