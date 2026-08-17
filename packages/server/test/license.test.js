import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  generateLicenseKeyPair,
  issueLicenseCode,
  verifyLicensePayload,
  decodeLicense,
} from '../src/license/crypto.js';
import {
  formatMachineId,
  getMachineFingerprint,
  normalizeMachineId,
} from '../src/license/fingerprint.js';
import { activateLicense, getLicenseStatus } from '../src/license/guard.js';
import { verifyLicenseCode } from '../src/license/store.js';

function fakeIfaces(entries) {
  const out = {};
  for (const [name, mac, internal = false] of entries) {
    out[name] = [{ address: '1.1.1.1', family: 'IPv4', mac, internal }];
  }
  return out;
}

describe('license fingerprint', () => {
  it('物理网卡参与指纹，虚拟网卡排除', () => {
    const physical = getMachineFingerprint(
      fakeIfaces([
        ['以太网', 'aa:bb:cc:dd:ee:ff'],
        ['VMware Network Adapter VMnet8', '00:50:56:12:34:56'],
        ['vEthernet (WSL)', '00:15:5d:01:02:03'],
      ])
    );
    const onlyEth = getMachineFingerprint(fakeIfaces([['以太网', 'aa:bb:cc:dd:ee:ff']]));
    assert.equal(physical.machineId, onlyEth.machineId);
    assert.equal(physical.macCount, 1);
    assert.match(physical.machineIdDisplay, /^[0-9A-F]{8}(-[0-9A-F]{8}){3}$/);
  });

  it('机器码格式化忽略横线', () => {
    const id = 'aabbccdd11223344556677889900abcd';
    assert.equal(normalizeMachineId(formatMachineId(id)), id);
  });
});

describe('license sign / activate', () => {
  let tmpDir;
  let keypair;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-license-'));
    process.env.BA_LICENSE_FORCE = '1';
    process.env.BA_LICENSE_PATH = path.join(tmpDir, 'license.json');
    keypair = generateLicenseKeyPair();
    process.env.BA_LICENSE_PUBLIC_KEY = keypair.publicKeyPem;
  });

  after(() => {
    delete process.env.BA_LICENSE_FORCE;
    delete process.env.BA_LICENSE_PATH;
    delete process.env.BA_LICENSE_PUBLIC_KEY;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('私钥签发的授权码可用公钥验证', () => {
    const machineId = getMachineFingerprint().machineId;
    const code = issueLicenseCode(keypair.privateKeyPem, machineId);
    const { payload, signature } = decodeLicense(code);
    assert.equal(verifyLicensePayload(keypair.publicKeyPem, payload, signature), true);
    const verified = verifyLicenseCode(code, { machineId });
    assert.equal(normalizeMachineId(verified.machineId), normalizeMachineId(machineId));
  });

  it('其它机器的授权码不能激活本机', () => {
    const code = issueLicenseCode(keypair.privateKeyPem, 'ffffffffffffffffffffffffffffffff');
    assert.throws(() => verifyLicenseCode(code), /不匹配/);
  });

  it('激活后本机记住，状态为已激活', () => {
    const machineId = getMachineFingerprint().machineId;
    const code = issueLicenseCode(keypair.privateKeyPem, machineId);
    const status = activateLicense(code);
    assert.equal(status.activated, true);
    assert.equal(getLicenseStatus().activated, true);
    assert.equal(fs.existsSync(process.env.BA_LICENSE_PATH), true);
  });

  it('篡改授权码无法通过', () => {
    const machineId = getMachineFingerprint().machineId;
    const code = issueLicenseCode(keypair.privateKeyPem, machineId);
    const broken = `${code.slice(0, -4)}XXXX`;
    assert.throws(() => verifyLicenseCode(broken), /授权码/);
  });
});
