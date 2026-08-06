import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.desktop-build-stamp.env');
fs.writeFileSync(out, `BA_DESKTOP_BUILD_STAMP=${stamp}\r\n`, 'utf8');
process.stdout.write(stamp);
