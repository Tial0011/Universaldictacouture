import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const folder = '.tools.local/section12-visual-comparisons';
await mkdir(folder, { recursive: true });
const references = '.tools.local/section12-final-visual-reference/';
// QA derivatives only; these boards are never bundled into the real website.
const pairs = [
  ['A01-desktop', 'image1.png', '.tools.local/section12-visual-sign-in-1440.png', {left:4,top:76,width:636,height:928}],
  ['A01-mobile', 'image1.png', '.tools.local/section12-visual-sign-in-390.png', {left:667,top:126,width:278,height:696}],
  ['A02-shell', 'image2.png', '.tools.local/section12-1440.png', {left:10,top:90,width:1179,height:774}],
  ['A03-responsive', 'image3.png', '.tools.local/section12-390.png', {left:1402,top:272,width:326,height:874}],
  ['A04-access', 'image4.png', '.tools.local/section12-visual-access-restricted-390.png', {left:1094,top:198,width:206,height:630}],
  ['A05-denied', 'image5.png', '.tools.local/section12-visual-destination-denied-1440.png', {left:1235,top:246,width:550,height:532}],
  ['A05-state-family', 'image5.png', '.tools.local/section12-visual-states-390.png', null],
  ['B01-logo', 'image6.jpg', 'src/assets/brand/logo.png', null],
];
for (const [id, ref, actual, crop] of pairs) {
  let reference = sharp(references + ref);
  if (crop) reference = reference.extract(crop);
  const left = await reference.resize({width:750,height:900,fit:'contain',background:'#fbf8f2'}).png().toBuffer();
  const right = await sharp(actual).resize({width:750,height:900,fit:'contain',background:'#fbf8f2'}).png().toBuffer();
  await sharp({create:{width:1516,height:900,channels:4,background:'#f1eae0'}}).composite([{input:left,left:0,top:0},{input:right,left:766,top:0}]).png().toFile(`${folder}/${id}.png`);
}
console.log(`Prepared ${pairs.length} source / implementation comparison inputs.`);
