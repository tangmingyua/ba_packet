/**
 * 1104 表样文件命名规则（模块列表与子类配置主类共用 modules 表）
 */

import { listModules } from '../services/dataset-config.js';

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

/** 由表号推断模块（无 module_code 时的兜底） */
export function inferFormTemplateModule(reportCode) {
  const code = String(reportCode || '').trim().toUpperCase();
  if (/^NR\d/.test(code)) return 'IMAS';
  if (/^(G|S)\d/.test(code)) return '1104';
  return '1104';
}

/** 校验并规范化导入时选择的模块（须为子类配置中的主类） */
export function normalizeFormTemplateModuleCode(code) {
  const normalized = String(code ?? '').trim();
  if (!normalized) return '';
  const known = listModules().some((m) => m.code === normalized);
  if (!known) {
    throw new Error(`未知模块：${normalized}（请先在子类配置中添加主类）`);
  }
  return normalized;
}
