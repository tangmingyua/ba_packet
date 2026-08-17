/**
 * 物理网卡 MAC 指纹：排除虚拟/隧道网卡后，对 MAC 排序再哈希。
 */
import os from 'os';
import crypto from 'crypto';

const ZERO_MAC = '000000000000';
const BROADCAST_MAC = 'ffffffffffff';

const VIRTUAL_IFACE_RE =
  /virtual|vmware|vbox|virtualbox|hyper-?v|vethernet|tap-?win|vpn|bluetooth|loopback|pseudo|wsl|docker|npcap|isatap|teredo|wi-?fi\s*direct|kernel\s*debug|wan\s*miniport|microsoft\s*wi-?fi|tunnel|wireguard|zerotier|hamachi|radmin|softether|openvpn|clash|tap\d|vpnclient|ikev2/i;

const VIRTUAL_MAC_PREFIXES = new Set([
  '00155d', // Hyper-V
  '005056', // VMware
  '000569',
  '000c29',
  '001c14',
  '080027', // VirtualBox
  '001c42', // Parallels
  '00163e', // Xen
]);

export function normalizeMac(mac) {
  return String(mac || '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
}

export function normalizeMachineId(id) {
  return String(id || '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
}

export function formatMachineId(id) {
  const hex = normalizeMachineId(id);
  if (hex.length < 8) return hex.toUpperCase();
  const padded = hex.slice(0, 32).padEnd(32, '0');
  return [padded.slice(0, 8), padded.slice(8, 16), padded.slice(16, 24), padded.slice(24, 32)]
    .join('-')
    .toUpperCase();
}

function isVirtualMac(macHex) {
  if (macHex.length < 6) return true;
  return VIRTUAL_MAC_PREFIXES.has(macHex.slice(0, 6));
}

function collectPhysicalMacs(interfaces = os.networkInterfaces()) {
  const macs = new Set();
  for (const [name, addrs] of Object.entries(interfaces || {})) {
    if (VIRTUAL_IFACE_RE.test(name)) continue;
    for (const addr of addrs || []) {
      if (addr?.internal) continue;
      const mac = normalizeMac(addr.mac);
      if (!mac || mac === ZERO_MAC || mac === BROADCAST_MAC) continue;
      if (mac.length !== 12) continue;
      if (isVirtualMac(mac)) continue;
      macs.add(mac);
    }
  }
  return [...macs].sort();
}

function hashMacs(macs) {
  const payload = macs.join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

/**
 * @param {NodeJS.Dict<os.NetworkInterfaceInfo[]>} [interfaces]
 * @returns {{ machineId: string, machineIdDisplay: string, macCount: number }}
 */
export function getMachineFingerprint(interfaces = os.networkInterfaces()) {
  let macs = collectPhysicalMacs(interfaces);
  if (!macs.length) {
    const fallback = new Set();
    for (const addrs of Object.values(interfaces || {})) {
      for (const addr of addrs || []) {
        if (addr?.internal) continue;
        const mac = normalizeMac(addr.mac);
        if (!mac || mac === ZERO_MAC || mac === BROADCAST_MAC || mac.length !== 12) continue;
        fallback.add(mac);
      }
    }
    macs = [...fallback].sort();
  }
    const machineId = hashMacs(macs.length ? macs : [`no-physical-nic|${os.hostname()}`]);
  return {
    machineId,
    machineIdDisplay: formatMachineId(machineId),
    macCount: macs.length,
  };
}
