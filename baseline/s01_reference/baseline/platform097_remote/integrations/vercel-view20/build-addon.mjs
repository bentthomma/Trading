// Run after the unchanged existing ExtremeLab build. No account data is bundled.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const name of ['revolution.html','revolution.css','revolution.js','revolution-link.css'])await copyFile('view20-public/'+name,'public/'+name);
await copyFile('lib/projection.mjs','public/revolution-contract.mjs');
for(const name of ['index.html','konto-live.html']){
 const path='public/'+name;let html=await readFile(path,'utf8');
 if(!html.includes('</head>')||!html.includes('</body>'))throw Error('EXISTING_PAGE_STRUCTURE_UNCONFIRMED:'+name);
 if(!html.includes('id="th3rev20-link"')){
  html=html.replace('</head>','<link rel="stylesheet" href="/revolution-link.css"></head>');
  html=html.replace('</body>','<aside id="th3rev20-link" class="th3rev20-link"><a href="/revolution.html">Th3R3v0lut10n 2.0 · lokale Berichte online ansehen</a></aside></body>');
  await writeFile(path,html);
 }
}
console.log('Th3R3v0lut10n 2.0 read-only view built; no trading authority.');
