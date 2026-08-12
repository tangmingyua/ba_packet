/** 全量导入时写入 payload 的目录行序（1-based，与「目录」Sheet 数据行顺序一致） */
export const CATALOG_SEQ_PAYLOAD_KEY = '__catalog_seq';

export function parseCatalogSeq(payload) {
  const raw = payload?.[CATALOG_SEQ_PAYLOAD_KEY];
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function bucketCatalogSeqMin(entry, seq) {
  if (seq == null) return;
  if (entry.catalogSeqMin == null || seq < entry.catalogSeqMin) {
    entry.catalogSeqMin = seq;
  }
}
