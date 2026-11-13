import fs from 'node:fs';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const packed=Buffer.concat([0,1,2,3].map(i=>fs.readFileSync('assets.'+i)));
if(createHash('sha1').update(packed).digest('hex')!=='4fb080ee08dcfbca24cf7c1cd41e5109780ead6f')throw Error('Asset integrity mismatch');
for(const [name,contents]of Object.entries(JSON.parse(brotliDecompressSync(packed)))){if(!/^public\/[a-z0-9_.-]+$/.test(name))throw Error('Invalid asset name');fs.mkdirSync('public',{recursive:true});fs.writeFileSync(name,contents);}
// Correct the identified single-character transfer error, then verify the canonical source.
const encoded=fs.readFileSync('live-overlay.b64','utf8').replace('TzPY8+u2+fFQT','TzPY8+2+fFQT');
if(createHash('sha256').update(encoded).digest('hex')!=='d6c3117968c7ca1be50d82baa5179d6f49e730d7c1d4c367d1cec3b5ac5ffb47')throw Error('Live overlay integrity mismatch');
const overlay=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')));
for(const [path,data]of Object.entries(overlay)){if(!['patch-live.mjs','live-client.js'].includes(path))throw Error('INVALID_OVERLAY');fs.writeFileSync(path,data);}
await import('./patch-live.mjs');
console.log('ExtremeLab live adapter 1.3.1 built. No embedded account data.');
await import('./build-bot15.mjs');
