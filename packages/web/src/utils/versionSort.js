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

export function sortFlattenEntriesByVersionDesc(entries) {
  return [...entries].sort((a, b) => {
    const va = pickItemVersion(a.item, a.block);
    const vb = pickItemVersion(b.item, b.block);
    const vcmp = compareVersionLabelsDesc(va, vb);
    if (vcmp !== 0) return vcmp;
    const na = a.item?.dataItemName || '';
    const nb = b.item?.dataItemName || '';
    return na.localeCompare(nb, 'zh-CN');
  });
}
