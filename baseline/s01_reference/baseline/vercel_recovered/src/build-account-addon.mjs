import fs from 'node:fs';
import path from 'node:path';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const packed=fs.readFileSync('account-addon.br');
if(createHash('sha256').update(packed).digest('hex')!=='321aa9d5065ade59fc22bac871ea4f2b162c12ade105e3104477a19ae7c88283')throw Error('ACCOUNT_ADDON_INTEGRITY');
const expected=['lib/ctrader-readonly.mjs','lib/account-handler.mjs','public/konto-live.html','public/konto-live.js','public/konto-live.css','add-account-link.mjs'];
const files=JSON.parse(brotliDecompressSync(packed));
if(Object.keys(files).sort().join('|')!==[...expected].sort().join('|'))throw Error('INVALID_ACCOUNT_ADDON_FILES');
for(const name of expected){if(typeof files[name]!=='string')throw Error('INVALID_SOURCE');fs.mkdirSync(path.dirname(name),{recursive:true});fs.writeFileSync(name,files[name]);}
await import('./add-account-link.mjs');
console.log('Account reader 1.3.4: fixed cTrader DATA profile; user authentication still required.');
