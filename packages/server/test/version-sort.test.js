import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersionLabelsDesc } from '../src/utils/version-sort.js';

test('compareVersionLabelsDesc sorts numeric versions descending', () => {
  const labels = ['231', '202601', '100', 'v2', 'v10'];
  const sorted = [...labels].sort(compareVersionLabelsDesc);
  assert.deepEqual(sorted, ['v10', 'v2', '202601', '231', '100']);
});

test('compareVersionLabelsDesc puts empty version last', () => {
  assert.equal(compareVersionLabelsDesc('', '231') > 0, true);
  assert.equal(compareVersionLabelsDesc('231', '') < 0, true);
});
