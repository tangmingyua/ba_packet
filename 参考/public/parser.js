// parser.js - Word / Excel 文件解析模块
// 解析上传的文件，提取结构化数据供预览和导入使用
const mammoth = require('mammoth');
const XLSX = require('xlsx');

// ===== 日期提取 =====

// 从文本中提取日期（YYYY-MM-DD 或 YYYY/MM/DD 或 YYYY年MM月DD日）
function extractDateFromText(text) {
  if (!text) return '';
  // YYYY年MM月DD日
  let m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  // YYYY年MM月
  m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (m) return `${m[1]}-${pad(m[2])}`;
  // YYYY-MM-DD / YYYY/MM/DD
  m = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  // YYYY-MM / YYYY/MM
  m = text.match(/(\d{4})[-\/](\d{1,2})(?!\d)/);
  if (m) return `${m[1]}-${pad(m[2])}`;
  return '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// 从 Excel 文件中提取日期（搜索前 30 行文本）
function extractDateFromExcel(workbook) {
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return '';
  const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1:A1');
  const maxRow = Math.min(range.e.r, 30);
  let allText = '';
  for (let r = range.s.r; r <= maxRow; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = firstSheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.v != null) allText += String(cell.v) + ' ';
    }
  }
  return extractDateFromText(allText);
}

// ===== Excel 解析 =====

function parseExcelFile(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true, cellDates: false });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames.length) throw new Error('Excel 文件无工作表');

  // 从前几行提取日期
  const detectedDate = extractDateFromExcel(workbook);

  const reports = [];
  let totalRows = 0;
  const previewSheets = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const maxRow = range.e.r + 1;
    const maxCol = range.e.c + 1;

    // 读取合并单元格
    const merges = (sheet['!merges'] || []).map(m => ({
      r1: m.s.r + 1, c1: m.s.c + 1,
      r2: m.e.r + 1, c2: m.e.c + 1,
    }));

    // 读取单元格
    const cells = {};
    const items = [];
    let displayRows = 0;
    for (let r = range.s.r; r <= range.e.r; r++) {
      let rowHasContent = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell && cell.v != null) {
          const key = `${r + 1},${c + 1}`;
          let val = cell.v;
          if (cell.t === 'n' && Number.isFinite(val)) {
            // 保持数字
          } else {
            val = String(val).trim();
          }
          cells[key] = val;
          if (val !== '') rowHasContent = true;
        }
      }
      if (rowHasContent) {
        displayRows++;
        totalRows++;
      }
    }

    // 提取数据项（非空第一列文本）
    for (let r = range.s.r; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: range.s.c });
      const cell = sheet[addr];
      if (cell && cell.v != null && String(cell.v).trim()) {
        items.push({ row_num: r + 1, item_text: String(cell.v).trim() });
      }
    }

    // 读取列宽行高
    const colWidths = {};
    if (sheet['!cols']) {
      sheet['!cols'].forEach((col, i) => {
        if (col && col.wpx) colWidths[String(i + 1)] = Math.round(col.wpx / 7.2);
      });
    }
    const rowHeights = {};
    if (sheet['!rows']) {
      sheet['!rows'].forEach((row, i) => {
        if (row && row.hpt) rowHeights[String(i + 1)] = row.hpt;
      });
    }

    // 报表代码：尝试从 sheet 名或第一行提取
    let code = sheetName;
    const firstRowCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })];
    if (firstRowCell && firstRowCell.v) {
      const codeMatch = String(firstRowCell.v).match(/([A-Z]\d{3,})/);
      if (codeMatch) code = codeMatch[1];
    }

    // 构造 layout
    const layout = { maxRow, maxCol, cells, merges, colWidths, rowHeights };

    // 报表名称：第一行第一个单元格内容
    const nameCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })];
    const name = nameCell ? String(nameCell.v).trim() : sheetName;

    reports.push({
      code,
      name,
      version: '',
      scope: '',
      frequency: '',
      currency: '',
      maxRow,
      maxCol,
      layout,
      items,
    });

    // 预览数据（前 30 行）
    const previewRows = [];
    const previewMaxRow = Math.min(range.e.r, 29);
    for (let r = range.s.r; r <= previewMaxRow; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row.push(cell && cell.v != null ? String(cell.v) : '');
      }
      previewRows.push(row);
    }
    previewSheets.push({
      sheet_name: sheetName,
      code,
      name,
      max_row: maxRow,
      max_col: maxCol,
      row_count: displayRows,
      merge_count: merges.length,
      item_count: items.length,
      preview_rows: previewRows,
      preview_col_count: maxCol,
    });
  }

  return {
    type: 'excel',
    reports,
    detectedDate,
    preview: { sheets: previewSheets },
    stats: {
      sheets: sheetNames.length,
      rows: totalRows,
      reports: reports.length,
    },
  };
}

// ===== Word 解析 =====

async function parseWordFile(buffer, filename) {
  // 使用 mammoth 提取原始 HTML 和纯文本
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const rawHtml = htmlResult.value || '';

  // 提取纯文本
  const textResult = await mammoth.extractRawText({ buffer });
  const fullText = textResult.value || '';

  // 从前 500 字符中检测日期
  const detectedDate = extractDateFromText(fullText.slice(0, 500));

  // 按标题分段（h1/h2/h3）
  const sections = parseWordSections(rawHtml, fullText);

  // 生成预览
  const previewText = fullText.slice(0, 3000);
  const previewSections = sections.map(s => ({
    word_code: s.word_code,
    report_name: s.report_name,
    title: s.title,
    para_count: s.para_count,
    preview_text: s.section_text.slice(0, 500) + (s.section_text.length > 500 ? '...' : ''),
    item_count: s.items.length,
  }));

  return {
    type: 'word',
    sections,
    detectedDate,
    preview: {
      full_text_preview: previewText,
      total_length: fullText.length,
      sections: previewSections,
    },
    stats: {
      sections: sections.length,
      total_items: sections.reduce((sum, s) => sum + s.items.length, 0),
      total_length: fullText.length,
    },
  };
}

// 解析 Word HTML 为章节结构
function parseWordSections(html, fullText) {
  const sections = [];

  // 简化策略：按 <h1> / <h2> / <h3> 分段
  // 先把 HTML 按标题标签拆分
  const parts = html.split(/<(?:h1|h2|h3)[^>]*>/i);
  const headers = html.match(/<(?:h1|h2|h3)[^>]*>([^<]*)<\/(?:h1|h2|h3)>/gi) || [];

  // 如果没有标题标签，整体作为一个 section
  if (parts.length <= 1 || headers.length === 0) {
    const code = extractCodeFromText(fullText) || 'WORD001';
    const items = extractItemsFromText(fullText);
    sections.push({
      word_code: code,
      report_name: extractReportName(fullText),
      excel_code: '',
      title: filename || '填报说明',
      section_text: fullText,
      para_count: countParagraphs(fullText),
      items,
    });
    return sections;
  }

  // 有标题标签，逐段处理
  for (let i = 0; i < headers.length; i++) {
    const headerText = headers[i].replace(/<[^>]+>/gi, '').trim();
    const bodyHtml = (parts[i + 1] || '').split(/<(?:h1|h2|h3)[^>]*>/i)[0];
    const bodyText = stripHtml(bodyHtml).trim();

    if (!bodyText) continue;

    const code = extractCodeFromText(headerText) || `WORD${String(i + 1).padStart(3, '0')}`;
    const reportName = extractReportName(headerText) || headerText;
    const items = extractItemsFromText(bodyText);

    sections.push({
      word_code: code,
      report_name: reportName,
      excel_code: extractExcelCode(bodyText),
      title: headerText,
      section_text: bodyText,
      para_count: countParagraphs(bodyText),
      items,
    });
  }

  // 如果没分出 section，兜底
  if (sections.length === 0) {
    const code = extractCodeFromText(fullText) || 'WORD001';
    sections.push({
      word_code: code,
      report_name: extractReportName(fullText),
      excel_code: '',
      title: '填报说明',
      section_text: fullText,
      para_count: countParagraphs(fullText),
      items: extractItemsFromText(fullText),
    });
  }

  return sections;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function extractCodeFromText(text) {
  if (!text) return '';
  const m = text.match(/([A-Z]\d{3,})/);
  return m ? m[1] : '';
}

function extractExcelCode(text) {
  if (!text) return '';
  const m = text.match(/(?:Excel|表|代码|编码)[:：\s]*([A-Z]\d{3,})/i);
  return m ? m[1] : '';
}

function extractReportName(text) {
  if (!text) return '';
  // 去掉代码部分
  return text.replace(/^[A-Z]\d{3,}\s*/, '').trim().slice(0, 50);
}

function extractItemsFromText(text) {
  // 按行提取带编号的项（如 1. xxx 或 [xxx] xxx）
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^(?:\d+[.、）)]|\[([^\]]+)\])\s*(.+)/);
    if (m) {
      items.push({
        title: m[1] || m[0].split(/[\.\s]/)[0],
        text: m[2] || line,
      });
    }
  }
  return items;
}

function countParagraphs(text) {
  return text.split(/\n\s*\n/).filter(p => p.trim()).length;
}

module.exports = {
  parseExcelFile,
  parseWordFile,
  extractDateFromText,
  extractDateFromExcel,
};
