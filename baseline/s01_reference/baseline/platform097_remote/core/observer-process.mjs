/** Human-confirmed lifecycle for the single bundled read-only Observer.
 * This does not launch a trading engine, grant trading or infer broker flatness.
 * Readiness is a fresh, token/account/build-bound self-report; not an independent
 * broker proof. Persisted PIDs are diagnostic only and are never used to kill. */
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,lstat,open,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {observerCliAdapter} from '../adapters/observer-cli.mjs';
import {HUMAN} from './control.mjs';
import {fail,object} from './errors.mjs';
import {digest} from './schema.mjs';

export const MANAGED_OBSERVER=Object.freeze({
  profileId:'th3rev.observer.v1',filename:'Th3RevolutionObserver20_2_0_0_alpha4.algo',
  sha256:'c41679930303378d3caa107e58d5b2ee610733ad55efc0db4fa56a4d6e32d3d9',bytes:27603,
  engine:'Th3RevolutionObserver20',version:'2.0.0-alpha.4',
  sourceHash:'40daa866dc9e1452af37d3fcb4b24fbb3aa28d4d484503fe1cabc5b378ea581f'
});
const PREFIX='observer-process:v1:',REVIEWS='observer-process:pending-reviews:v1';
const ACTIVE=new Set(['preparing','spawning','starting','ready','stale','stopping']);
const TERMINAL=new Set(['exited','failed']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const PERIODS=new Set(['m1','m2','m3','m4','m5','m10','m15','m30','h1','h2','h4','d1']);
const sha=value=>createHash('sha256').update(value).digest('hex');
const stamp=()=>new Date().toISOString();
const safeText=(value,max,name)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))fail('OBSERVER_INPUT_INVALID',name+' ist nicht gültig.');return value.trim();};
const exactKeys=(value,keys)=>{if(!object(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))fail('OBSERVER_INPUT_INVALID','Die Eingabe entspricht nicht dem kontrollierten Observer-Start.');};
async function within(promise,ms,fallback=null){let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]);}finally{clearTimeout(timer);}}

export class ObserverProcessManager {
  constructor({control,vault,directory,origin,artifact,cliPath,adapter=observerCliAdapter,now=()=>Date.now(),monotonic=()=>performance.now(),reviewTtlMs=120000,startupTimeoutMs=90000,stopTimeoutMs=5000,pollMs=1000}){
    this.control=control;this.store=control.store;this.db=control.db;this.vault=vault;this.directory=join(resolve(directory),'observer-process');this.origin=origin;this.artifact=artifact;this.cliPath=cliPath;this.adapter=adapter;
    this.now=now;this.monotonic=monotonic;this.reviewTtlMs=reviewTtlMs;this.startupTimeoutMs=startupTimeoutMs;this.stopTimeoutMs=stopTimeoutMs;
    this.reviews=new Map();this.owned=new Map();this.generations=new Map();this.flights=new Set();this.settlements=new Set();this.closed=false;this.sealed=false;this.ticking=false;
    this.ready=this.#recover();this.ready.catch(()=>{});
    this.timer=setInterval(()=>this.#tick().catch(()=>{}),pollMs);this.timer.unref();
  }
  #record(id){
    const value=this.store.get(PREFIX+id);
    if(!value)return null;
    if(!object(value)||value.schema!==1||value.botId!==id||!UUID.test(value.launchId||'')||![...ACTIVE,...TERMINAL,'unknown'].includes(value.state))return {schema:1,botId:id,launchId:null,state:'unknown',reason:'PROCESS_STATE_INVALID'};
    return value;
  }
  #save(record){if(!this.sealed)this.store.set(PREFIX+record.botId,record);}
  #profile(id,actor,{active=true}={}){
    this.control.requireHuman(actor);if(this.closed)fail('CORE_CLOSING','Der lokale Dienst wird beendet.',503);
    const bot=this.control.rawBot(id);
    if(JSON.parse(bot.manifest).id!==MANAGED_OBSERVER.profileId||bot.adapter!=='bridge')fail('OBSERVER_PROFILE_REQUIRED','Nur der eigenständige, dauerhaft lesende Observer kann hier gestartet werden.',409);
    if(active&&bot.archived_at!==null)fail('BOT_ARCHIVED','Archivierte Profile können nicht gestartet werden.',409);
    return bot;
  }
  #artifact(){
    const a=this.artifact();
    if(a?.descriptor?.available!==true||a.descriptor.filename!==MANAGED_OBSERVER.filename||a.descriptor.sha256!==MANAGED_OBSERVER.sha256||a.descriptor.bytes!==MANAGED_OBSERVER.bytes||!Buffer.isBuffer(a.bytes)||a.bytes.length!==MANAGED_OBSERVER.bytes||sha(a.bytes)!==MANAGED_OBSERVER.sha256)
      fail('OBSERVER_ARTIFACT_UNVERIFIED','Die für den kontrollierten Start freigegebene Observer-Datei fehlt oder wurde verändert.',409);
    return a;
  }
  #tokens(id){return this.db.prepare("SELECT id FROM tokens WHERE bot_id=? AND kind='bridge' AND revoked_at IS NULL ORDER BY id").all(id).map(x=>x.id);}
  #persistReviews(){if(!this.sealed)this.store.set(REVIEWS,[...this.reviews.values()].map(r=>({id:r.id,secretRef:r.secretRef,expiresAt:r.expiresAt})));}
  #forgetSecret(secretRef,retry=false){
    try{
      this.vault.delete(secretRef);
      // DPAPI deletion may have changed the in-memory map before its atomic
      // file replacement failed. A retry must persist that map, not silently
      // interpret the now-absent in-memory entry as a successful disk delete.
      if(retry&&this.vault.persistent)this.vault.save();
      return true;
    }catch{return false;}
  }
  #discard(review){
    if(!review||this.sealed)return true;
    if(!this.#forgetSecret(review.secretRef,review.secretCleanupFailed===true)){
      review.secretCleanupFailed=true;review.cleanupOnly=true;review.flight=null;review.expiresAt=Math.min(review.expiresAt,this.now());
      const record=this.#record(review.botId);if(record?.reviewId===review.id){record.vaultCleanupPending=true;record.credentialCleanupPending=true;this.#save(record);}
      this.#persistReviews();return false;
    }
    this.reviews.delete(review.id);this.#persistReviews();return true;
  }
  #expire(){for(const r of this.reviews.values())if(!r.flight&&(this.now()>r.expiresAt||this.now()<r.createdAt||this.monotonic()-r.createdMonotonic>this.reviewTtlMs))this.#discard(r);}
  #eligible(id){
    const record=this.#record(id);
    if([...this.reviews.values()].some(r=>r.botId===id&&r.cleanupOnly))fail('OBSERVER_SECRET_CLEANUP_PENDING','Die vorherigen Zugangsdaten konnten noch nicht vollständig entfernt werden. Bereinigung erneut prüfen.',409);
    if(record?.state==='unknown')fail('OBSERVER_PROCESS_OWNERSHIP_UNKNOWN','Nach dem Core-Neustart ist die frühere Prozesszuordnung unbestätigt. Kein zweiter Start und kein Stop anhand einer gespeicherten PID.',409);
    if(this.owned.has(id)||record&&ACTIVE.has(record.state))fail('OBSERVER_PROCESS_ALREADY_ACTIVE','Dieser Observer besitzt bereits einen laufenden oder noch unbestätigten Start.',409);
    const active=this.db.prepare("SELECT count(*) AS n FROM kv WHERE key LIKE ? AND json_extract(value,'$.state') IN ('preparing','spawning','starting','ready','stale','stopping','unknown')").get(PREFIX+'%').n;
    if(active>=4)fail('OBSERVER_PROCESS_LIMIT','Vier Observer-Starts sind bereits aktiv oder ungeklärt. Vor einem weiteren Start einen eigenen Prozess beenden.',429);
    if(this.control.observation.status(id).fresh)fail('OBSERVER_ALREADY_CONNECTED','Eine frische Observer-Instanz ist bereits verbunden. Diese zuerst an ihrem tatsächlichen Startort beenden.',409);
  }
  async #recover(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const info=await lstat(this.directory);if(!info.isDirectory()||info.isSymbolicLink())fail('OBSERVER_DIRECTORY_UNSAFE','Das Startverzeichnis ist nicht sicher.',503);
    const oldReviews=this.store.get(REVIEWS,[]);
    const rows=this.db.prepare("SELECT key FROM kv WHERE key LIKE ? LIMIT 201").all(PREFIX+'%');
    if(rows.length>200)fail('OBSERVER_PROCESS_STATE_LIMIT','Zu viele gespeicherte Prozesszustände. Bestand vor weiteren Starts prüfen.',503);
    for(const {key} of rows){
      const id=key.slice(PREFIX.length);if(!UUID.test(id))continue;
      const r=this.#record(id);if(!r)continue;
      if(ACTIVE.has(r.state)){r.state='unknown';r.reason='CORE_RESTART_OWNERSHIP_UNKNOWN';r.recoveredAt=stamp();this.#save(r);this.#revoke(r);this.store.event('observer.process_recovered_unknown',{launchId:r.launchId,processKilled:false},'system',id);}
      if(UUID.test(r.launchId||''))await this.#cleanup(r,true);
    }
    if(Array.isArray(oldReviews))for(const r of oldReviews.slice(0,16))if(UUID.test(r?.id||'')&&r.secretRef==='observer-process-review:'+r.id&&!this.#forgetSecret(r.secretRef,true))fail('OBSERVER_SECRET_CLEANUP_PENDING','Ein früherer Startzugang konnte nicht aus dem Zugangsspeicher entfernt werden.',503);
    this.store.set(REVIEWS,[]);
  }
  async prepare(botId,input,actor){
    await this.ready;const bot=this.#profile(botId,actor);this.#expire();this.#eligible(botId);this.#artifact();
    exactKeys(input,['ctid','password','broker','accountId','symbol','period']);
    const ctid=safeText(input.ctid,254,'cTrader-ID'),broker=safeText(input.broker,100,'Broker'),symbol=safeText(input.symbol,100,'Symbol');
    if(typeof input.password!=='string'||input.password.length<1||input.password.length>1000||/[\u0000\r\n]/.test(input.password))fail('OBSERVER_INPUT_INVALID','Das cTrader-Passwort ist nicht gültig.');
    if(typeof input.accountId!=='string'||!/^[1-9][0-9]{0,18}$/.test(input.accountId))fail('OBSERVER_INPUT_INVALID','Die genaue numerische Demo-Kontonummer ist erforderlich.');
    if(!PERIODS.has(input.period))fail('OBSERVER_INPUT_INVALID','Das Chart-Zeitintervall ist nicht freigegeben.');
    for(const old of this.reviews.values())if(old.botId===botId&&!old.flight&&!this.#discard(old))fail('OBSERVER_SECRET_CLEANUP_PENDING','Der bisherige Startentwurf konnte noch nicht vollständig bereinigt werden.',409);
    if(this.reviews.size>=16||this.flights.size>=16)fail('OBSERVER_REVIEW_LIMIT','Zu viele offene Startprüfungen. Vorhandene Prüfung beenden.',429);
    const generation=(this.generations.get(botId)||0)+1;this.generations.set(botId,generation);
    const id=randomUUID(),secretRef='observer-process-review:'+id,createdAt=this.now(),createdMonotonic=this.monotonic();
    const baseline={lifecycleRevision:bot.lifecycle_revision,tokens:this.#tokens(botId)},path=this.cliPath();
    const current=()=>{const b=this.#profile(botId,actor);if(this.generations.get(botId)!==generation||b.lifecycle_revision!==baseline.lifecycleRevision||digest(this.#tokens(botId))!==digest(baseline.tokens)||this.cliPath()!==path)fail('OBSERVER_REVIEW_CHANGED','Profil, Zugang oder CLI wurde während der Prüfung geändert. Start neu prüfen.',409);this.#eligible(botId);};
    const flight=(async()=>{
      try{
        const cli=await this.adapter.inspect(path);current();
        await this.vault.set(secretRef,JSON.stringify({ctid,password:input.password}));current();
        const review={mode:'observer',writesAllowed:false,broker,accountId:input.accountId,environment:'demo',accountType:'hedged',symbol,period:input.period,
          cli:{path:cli.path,version:cli.version,identity:cli.identity},artifact:{filename:MANAGED_OBSERVER.filename,sha256:MANAGED_OBSERVER.sha256,bytes:MANAGED_OBSERVER.bytes},
          effects:{replacesObserverToken:true,startsTrading:false,changesPositions:false,passwordInArguments:false,waitsForMatchingObservation:true},
          source:'local_process_and_paired_observer',brokerIndependentlyVerified:false,nativeExecutionVerified:false};
        const r={id,botId,secretRef,createdAt,createdMonotonic,expiresAt:createdAt+this.reviewTtlMs,generation,baseline,path,cli,review,digest:digest({id,botId,baseline,review}),flight:null};
        this.reviews.set(id,r);this.#persistReviews();
        return {reviewId:id,digest:r.digest,expiresAt:new Date(r.expiresAt).toISOString(),review};
      }catch(error){this.vault.delete(secretRef);throw error;}
    })();this.flights.add(flight);try{return await flight;}finally{this.flights.delete(flight);}
  }
  #authorize(review,actor,tokenId=null){
    const bot=this.#profile(review.botId,actor);
    if(this.now()<review.createdAt||this.now()>review.expiresAt||this.monotonic()-review.createdMonotonic>this.reviewTtlMs)fail('OBSERVER_REVIEW_EXPIRED','Die Startprüfung ist abgelaufen. Neu prüfen.',409);
    if(this.generations.get(review.botId)!==review.generation||bot.lifecycle_revision!==review.baseline.lifecycleRevision||this.cliPath()!==review.path)fail('OBSERVER_REVIEW_CHANGED','Profil oder CLI wurde verändert. Start neu prüfen.',409);
    const tokens=this.#tokens(review.botId);
    if(tokenId?tokens.length!==1||tokens[0]!==tokenId:digest(tokens)!==digest(review.baseline.tokens))fail('OBSERVER_REVIEW_CHANGED','Der Observer-Zugang wurde inzwischen verändert. Start neu prüfen.',409);
    this.#artifact();
  }
  async confirm(botId,input,actor){
    await this.ready;this.#profile(botId,actor);exactKeys(input,['reviewId','digest']);
    const r=this.reviews.get(input.reviewId);
    if(r?.cleanupOnly){const record=this.#record(botId);if(record?.reviewId===input.reviewId&&record?.reviewDigest===input.digest)return this.status(botId,actor);fail('OBSERVER_SECRET_CLEANUP_PENDING','Die Startprüfung wartet ausschließlich auf die Bereinigung ihrer Zugangsdaten.',409);}
    if(!r||r.botId!==botId||r.digest!==input.digest){
      const record=this.#record(botId);
      if(record?.reviewId===input.reviewId&&record?.reviewDigest===input.digest)return this.status(botId,actor);
      fail('OBSERVER_REVIEW_REQUIRED','Die zu diesem Profil gehörende Startprüfung muss bestätigt werden.',409);
    }
    if(r.flight)return r.flight;
    this.#authorize(r,actor);this.#eligible(botId);
    r.flight=this.#launch(r,actor);this.flights.add(r.flight);
    try{return await r.flight;}finally{this.flights.delete(r.flight);this.#discard(r);}
  }
  async cancel(botId,input,actor){
    await this.ready;this.#profile(botId,actor,{active:false});exactKeys(input,['reviewId','digest']);const r=this.reviews.get(input.reviewId);
    if(!r)return {cancelled:true};
    if(r.botId!==botId||r.digest!==input.digest)fail('OBSERVER_REVIEW_REQUIRED','Diese Startprüfung gehört nicht zu diesem Profil.',409);
    if(r.flight)fail('OBSERVER_START_IN_PROGRESS','Der bestätigte Start läuft bereits. Prozessstatus prüfen und gegebenenfalls stoppen.',409);
    if(!this.#discard(r))fail('OBSERVER_SECRET_CLEANUP_PENDING','Die Zugangsdaten konnten noch nicht vollständig entfernt werden. Der Entwurf kann nicht mehr gestartet werden.',503);
    return {cancelled:true};
  }
  async #privateWrite(path,value){const file=await open(path,'wx',0o600);try{await file.writeFile(value);await file.sync();}finally{await file.close();}}
  async #launch(review,actor){
    let record,handle;
    try{
      const cli=await this.adapter.inspect(review.path);this.#authorize(review,actor);this.#eligible(review.botId);
      if(cli.identity!==review.cli.identity||cli.path!==review.cli.path||cli.version!==review.cli.version)fail('CTRADER_CLI_CHANGED','Die geprüfte CLI wurde verändert. Start neu prüfen.',409);
      const raw=await this.vault.get(review.secretRef);this.#authorize(review,actor);
      if(!raw)fail('OBSERVER_CREDENTIALS_MISSING','Die kurzlebigen Zugangsdaten sind nicht mehr vorhanden. Start neu prüfen.',409);
      const credentials=JSON.parse(raw),launchId=randomUUID(),bot=this.control.rawBot(review.botId),token=this.control.issueToken({kind:'bridge',botId:review.botId,name:'Managed Observer'},actor);
      record={schema:1,botId:review.botId,launchId,reviewId:review.id,reviewDigest:review.digest,state:'preparing',reason:'START_PREPARING',createdAt:stamp(),startedAt:null,exitedAt:null,tokenId:token.id,previousRuntimeId:bot.runtime_id,
        request:{broker:review.review.broker,accountId:review.review.accountId,symbol:review.review.symbol,period:review.review.period},artifact:review.review.artifact,cli:review.review.cli,secretRef:review.secretRef,runtimeId:null,lastObservationAt:null,credentialCleanupPending:false,readinessConfirmed:false};
      this.#save(record);this.store.event('observer.process_start_confirmed',{launchId,accountId:record.request.accountId,broker:record.request.broker,artifactSha256:MANAGED_OBSERVER.sha256,writesAllowed:false},actor.id,record.botId);
      const job=join(this.directory,launchId);await this.adapter.secureDirectory(job);this.#authorize(review,actor,token.id);
      const algoPath=join(job,MANAGED_OBSERVER.filename),passwordPath=join(job,'password.txt'),pairingPath=join(job,'hub-connection.json');
      await this.#privateWrite(algoPath,this.#artifact().bytes);await this.#privateWrite(passwordPath,credentials.password);
      const baseUrl=this.origin();if(typeof baseUrl!=='string'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl))fail('OBSERVER_ORIGIN_INVALID','Der lokale Core besitzt keinen bestätigten Loopback-Endpunkt.',503);
      await this.#privateWrite(pairingPath,JSON.stringify({baseUrl,botId:record.botId,token:token.token}));
      if(sha(await readFile(algoPath))!==MANAGED_OBSERVER.sha256)fail('OBSERVER_ARTIFACT_UNVERIFIED','Die vorbereitete Botdatei wurde verändert.',409);
      this.#authorize(review,actor,token.id);record.state='spawning';record.reason='PROCESS_STARTING';record.startedAt=new Date(this.now()).toISOString();this.#save(record);
      handle=await this.adapter.start({cli,algoPath,passwordPath,pairingPath,cwd:job,ctid:credentials.ctid,...record.request,authorize:()=>this.#authorize(review,actor,token.id)});
      const owned={record,handle,startedMonotonic:this.monotonic(),closing:null,settled:null};this.owned.set(record.botId,owned);
      owned.settled=handle.exited.then(result=>this.#exited(owned,result)).catch(()=>this.#exited(owned,{unknown:true}));
      this.settlements.add(owned.settled);owned.settled.finally(()=>this.settlements.delete(owned.settled));
      await handle.ready;
      if(this.owned.get(record.botId)!==owned)return this.status(record.botId,actor);
      record.state='starting';record.reason='AWAITING_MATCHING_OBSERVATION';record.terminationScope=handle.terminationScope;this.#save(record);
      await this.#refresh(owned);
      return this.status(record.botId,actor);
    }catch(error){
      if(record){
        if(handle){handle.stop();await within(this.owned.get(record.botId)?.settled||handle.exited,this.stopTimeoutMs);}
        if(this.owned.has(record.botId)){record.state='unknown';record.reason='PROCESS_EXIT_UNCONFIRMED';this.#save(record);}
        else if(record.state!=='exited'){record.state='failed';record.reason=typeof error?.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(error.code)?error.code:'PROCESS_START_FAILED';record.exitedAt=stamp();this.#save(record);}
        this.#revoke(record);await this.#cleanup(record,!this.owned.has(record.botId));
      }
      throw error;
    }
  }
  #revoke(record){if(!this.sealed&&record.tokenId&&this.db.prepare('SELECT 1 FROM tokens WHERE id=? AND revoked_at IS NULL').get(record.tokenId))this.control.revokeToken(record.tokenId,HUMAN);}
  async #cleanup(record,all=false){
    let pending=false,changed=false;
    if(!this.sealed&&record.secretRef?.startsWith('observer-process-review:')){
      const vaultPending=!this.#forgetSecret(record.secretRef,record.vaultCleanupPending===true);
      changed=record.vaultCleanupPending!==vaultPending;record.vaultCleanupPending=vaultPending;pending=vaultPending;
    }
    if(!UUID.test(record.launchId||''))return;
    const dir=join(this.directory,record.launchId);
    try{
      if(all)await rm(dir,{recursive:true,force:true});
      else {await rm(join(dir,'password.txt'),{force:true});await rm(join(dir,'hub-connection.json'),{force:true});}
    }catch{pending=true;}
    if(changed||record.credentialCleanupPending!==pending){record.credentialCleanupPending=pending;this.#save(record);}
  }
  async #exited(owned,result){
    if(this.sealed||this.owned.get(owned.record.botId)!==owned)return;
    const r=owned.record;this.owned.delete(r.botId);
    const wasStopping=r.state==='stopping';
    r.state=result?.unknown?'unknown':'exited';r.reason=result?.unknown?'PROCESS_EXIT_UNCONFIRMED':r.reason==='STOP_REQUESTED'?'STOP_CONFIRMED':r.reason==='CORE_CLOSING'?'CORE_CLOSED':wasStopping?r.reason:r.readinessConfirmed?'PROCESS_EXITED':'PROCESS_EXITED_BEFORE_OBSERVATION';r.exitedAt=stamp();r.exit={code:result?.code??null,ownerExitCode:result?.ownerExitCode??null,signal:result?.signal??result?.ownerSignal??null};r.terminationScope=result?.terminationScope||owned.handle.terminationScope;
    this.#save(r);this.#revoke(r);await this.#cleanup(r,true);if(!this.sealed)this.store.event('observer.process_exited',{launchId:r.launchId,reason:r.reason,terminationScope:r.terminationScope,brokerPositionsChanged:false},'system',r.botId);
  }
  async #refresh(owned){
    const r=owned.record;if(this.closed||!this.owned.has(r.botId)||r.state==='stopping'||r.state==='unknown')return;
    const bot=this.control.rawBot(r.botId);
    if(bot.archived_at!==null||this.#tokens(r.botId).length!==1||this.#tokens(r.botId)[0]!==r.tokenId){await this.#stopOwned(owned,'ACCESS_OR_PROFILE_CHANGED');return;}
    const view=this.control.observation.view(r.botId,HUMAN),latest=this.store.get('observer:v1:state:'+r.botId)?.latest,obs=view.observation;
    const newReport=latest?.tokenId===r.tokenId&&latest.receivedAt>=Date.parse(r.startedAt)&&obs&&obs.runtimeId!==r.previousRuntimeId;
    if(newReport&&(obs.account.id!==r.request.accountId||obs.account.broker!==r.request.broker||obs.account.environment!=='demo'||obs.account.type!=='hedged'||obs.build.engine!==MANAGED_OBSERVER.engine||obs.build.version!==MANAGED_OBSERVER.version||obs.build.sourceHash!==MANAGED_OBSERVER.sourceHash)){
      await this.#stopOwned(owned,'OBSERVATION_BINDING_MISMATCH');return;
    }
    const matching=newReport&&view.fresh;
    if(matching){
      const changed=r.state!=='ready'||r.runtimeId!==obs.runtimeId;
      r.state='ready';r.reason='MATCHING_OBSERVATION';r.runtimeId=obs.runtimeId;r.lastObservationAt=obs.observedAt;r.readinessConfirmed=true;r.observationPartial=view.status==='partial';this.#save(r);
      if(changed)this.store.event('observer.process_ready',{launchId:r.launchId,runtimeId:r.runtimeId,accountId:r.request.accountId,source:'paired_observer',brokerIndependentlyVerified:false},'system',r.botId);
      await this.#cleanup(r,false);
    }else if(!r.readinessConfirmed&&this.monotonic()-owned.startedMonotonic>this.startupTimeoutMs){await this.#stopOwned(owned,'OBSERVATION_START_TIMEOUT');}
    else if(r.readinessConfirmed&&r.state!=='stale'){r.state='stale';r.reason=view.reason||'OBSERVATION_NOT_FRESH';this.#save(r);}
    if(r.credentialCleanupPending)await this.#cleanup(r,false);
  }
  async #tick(){
    if(this.closed||this.ticking)return;this.ticking=true;
    try{await this.ready;if(this.closed)return;this.#expire();for(const owned of this.owned.values())await this.#refresh(owned);}finally{this.ticking=false;}
  }
  async status(botId,actor){
    await this.ready;const bot=this.#profile(botId,actor,{active:false});const owned=this.owned.get(botId);if(owned)await this.#refresh(owned);
    const record=this.#record(botId),observation=this.control.observation.status(botId);let artifactAvailable=true;try{this.#artifact();}catch{artifactAvailable=false;}
    const state=record?.state||'idle',cliConfigured=typeof this.cliPath()==='string'&&!!this.cliPath();
    return {schemaVersion:1,botId,mode:'observer',writesAllowed:false,state,launchId:record?.launchId??null,reason:record?.reason??'NOT_STARTED',
      canStart:bot.archived_at===null&&!this.owned.has(botId)&&(!record||TERMINAL.has(state))&&!observation.fresh&&artifactAvailable&&cliConfigured,
      canStop:!!owned&&state!=='stopping',artifactAvailable,cliConfigured,
      readiness:{confirmed:state==='ready'&&observation.fresh,source:'paired_observer',brokerIndependentlyVerified:false,partial:record?.observationPartial??null,runtimeId:record?.runtimeId??null,lastObservationAt:record?.lastObservationAt??null},
      request:record?.request??null,artifact:record?.artifact??null,createdAt:record?.createdAt??null,startedAt:record?.startedAt??null,exitedAt:record?.exitedAt??null,
      exit:record?.exit??null,terminationScope:record?.terminationScope??null,credentialCleanupPending:record?.credentialCleanupPending===true||[...this.reviews.values()].some(r=>r.botId===botId&&r.cleanupOnly),
      positionManagement:false,nativeExecutionVerified:false,backtestSupported:false};
  }
  async #stopOwned(owned,reason){
    if(owned.closing)return owned.closing;
    owned.record.state='stopping';owned.record.reason=reason;this.#save(owned.record);owned.handle.stop();
    owned.closing=within(owned.settled,this.stopTimeoutMs,{timeout:true}).then(async result=>{
      if(result?.timeout&&this.owned.get(owned.record.botId)===owned){owned.record.state='unknown';owned.record.reason='PROCESS_EXIT_UNCONFIRMED';this.#save(owned.record);this.#revoke(owned.record);await this.#cleanup(owned.record,false);}
    });return owned.closing;
  }
  async stop(botId,input,actor){
    await this.ready;this.#profile(botId,actor,{active:false});exactKeys(input,['launchId']);const record=this.#record(botId);
    if(!record||record.launchId!==input.launchId)fail('OBSERVER_LAUNCH_CHANGED','Der Stop gehört nicht zum angezeigten Start.',409);
    const owned=this.owned.get(botId);
    if(!owned){if(TERMINAL.has(record.state))return this.status(botId,actor);fail('OBSERVER_PROCESS_OWNERSHIP_UNKNOWN','Dieser Core besitzt keinen bestätigten Prozess-Handle. Eine gespeicherte PID wird nicht beendet.',409);}
    await this.#stopOwned(owned,'STOP_REQUESTED');return this.status(botId,actor);
  }
  close(){
    if(this.closePromise)return this.closePromise;this.closed=true;clearInterval(this.timer);
    this.closePromise=(async()=>{
      await this.ready.catch(()=>{});
      for(const id of this.generations.keys())this.generations.set(id,this.generations.get(id)+1);
      await Promise.allSettled([...this.owned.values()].map(owned=>this.#stopOwned(owned,'CORE_CLOSING')));
      await Promise.allSettled([...this.flights]);
      // A timed-out process keeps the persisted Unknown fence. Do not wait
      // forever and do not let a late exit callback write into the next Core.
      const pending=[...this.settlements];if(pending.length)await within(Promise.allSettled(pending),100);
      for(const r of [...this.reviews.values()])this.#discard(r);
      this.owned.clear();this.sealed=true;
    })();return this.closePromise;
  }
}
