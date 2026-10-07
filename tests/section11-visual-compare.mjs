// Evidence only: reference derivatives are never imported into the application.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const directory = '.tools.local/section11-visual-comparisons';
await mkdir(directory, { recursive: true });
const comparisons = [
  ['entry-mobile', 1, { left: 562, top: 163, width: 164, height: 380 }, '.tools.local/section11-signin-390.png', null],
  ['recovery-mobile', 2, { left: 1328, top: 227, width: 179, height: 293 }, '.tools.local/section11-forgot-password-390.png', null],
  ['private-mobile', 3, { left: 549, top: 143, width: 171, height: 352 }, '.tools.local/section11-account-unavailable-390.png', null],
  ['overview', 4, { left: 346, top: 272, width: 1208, height: 1070 }, '.tools.local/section11-part2-overview-1440.png', { left: 405, top: 150, width: 880, height: 850 }],
  ['details', 6, { left: 629, top: 273, width: 891, height: 878 }, '.tools.local/section11-visual-personal-1440.png', { left: 405, top: 150, width: 880, height: 850 }],
  ['security-mobile', 8, { left: 1098, top: 123, width: 360, height: 840 }, '.tools.local/section11-part2-security-390.png', null],
  ['communications-mobile', 9, { left: 1172, top: 75, width: 290, height: 795 }, '.tools.local/section11-visual-communications-390.png', null],
  ['privacy', 10, { left: 580, top: 548, width: 897, height: 720 }, '.tools.local/section11-visual-privacy-1440.png', { left: 405, top: 150, width: 880, height: 850 }],
  ['shield', 11, { left: 1187, top: 584, width: 336, height: 565 }, '.tools.local/section11-visual-privacy-shield-390.png', null],
];
for (const [name, number, sourceCrop, implementationPath, implementationCrop] of comparisons) {
  const reference = `.tools.local/section11-final-reference/image${number}.png`;
  const prepare = async (path, crop) => {
    let operation = sharp(path); if (crop) operation = operation.extract(crop);
    return operation.resize(650, 900, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  };
  await sharp({ create: { width: 1320, height: 900, channels: 3, background: '#f1eae0' } }).composite([{ input: await prepare(reference, sourceCrop), left: 0, top: 0 }, { input: await prepare(implementationPath, implementationCrop), left: 670, top: 0 }]).png().toFile(`${directory}/${name}.png`);
}
console.log('Nine combined source-left / rendered-right comparisons generated. Source boards have framed/illustrative content; state/density equality is not asserted.');
