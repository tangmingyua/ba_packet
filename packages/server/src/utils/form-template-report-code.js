/** 去掉 1104 Sheet 常见的 _231 版本后缀，便于目录表号与表样 report_code 对齐 */
export function normalizeFormTemplateReportCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/_\d+$/, '');
}

export function formTemplateReportCodesMatch(a, b) {
  const x = String(a ?? '').trim().toUpperCase();
  const y = String(b ?? '').trim().toUpperCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return normalizeFormTemplateReportCode(x) === normalizeFormTemplateReportCode(y);
}
