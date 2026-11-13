import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, stat, realpath, readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, delimiter, extname, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const NAMES = [...(process.platform === 'win32' ? ['ctrader-cli.exe', 'cTrader.CLI.exe'] : ['ctrader-cli', 'cTrader.CLI']), 'ctrader-cli.dll'];
const DOTNET_NAME = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
const DOTNET_ARCH_ROOT = 'DOTNET_ROOT_' + ({ia32:'X86',x64:'X64',arm64:'ARM64',arm:'ARM'}[process.arch] || process.arch.toUpperCase());
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = (code, message, status = 400) => { throw Object.assign(new Error(message), { code, status, safe:true }); };

function childEnvironment() {
  // Do not expose unrelated API keys or server credentials to the CLI process.
  const names = ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA',
    'ProgramFiles','ProgramFiles(x86)','DOTNET_ROOT',DOTNET_ARCH_ROOT,'XDG_DOCUMENTS_DIR','LANG','LC_ALL'];
  return Object.fromEntries(names.filter(k => typeof process.env[k] === 'string').map(k => [k,process.env[k]]));
}
async function executable(path, names = NAMES, managed = extname(String(path)).toLowerCase() === '.dll') {
  if (typeof path !== 'string' || !isAbsolute(path) || path.length > 2000 || /[\0\r\n]/.test(path) ||
      !names.some(n => n.toLowerCase() === basename(path).toLowerCase())) return null;
  try {
    const resolved = await realpath(path), info = await stat(resolved);
    if (!info.isFile() || info.size < 1 || info.size > 300 * 1024 * 1024) return null;
    await access(resolved,managed || process.platform === 'win32' ? constants.R_OK : constants.X_OK);
    return resolved;
  } catch { return null; }
}
async function invocation(path) {
  const resolved = await executable(path); if (!resolved) return null;
  if (extname(resolved).toLowerCase() !== '.dll') return {path:resolved,command:resolved,prefix:[],managed:false};
  // The official 5.10.1 Linux image launches ctrader-cli.dll through dotnet.
  // Resolve an existing host, never install one or change runtime roll-forward.
  const candidates = [];
  for (const key of [DOTNET_ARCH_ROOT,'DOTNET_ROOT']) {
    const root = process.env[key]; if (root && isAbsolute(root)) candidates.push(join(root,DOTNET_NAME));
  }
  for (const dir of String(process.env.PATH || process.env.Path || '').split(delimiter).slice(0,80)) {
    if (isAbsolute(dir)) candidates.push(join(dir,DOTNET_NAME));
  }
  for (const candidate of [...new Set(candidates)]) {
    const host = await executable(candidate,[DOTNET_NAME],false);
    if (host) return {path:resolved,command:host,prefix:[resolved],managed:true};
  }
  return null;
}
async function cliVersion(path) {
  const cli = await invocation(path); if (!cli) return null;
  try {
    const result = await execute(cli.command,[...cli.prefix,'--version'],{shell:false,windowsHide:true,timeout:5000,maxBuffer:65536,encoding:'utf8',env:childEnvironment(),cwd:dirname(cli.path)});
    const output = result.stdout.trim().replace(/\r\n/g,'\n');
    const version = output.match(/\b\d+\.\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9._-]+)?\b/)?.[0];
    // Captured manufacturer DLL output is "dotnet --version\nVersion: 5.10.1.0".
    const managedVersion = cli.managed && (output === `Version: ${version}` || output === `${DOTNET_NAME} --version\nVersion: ${version}`);
    if (!version || !(/ctrader/i.test(output) || output === version || managedVersion)) return null;
    return {...cli,version};
  } catch { return null; }
}

// Reused by the deliberately narrow managed Observer runner. These are not
// exposed through HTTP and do not accept free command or environment inputs.
export { invocation as resolveCliInvocation, childEnvironment as cliChildEnvironment, cliVersion as inspectCliVersion };

function belowReady17Minimum(version) {
  const [major,minor] = version.split('.').map(Number);
  return major < 5 || major === 5 && minor < 10;
}

export async function discoverCli({configuredPath} = {}) {
  const candidates = [];
  if (configuredPath !== undefined && configuredPath !== null && configuredPath !== '') candidates.push(configuredPath);
  else {
    for (const dir of String(process.env.PATH || process.env.Path || '').split(delimiter).slice(0,80)) {
      if (isAbsolute(dir)) for (const name of NAMES) candidates.push(join(dir,name));
    }
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      for (const name of NAMES) candidates.push(join(process.env.LOCALAPPDATA,'Microsoft','WinGet','Links',name));
      const root = join(process.env.LOCALAPPDATA,'Spotware','cTrader');
      try {
        const entries = await readdir(root,{withFileTypes:true});
        for (const entry of entries.filter(e=>e.isDirectory()).slice(0,50)) for (const name of NAMES) candidates.push(join(root,entry.name,name));
      } catch { /* cTrader need not be installed. */ }
    }
  }
  let probes = 0;
  for (const candidate of [...new Set(candidates)]) {
    if (!await executable(candidate)) continue;
    if (++probes > 5) break;
    const found = await cliVersion(candidate);
    if (found) return {available:true,path:found.path,version:found.version,message:belowReady17Minimum(found.version)
      ? `cTrader CLI ${found.version} gefunden. Ready17 (.NET 10) benötigt mindestens CLI 5.10; die Metadatenkompatibilität ist noch nicht bestätigt.`
      : `cTrader CLI ${found.version} gefunden. Die Kompatibilität einer .algo-Datei ist erst nach erfolgreichem Metadatenlesen bestätigt.`};
  }
  return {available:false,path:null,version:null,message:configuredPath ? 'An diesem Ort konnte keine ausführbare cTrader CLI bestätigt werden.' : 'cTrader CLI nicht gefunden. Offiziell installieren oder den Installationsort auswählen.'};
}

function metadataManifest(metadata, hash) {
  // Exact metadata profile published in the official CLI documentation. An
  // unknown schema is preserved only as an error, never fabricated as parameters.
  if (!object(metadata) || metadata.Type !== 'cBot' || typeof metadata.Name !== 'string' || !metadata.Name.trim() || metadata.Name.length > 100 ||
      !Array.isArray(metadata.Parameters) || metadata.Parameters.length > 200)
    fail('ALGO_METADATA_UNSUPPORTED','Die CLI-Metadaten entsprechen keinem unterstützten cBot-Format.');
  const parameters = [], unsupportedParameters = [], seen = new Set();
  const cleanMetadata = structuredClone(metadata);
  const types = {Double:'number',Float:'number',Single:'number',Decimal:'number',Integer:'integer',Int32:'integer',Int64:'integer',Boolean:'boolean',String:'string'};
  for (let i=0;i<metadata.Parameters.length;i++) {
    const p=metadata.Parameters[i];
    if (!object(p) || typeof p.PropertyName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,199}$/.test(p.PropertyName) || seen.has(p.PropertyName) || typeof p.Type !== 'string')
      fail('ALGO_PARAMETER_INVALID','Die CLI meldet einen ungültigen oder doppelten Parameter.');
    seen.add(p.PropertyName);
    const secret=/password|secret|api.?key|token|credential/i.test(p.PropertyName);
    if(secret && Object.hasOwn(cleanMetadata.Parameters[i],'DefaultValue')) cleanMetadata.Parameters[i].DefaultValue='[entfernt]';
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(p.PropertyName) || ['constructor','prototype','__proto__'].includes(p.PropertyName)) {
      unsupportedParameters.push({id:p.PropertyName,type:p.Type,reason:'unsupported_parameter_id'});
      continue;
    }
    const type=types[p.Type], value=p.DefaultValue;
    const validDefault = type==='number' ? typeof value==='number' && Number.isFinite(value) : type==='integer' ? Number.isSafeInteger(value) :
      type==='boolean' ? typeof value==='boolean' : type==='string' ? typeof value==='string' && value.length<=1000 : false;
    if (secret || !type || !validDefault) {
      unsupportedParameters.push({id:p.PropertyName,type:p.Type,reason:secret?'credential_parameter':!type?'unsupported_type':'missing_or_invalid_default'});
      continue;
    }
    if (parameters.length >= 64) {
      unsupportedParameters.push({id:p.PropertyName,type:p.Type,reason:'parameter_limit'});
      continue;
    }
    const parameter={id:p.PropertyName,label:typeof p.FriendlyName==='string'&&p.FriendlyName.trim()?p.FriendlyName.slice(0,100):p.PropertyName,type,unit:'',default:value,live:false,
      description:typeof p.Description==='string'?p.Description.slice(0,500):'Startparameter des importierten Bots; keine bestätigte Live-Steuerung.'};
    if(type==='number'||type==='integer') {
      for(const [raw,key] of [['MinValue','min'],['MaxValue','max'],['Step','step']]) if(Object.hasOwn(p,raw)) {
        if(typeof p[raw]!=='number'||!Number.isFinite(p[raw])||(type==='integer'&&!Number.isSafeInteger(p[raw]))||(key==='step'&&p[raw]<=0))
          fail('ALGO_PARAMETER_RANGE_INVALID','Die CLI meldet einen ungültigen Parameterbereich.');
        parameter[key]=p[raw];
      }
      if(parameter.min!==undefined&&value<parameter.min||parameter.max!==undefined&&value>parameter.max||parameter.min!==undefined&&parameter.max!==undefined&&parameter.min>parameter.max)
        fail('ALGO_PARAMETER_RANGE_INVALID','Der Parameterstandard widerspricht den gemeldeten Grenzen.');
    }
    parameters.push(parameter);
  }
  return {name:metadata.Name,manifest:{id:'ctrader.algo.'+hash.slice(0,24),version:'1.0.0',parameters,capabilities:{liveConfiguration:false,telemetry:false}},
    metadata:cleanMetadata,unsupportedParameters};
}

export async function inspectAlgo(cliPath,algoPath) {
  const cli=await cliVersion(cliPath);
  if(!cli) fail('CTRADER_CLI_UNAVAILABLE','cTrader CLI konnte nicht bestätigt werden.',503);
  if(typeof algoPath!=='string'||!isAbsolute(algoPath)||algoPath.length>2000||/[\0\r\n]/.test(algoPath)||extname(algoPath).toLowerCase()!=='.algo')
    fail('ALGO_PATH_INVALID','Bitte den vollständigen Pfad zu einer .algo-Datei angeben.');
  let path, bytes;
  try {
    path=await realpath(algoPath); const info=await stat(path);
    if(!info.isFile()||info.size<1||info.size>64*1024*1024||extname(path).toLowerCase()!=='.algo') fail('ALGO_FILE_INVALID','Die .algo-Datei ist ungültig oder grösser als 64 MiB.');
    bytes=await readFile(path);
    if(bytes.length!==info.size||bytes.length>64*1024*1024) fail('ALGO_FILE_CHANGED','Die Botdatei wurde während des Imports verändert.');
  } catch(e) { if(e?.code?.startsWith('ALGO_')) throw e; fail('ALGO_FILE_UNAVAILABLE','Die .algo-Datei kann nicht gelesen werden.'); }
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const temporary=await mkdtemp(join(tmpdir(),'trading-algo-metadata-'));
  try {
    // Inspect frozen bytes while keeping the filename: the manufacturer CLI
    // derives metadata.Name from this basename, not from the robot type name.
    const frozen=join(temporary,basename(path));
    await writeFile(frozen,bytes,{mode:0o600});
    let output;
    try { output=await execute(cli.command,[...cli.prefix,'metadata',frozen],{shell:false,windowsHide:true,timeout:15000,maxBuffer:2*1024*1024,encoding:'utf8',env:childEnvironment(),cwd:temporary}); }
    catch { fail('ALGO_METADATA_FAILED',belowReady17Minimum(cli.version)
      ? 'cTrader CLI konnte die Metadaten nicht lesen. Für Ready17 und andere .NET-10-Dateien ist mindestens CLI 5.10 erforderlich.'
      : 'cTrader CLI konnte die Metadaten nicht lesen. Dateikompatibilität und CLI-Version prüfen.',502); }
    let metadata; try{metadata=JSON.parse(output.stdout.trim().replace(/^\uFEFF/,''));}catch{fail('ALGO_METADATA_UNSUPPORTED','cTrader CLI hat keine unterstützten JSON-Metadaten geliefert.',502);}
    return {path,sha256,cliVersion:cli.version,...metadataManifest(metadata,sha256)};
  } finally { await rm(temporary,{recursive:true,force:true}); }
}
