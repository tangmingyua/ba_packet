/**
 * 1104 表样文件命名与模块注册（可扩展更多 G 表）
 */

export const FORM_TEMPLATE_MODULES = [
  { code: '1104', name: '1104', sortOrder: 0 },
];

/** @type {{ pattern: RegExp, module: string, minHeaderRows?: number }[]} */
export const FORM_TEMPLATE_RULES = [
  {
    pattern: /^G\d+-logic_\d+\.xls(x)?$/i,
    module: '1104',
  },
  {
    pattern: /logic_\d+\.xls(x)?$/i,
    module: '1104',
  },
  {
    pattern: /1104.*\.xls(x)?$/i,
    module: '1104',
  },
  {
    pattern: /汇总总表.*\.xls(x)?$/i,
    module: '1104',
  },
];

/**
 * @param {string} fileName
 * @returns {{ module: string, matched: boolean }}
 */
export function matchFormTemplateFileName(fileName) {
  const base = String(fileName || '').split(/[/\\]/).pop() || '';
  for (const rule of FORM_TEMPLATE_RULES) {
    if (rule.pattern.test(base)) {
      return { module: rule.module, matched: true };
    }
  }
  return { module: '1104', matched: false };
}
