import fs from 'node:fs';
const path='public/online.js';let code=fs.readFileSync(path,'utf8');
const from="const recent=s?.producerConnected&&Number.isFinite(age)&&age<45;";
if(code.split(from).length!==2)throw Error('Unexpected live UI source; not patched');
code=code.replace(from,"const recent=s?.producerConnected&&Number.isFinite(age)&&age<45&&s?.dataFresh===true;");
fs.writeFileSync(path,code);
let html=fs.readFileSync('public/index.html','utf8');html=html.replaceAll('1.3.1','1.3.2');html=html.replace('Live-Verbindungsadapter','Live-Verbindungsadapter · Diagnose verfügbar');fs.writeFileSync('public/index.html',html);
let api=fs.readFileSync('api/desk.js','utf8');if(!api.includes('1.3.1-web-live-adapter'))throw Error('Unexpected health version');fs.writeFileSync('api/desk.js',api.replace('1.3.1-web-live-adapter','1.3.2-web-live-adapter'));
console.log('Data freshness required: a connected sender alone is not proof of current data.');
