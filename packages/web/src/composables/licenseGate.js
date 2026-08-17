import { ref } from 'vue';
import { getLicenseStatus } from '../api';

export const licenseReady = ref(false);
export const licenseActivated = ref(false);
export const licenseInfo = ref(null);

export function applyLicenseStatus(status) {
  licenseInfo.value = status || null;
  licenseActivated.value = Boolean(status?.activated);
  licenseReady.value = true;
}

export async function refreshLicenseStatus() {
  const status = await getLicenseStatus();
  applyLicenseStatus(status);
  return status;
}
