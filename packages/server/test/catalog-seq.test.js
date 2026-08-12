import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bucketCatalogSeqMin, parseCatalogSeq } from '../src/utils/catalog-seq.js';

describe('catalog-seq', () => {
  it('parseCatalogSeq', () => {
    assert.equal(parseCatalogSeq({ __catalog_seq: 3 }), 3);
    assert.equal(parseCatalogSeq({ __catalog_seq: '2' }), 2);
    assert.equal(parseCatalogSeq({}), null);
    assert.equal(parseCatalogSeq({ __catalog_seq: 'x' }), null);
  });

  it('bucketCatalogSeqMin keeps minimum', () => {
    const entry = { catalogSeqMin: null };
    bucketCatalogSeqMin(entry, 5);
    bucketCatalogSeqMin(entry, 2);
    assert.equal(entry.catalogSeqMin, 2);
  });
});
