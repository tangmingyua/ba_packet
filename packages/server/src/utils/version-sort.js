/**
 * 版本标签倒序（新/大版本在前）。无版本号的排在有版本号之后。
 */
export function compareVersionLabelsDesc(a, b) {
  const va = String(a ?? '').trim();
  const vb = String(b ?? '').trim();
  if (!va && !vb) return 0;
  if (!va) return 1;
  if (!vb) return -1;
  return vb.localeCompare(va, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortByVersionLabelDesc(items, pickVersion = (item) => item.versionLabel) {
  return [...items].sort((x, y) => compareVersionLabelsDesc(pickVersion(x), pickVersion(y)));
}
