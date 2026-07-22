/**
 * 从 .docx Buffer 读取 word/document.xml
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

function removeDirSafe(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function readDocumentXmlFromDocx(buffer) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-docx-'));
  const zipPath = path.join(tempRoot, 'archive.zip');
  const outDir = path.join(tempRoot, 'out');

  try {
    fs.writeFileSync(zipPath, buffer);
    fs.mkdirSync(outDir, { recursive: true });

    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force"`,
        { stdio: 'pipe' }
      );
    } else {
      execSync(`unzip -q "${zipPath}" -d "${outDir}"`, { stdio: 'pipe' });
    }

    const xmlPath = path.join(outDir, 'word', 'document.xml');
    if (!fs.existsSync(xmlPath)) {
      throw new Error('无效的 docx：缺少 word/document.xml');
    }

    return fs.readFileSync(xmlPath, 'utf8');
  } finally {
    removeDirSafe(tempRoot);
  }
}
