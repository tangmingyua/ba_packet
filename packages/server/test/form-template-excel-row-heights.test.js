import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isXlsxBuffer,
  loadExcelJsWorkbook,
  pointsToPixels,
  readExcelJsSheetRowHeightsPx,
  readExcelJsSheetColWidthsPx,
} from '../src/services/form-template-excel-row-heights.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_SAMPLE = path.resolve(__dirname, '../../../参考/文档');

function findMappingSamplePath() {
  if (!fs.existsSync(MAPPING_SAMPLE)) return null;
  const name = fs
    .readdirSync(MAPPING_SAMPLE)
    .find((f) => f.includes('Mapping_Sample') && f.endsWith('.xlsx') && !f.startsWith('~$'));
  return name ? path.join(MAPPING_SAMPLE, name) : null;
}

describe('form-template-excel-row-heights', () => {
  it('pointsToPixels 换算', () => {
    assert.equal(pointsToPixels(16.1), Math.round(16.1 * 1.333));
  });

  it('isXlsxBuffer 识别 zip 头', () => {
    assert.equal(isXlsxBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0])), true);
    assert.equal(isXlsxBuffer(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), false);
  });

  it('一表通 Mapping Sample JGXX 金融许可证行使用默认行高而非超大估算', async () => {
    const samplePath = findMappingSamplePath();
    if (!samplePath) {
      return;
    }
    const buffer = fs.readFileSync(samplePath);
    assert.ok(isXlsxBuffer(buffer, samplePath));

    const wb = await loadExcelJsWorkbook(buffer);
    const heights = readExcelJsSheetRowHeightsPx(wb, 'JGXX(1.1机构信息)', 0, 29);
    assert.equal(heights.length, 29);
    assert.ok(heights[7] > 0 && heights[7] < 100, `row8 px=${heights[7]}`);

    const colWidths = readExcelJsSheetColWidthsPx(wb, 'JGXX(1.1机构信息)', 0, 46);
    assert.equal(colWidths.length, 46);
    assert.ok(colWidths[8] > 0, `col I px=${colWidths[8]}`);
  });
});
