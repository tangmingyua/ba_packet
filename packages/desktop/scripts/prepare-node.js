import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NODE_VERSION = '20.18.0';
const TARGET = path.resolve(__dirname, '../bundle/resources/node.exe');
const MIRROR_URL = `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/win-x64/node.exe`;

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);

    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          download(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载 Node 失败: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (error) => {
        fs.unlink(dest, () => reject(error));
      });
  });
}

if (fs.existsSync(TARGET)) {
  const sizeMb = (fs.statSync(TARGET).size / 1024 / 1024).toFixed(1);
  console.log(`Node 运行时已就绪: ${TARGET} (${sizeMb} MB)`);
} else {
  console.log(`正在下载 Node ${NODE_VERSION} win-x64...`);
  await download(MIRROR_URL, TARGET);
  const sizeMb = (fs.statSync(TARGET).size / 1024 / 1024).toFixed(1);
  console.log(`Node 运行时已下载: ${TARGET} (${sizeMb} MB)`);
}
