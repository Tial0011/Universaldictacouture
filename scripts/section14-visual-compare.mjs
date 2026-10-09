import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
const root='.tools.local/section14-reference';
await mkdir(root+'/comparisons',{recursive:true});
for(const[name,source,runtime]of[
  ['workspace','library/image1.png','runtime/workspace-1440.png'],
  ['edition','library/image7.png','runtime/edition-history-1440.png'],
  ['notes','library/image27.png','runtime/operational-notes-1440.png'],
  ['escalation','library/image26.png','runtime/escalation-1440.png'],
]){
  const left=await sharp(root+'/'+source).resize(1000,750,{fit:'contain',background:'#ffffff'}).png().toBuffer();
  const right=await sharp(root+'/'+runtime).resize(1000,750,{fit:'contain',background:'#ffffff'}).png().toBuffer();
  await sharp({create:{width:2000,height:750,channels:3,background:'#ffffff'}}).composite([{input:left,left:0,top:0},{input:right,left:1000,top:0}]).png().toFile(root+'/comparisons/'+name+'.png');
  console.log(name+': source left / runtime right. Aspect-contained QA comparison, not a pixel-fidelity score or historical original.');
}
