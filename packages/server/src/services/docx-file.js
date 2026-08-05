/**
 * 从 .docx Buffer 读取 word/document.xml（OOXML / ZIP）
 */
import { unzipSync } from 'fflate';

const DOC_OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
const ZIP_MAGIC = [0x50, 0x4b];

function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (Buffer.isBuffer(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return new Uint8Array(buffer);
}

/** @returns {'docx'|'doc'|'unknown'} */
export function detectWordFileFormat(buffer) {
  const bytes = toUint8Array(buffer);
  if (bytes.length < 4) return 'unknown';
  if (bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1]) return 'docx';
  if (
    bytes[0] === DOC_OLE_MAGIC[0] &&
    bytes[1] === DOC_OLE_MAGIC[1] &&
    bytes[2] === DOC_OLE_MAGIC[2] &&
    bytes[3] === DOC_OLE_MAGIC[3]
  ) {
    return 'doc';
  }
  return 'unknown';
}

function normalizeZipPath(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

function findZipEntry(unzipped, normalizedPath) {
  for (const [path, data] of Object.entries(unzipped)) {
    if (normalizeZipPath(path) === normalizedPath) {
      return data;
    }
  }
  return null;
}

function findDocumentXmlEntry(unzipped) {
  return findZipEntry(unzipped, 'word/document.xml');
}

function decodeEntryBytes(bytes) {
  if (!bytes?.length) return '';
  return new TextDecoder('utf-8').decode(bytes);
}

function unzipDocxBuffer(buffer) {
  const format = detectWordFileFormat(buffer);
  if (format === 'doc') {
    throw new Error(
      '当前不支持旧版 Word 的 .doc 格式。请用 Word 或 WPS 打开后选择「另存为」→「Word 文档 (*.docx)」，再重新导入。'
    );
  }
  if (format !== 'docx') {
    throw new Error(
      '不是有效的 .docx 文件。请确认扩展名为 .docx 且文件未损坏；若为 .doc 请先另存为 .docx。'
    );
  }
  try {
    return unzipSync(toUint8Array(buffer));
  } catch {
    throw new Error(
      '无法解压 Word 文件（可能已损坏，或为 .doc 仅改扩展名）。请用 Word/WPS 另存为 .docx 后重试。'
    );
  }
}

/** @returns {{ documentXml: string, numberingXml: string }} */
export function readWordPartsFromDocx(buffer) {
  const unzipped = unzipDocxBuffer(buffer);
  const xmlBytes = findDocumentXmlEntry(unzipped);
  if (!xmlBytes?.length) {
    throw new Error(
      '无效的 docx：缺少 word/document.xml。请确认是 Office 2007 及以上版本的 .docx，而非 .doc 或未完整保存的文件。'
    );
  }
  const numberingBytes = findZipEntry(unzipped, 'word/numbering.xml');
  return {
    documentXml: decodeEntryBytes(xmlBytes),
    numberingXml: numberingBytes ? decodeEntryBytes(numberingBytes) : '',
  };
}

export function readDocumentXmlFromDocx(buffer) {
  const format = detectWordFileFormat(buffer);
  if (format === 'doc') {
    throw new Error(
      '当前不支持旧版 Word 的 .doc 格式。请用 Word 或 WPS 打开后选择「另存为」→「Word 文档 (*.docx)」，再重新导入。'
    );
  }
  return readWordPartsFromDocx(buffer).documentXml;
}
