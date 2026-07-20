import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import {
  decryptDbBuffer,
  encryptDbBuffer,
  encryptInstallSeed,
  decryptInstallSeed,
  isEncryptedDbFile,
  isPlainSqliteFile,
} from '../src/db/db-crypto.js';

describe('db-crypto', () => {
  it('加密后不再是 SQLite 明文头', () => {
    const key = crypto.randomBytes(32).toString('hex');
    const plain = Buffer.from('SQLite format 3\u0000' + 'demo-data');
    const enc = encryptDbBuffer(plain, key);
    assert.equal(isPlainSqliteFile(enc), false);
    assert.equal(isEncryptedDbFile(enc), true);
    const back = decryptDbBuffer(enc, key);
    assert.equal(back.toString('utf-8'), plain.toString('utf-8'));
  });

  it('错误密钥无法解密', () => {
    const key = crypto.randomBytes(32).toString('hex');
    const wrong = crypto.randomBytes(32).toString('hex');
    const enc = encryptDbBuffer(Buffer.from('SQLite format 3\u0000x'), key);
    assert.throws(() => decryptDbBuffer(enc, wrong));
  });

  it('安装包种子库加解密', () => {
    const plain = Buffer.from('SQLite format 3\u0000seed');
    const enc = encryptInstallSeed(plain);
    const back = decryptInstallSeed(enc);
    assert.equal(back.toString('utf-8'), plain.toString('utf-8'));
  });
});
