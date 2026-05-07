// Generates PNG launcher icons (192/512) and apple-touch-icon (180) from a
// single SVG using sharp. Run once after install: `node scripts/generate-icons.mjs`.
//
// Why a script and not a build step? PNG generation needs the heavy `sharp`
// dep which we don't want in the runtime bundle.

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#16a34a"/>
      <stop offset="100%" stop-color="#1ed760"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#0a0a0c"/>
  <path
    d="M208 110v210a64 64 0 1 1-32-55V158h128v-48H208z"
    fill="url(#g)"
  />
</svg>
`;

const targets = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' }
];

for (const { size, name } of targets) {
  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png()
    .toFile(resolve(publicDir, name));
  console.log(`✓ ${name}`);
}
