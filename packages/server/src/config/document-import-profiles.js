/**
 * Word 填报说明导入 Profile（切分锚点 + 模块 + 树构建策略）
 */

/** @typedef {'1104-semantic' | 'structure'} TreeMode */

/**
 * @typedef {object} WordImportProfile
 * @property {string} id
 * @property {string} label
 * @property {string} moduleCode
 * @property {number} priority
 * @property {RegExp[]} [fileNamePatterns]
 * @property {RegExp[]} [contentHints]
 * @property {RegExp} [anchorTextMatch]
 * @property {RegExp} [docCodeFromTitle]
 * @property {number} [levelMax]
 * @property {number} minAnchors
 * @property {TreeMode} treeMode
 */

/** @type {WordImportProfile[]} */
export const WORD_IMPORT_PROFILES = [
  {
    id: 'imas-nr',
    label: 'IMAS 采集规范',
    moduleCode: 'IMAS',
    priority: 30,
    fileNamePatterns: [/IMAS[-_]NR/i, /NR.*填报说明/i],
    contentHints: [/NR\s*表数据采集/, /3\.\d+\s+NR\d{2}\s+/],
    anchorTextMatch: /^3\.\d+\s+(NR\d{2})\s+.+/,
    docCodeFromTitle: /(NR\d{2})/,
    levelMax: 3,
    minAnchors: 2,
    treeMode: 'structure',
  },
  {
    id: '1104-merged',
    label: '1104 合并填报说明',
    moduleCode: '1104',
    priority: 20,
    contentHints: [
      /[A-Za-z]\d{2}.*《.+》填报说明/,
      /第[一二三四五六七八九十百零]+部分：/,
    ],
    anchorTextMatch:
      /^[A-Za-z][A-Za-z0-9_ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻ-]*(?:\s*[（(][^）)]+[）)])?\s*《.+》填报说明(?:（.+）)?$/,
    docCodeFromTitle: /^([A-Za-z][A-Za-z0-9_ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻ-]*)/,
    minAnchors: 2,
    treeMode: '1104-semantic',
  },
  {
    id: 'generic',
    label: '通用 Word',
    moduleCode: '',
    priority: -1,
    minAnchors: 999,
    treeMode: 'structure',
  },
];

/**
 * @param {string} [profileId]
 * @param {{ fileName?: string, sampleText?: string }} ctx
 */
export function resolveWordImportProfile(profileId, ctx = {}) {
  if (profileId) {
    const forced = WORD_IMPORT_PROFILES.find((p) => p.id === profileId);
    if (forced) return forced;
    throw new Error(`未知的导入 Profile：${profileId}`);
  }

  const fileName = String(ctx.fileName || '');
  const sampleText = String(ctx.sampleText || '');

  const ranked = [...WORD_IMPORT_PROFILES]
    .filter((p) => p.id !== 'generic')
    .sort((a, b) => b.priority - a.priority);

  for (const profile of ranked) {
    if (profile.fileNamePatterns?.some((re) => re.test(fileName))) return profile;
    if (profile.contentHints?.some((re) => re.test(sampleText))) return profile;
  }

  return WORD_IMPORT_PROFILES.find((p) => p.id === 'generic');
}

export function extractDocCodeFromTitle(text, profile) {
  const raw = String(text || '').trim();
  if (!raw || !profile.docCodeFromTitle) return '';
  const m = raw.match(profile.docCodeFromTitle);
  if (!m) return '';
  const code = (m[1] || m[0] || '').trim();
  return code.replace(/[a-z]/g, (ch) => ch.toUpperCase());
}
