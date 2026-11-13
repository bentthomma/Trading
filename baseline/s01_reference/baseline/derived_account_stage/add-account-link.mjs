import fs from 'node:fs';
const path='public/index.html';let html=fs.readFileSync(path,'utf8');
if(!html.includes('konto-live.html')){
 if(!html.includes('<div class="toolbar">'))throw Error('DESK_TOOLBAR_NOT_FOUND');
 html=html.replace('<div class="toolbar">','<div class="toolbar"><a class="badge" href="/konto-live.html">Konto live verbinden</a>');
 fs.writeFileSync(path,html);
}
console.log('Read-only account connector added. No cBot modified. Credentials are still required.');
