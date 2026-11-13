import fs from 'node:fs';
for(const file of ['public/index.html','api/desk.js']){let s=fs.readFileSync(file,'utf8');if(!s.includes('1.3.2'))throw Error('Unexpected version in '+file);fs.writeFileSync(file,s.replaceAll('1.3.2','1.3.3'));}
console.log('1.3.3 read-only fixes: existing positions without recent decisions, clear entry lock, multipart retention. No trading changes.');
await import('./build-account-addon.mjs');
