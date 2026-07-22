/**
 * 1104 表样 report_code ↔ 填报说明 doc_code 映射
 * 例：G0100 → G01，G5300 → G53
 * GF01、G01_III 等附注/变体代号默认不自动映射表样
 */

/** 仅 G01、G53 等纯 G+数字代号可推导默认表样 */
export function defaultReportCodeForDocCode(docCode) {
  const m = String(docCode || '').toUpperCase().match(/^G(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return `G${String(n).padStart(2, '0')}00`;
}

/** @deprecated 使用 defaultReportCodeForDocCode */
export function docCodeToReportCode(docCode) {
  return defaultReportCodeForDocCode(docCode) || String(docCode || '').toUpperCase();
}

export function reportCodeToDocCode(reportCode) {
  const m = String(reportCode || '').toUpperCase().match(/^G(\d+)$/);
  if (!m) return null;
  let digits = m[1];
  if (digits.endsWith('00') && digits.length > 2) {
    digits = digits.slice(0, -2);
  }
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return null;
  return n < 100 ? `G${String(n).padStart(2, '0')}` : `G${n}`;
}

export function normalizeReportCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return '';
  const doc = reportCodeToDocCode(normalized);
  return doc ? defaultReportCodeForDocCode(doc) || normalized : normalized;
}

export function normalizeReportCodeInput(code) {
  return String(code || '').trim().toUpperCase();
}
