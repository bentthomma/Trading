import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { fail } from './errors.mjs';

// Windows CurrentUser DPAPI; other platforms deliberately keep secrets in memory.
// There is no silently generated plaintext key alongside the encrypted values.
export class Vault {
  constructor(directory,{platform=process.platform}={}){this.path=join(directory,'credentials.dpapi.json');this.platform=platform;this.closed=false;this.cache=new Map();this.generations=new Map();this.sealed={};if(platform==='win32'&&existsSync(this.path)){try{this.sealed=JSON.parse(readFileSync(this.path,'utf8'));}catch{fail('VAULT_INVALID','Der lokale Zugangsspeicher ist beschädigt.',503);}}}
  get persistent(){return this.platform==='win32';}
  assertOpen(){if(this.closed)fail('VAULT_CLOSED','Der Zugangsspeicher dieser Sitzung ist geschlossen.',503);}
  async crypt(value,unprotect=false){
    const op=unprotect?'Unprotect':'Protect';
    const script=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$x=[Convert]::FromBase64String([Console]::In.ReadToEnd());$y=[Security.Cryptography.ProtectedData]::${op}($x,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($y))`;
    const exe=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    return new Promise((resolve,reject)=>{
      const child=execFile(exe,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:65536},(err,stdout)=>{if(err||!/^[A-Za-z0-9+/=\r\n]+$/.test(stdout)){reject(new Error('VAULT_CRYPTO_UNAVAILABLE'));return;}resolve(Buffer.from(stdout.trim(),'base64'));});
      child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(value).toString('base64'));
    });
  }
  save(){this.assertOpen();const temp=this.path+'.tmp';writeFileSync(temp,JSON.stringify(this.sealed),{mode:0o600});renameSync(temp,this.path);if(this.platform!=='win32')chmodSync(this.path,0o600);}
  advanceGeneration(key){this.assertOpen();const generation=(this.generations.get(key)||0)+1;this.generations.set(key,generation);return generation;}
  async set(key,value){
    this.assertOpen();
    if(typeof value!=='string'||!value||value.length>16000)fail('SECRET_INVALID','Zugangsdaten sind nicht gültig.');
    // Starting a replacement also fences earlier writes and decrypts for this key.
    const generation=this.advanceGeneration(key);
    if(this.persistent){
      let encrypted;try{encrypted=await this.crypt(Buffer.from(value,'utf8'));}catch{this.assertOpen();fail('VAULT_UNAVAILABLE','Windows-Zugangsspeicher ist nicht verfügbar. Zugang wurde nicht gespeichert.',503);}
      this.assertOpen();
      if(this.generations.get(key)!==generation)fail('VAULT_OPERATION_CANCELLED','Zugangsdaten wurden während des Speicherns geändert oder entfernt.',409);
      this.sealed[key]=encrypted.toString('base64');this.save();
    }
    // A decrypt could have started while protection was pending. Fence that too.
    this.advanceGeneration(key);
    this.cache.set(key,value);
  }
  async get(key){
    if(this.closed)return null;
    if(this.cache.has(key))return this.cache.get(key);
    const generation=this.generations.get(key)||0,sealed=this.sealed[key];
    if(this.persistent&&typeof sealed==='string'){
      try{
        const value=(await this.crypt(Buffer.from(sealed,'base64'),true)).toString('utf8');
        if(this.closed||(this.generations.get(key)||0)!==generation||this.sealed[key]!==sealed)return null;
        this.cache.set(key,value);return value;
      }catch{return null;}
    }
    return null;
  }
  delete(key){if(this.closed)return;this.advanceGeneration(key);this.cache.delete(key);if(Object.hasOwn(this.sealed,key)){delete this.sealed[key];this.save();}}
  // A late native encryption/decryption belongs to this instance only. Closing
  // fences it permanently, including cleanup after a new Core opens the file.
  close(){if(this.closed)return;this.closed=true;this.cache.clear();this.generations.clear();this.sealed={};}
  status(){return {persistent:this.persistent,protection:this.persistent?'Windows DPAPI CurrentUser':'memory-only',message:this.persistent?'Zugangsdaten sind an dein Windows-Profil gebunden.':'Auf diesem System bleiben Zugangsdaten nur bis zum Beenden im Arbeitsspeicher.'};}
}
