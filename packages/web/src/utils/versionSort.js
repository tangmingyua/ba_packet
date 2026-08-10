/** 版本标签倒序（新/大版本在前）。无版本号的排在有版本号之后。 */
export function compareVersionLabelsDesc(a, b) {
  const va = String(a ?? '').trim();
  const vb = String(b ?? '').trim();
  if (!va && !vb) return 0;
  if (!va) return 1;
  if (!vb) return -1;
  return vb.localeCompare(va, undefined, { numeric: true, sensitivity: 'base' });
}

export function pickItemVersion(item, block) {
  return item?.version || block?.versionLabel || item?.payload?.version || '';
}

export function compareRowNumAscForItems(a, b) {
  const itemA = a?.item;
  const itemB = b?.item;
  const ra = itemA?.rowNum;
  const rb = itemB?.rowNum;
  const na = ra == null || Number.isNaN(ra) ? null : Number(ra);
  const nb = rb == null || Number.isNaN(rb) ? null : Number(rb);
  if (na == null && nb == null) return 0;
  if (na == null) return 1;
  if (nb == null) return -1;
  if (na !== nb) return na - nb;
  const sa = String(itemA?.sheetName ?? '');
  const sb = String(itemB?.sheetName ?? '');
  const scmp = sa.localeCompare(sb, 'zh-CN');
  if (scmp !== 0) return scmp;
  const ia = itemA?.recordId ?? 0;
  const ib = itemB?.recordId ?? 0;
  if (ia !== ib) return ia - ib;
  const naName = itemA?.dataItemName || '';
  const nbName = itemB?.dataItemName || '';
  return naName.localeCompare(nbName, 'zh-CN');
}

export function sortFlattenEntriesByVersionDesc(entries) {
  return [...entries].sort((a, b) => {
    const va = pickItemVersion(a.item, a.block);
    const vb = pickItemVersion(b.item, b.block);
    const vcmp = compareVersionLabelsDesc(va, vb);
    if (vcmp !== 0) return vcmp;
    return compareRowNumAscForItems(a, b);
  });
}
