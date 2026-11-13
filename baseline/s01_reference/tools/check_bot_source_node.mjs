// Independent Node decoding of preserved bytes; does not import native bot code.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
const [directory, manifestPath] = process.argv.slice(2);
if (!directory || !manifestPath) throw Error('USAGE: source-directory binding-proof.json');
const expected=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const chunks=[0,1,2].map(i=>fs.readFileSync(path.join(directory,`bot-src.${i}`)));
for (let i=0;i<chunks.length;i++) {
 const meta=expected.segments[i], b=chunks[i];
 if (b.length!==meta.bytes || sha(b)!==meta.sha256 || createHash('sha1').update(b).digest('hex')!==meta.sha1) throw Error('SEGMENT_MISMATCH');
}
const packed=Buffer.concat(chunks);
if (sha(packed)!=='9e919ec1a94a5c0c569d7b9f46811ae98fed92a02b74773ef12d1821a14d81a3') throw Error('BOT_SOURCE_HASH_MISMATCH');
const sources=JSON.parse(brotliDecompressSync(packed,{maxOutputLength:1000000}).toString('utf8'));
if(Object.keys(sources).sort().join('\n')!==expected.files.map(x=>x.path).sort().join('\n')) throw Error('SOURCE_SET');
for(const meta of expected.files){
 if(typeof sources[meta.path]!=='string' || !/^[A-Za-z0-9]+\.(cs|csproj)$/.test(meta.path)) throw Error('INVALID_BOT_SOURCE');
 const b=Buffer.from(sources[meta.path],'utf8');
 if (b.length!==meta.bytes || sha(b)!==meta.sha256) throw Error('SOURCE_BYTES');
}
console.log(JSON.stringify({node:process.version,decoded_files:Object.keys(sources).length,payload_sha256:sha(packed),archive_sources_byte_equal:true,binary_build:false,bot_execution:false}));
