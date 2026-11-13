import {buildEntryBlocker,assertBuildHeartbeat} from './journal-build-lineage.mjs';
import {accountEntryConflicts,unambiguousAccountGrant} from './account-entry-guard.mjs';
import { ObservationService, OBSERVER_ID } from './observation.mjs';
import { EngineJournal } from './engine-journal.mjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fail, object, text } from './errors.mjs';
import { createCapabilityProfile, normalizeImportEvidence, supportsConfiguration } from './capabilities.mjs';
import { STANDARD_MANIFEST, BOT_PROFILES, validateManifest, validateValues, defaults, digest, canonical } from './schema.mjs';
import { MAX_RESTORE_FILE_BYTES, MAX_RESTORE_BOTS, MAX_RESTORE_RECEIPTS, backupByteLength, parseRestoreBackup, readRestoreSnapshot, restorePreview, restoreRequestId } from './restore.mjs';

const tokenHash = value => createHash('sha256').update(value).digest('hex');
const iso = value => value == null ? null : new Date(value).toISOString();
const pageLimit = value => {if(!Number.isSafeInteger(value)||value<1||value>50)fail('PAGE_LIMIT_INVALID','Die Seitengrösse muss zwischen 1 und 50 liegen.');return value;};
export const HEARTBEAT_TTL = 15000;
export const COMMAND_TTL = 30000;
export const HUMAN = Object.freeze({id:'local-user',kind:'human',canPropose:true});

export class Control {
  constructor(store,{now=()=>Date.now()}={}) {
    this.store=store;this.db=store.db;this.now=now;this.observation=new ObservationService(this);this.engineJournal=new EngineJournal(this);
    // A restart is an execution fence, not an implicit replay permission.
    this.db.prepare("UPDATE proposals SET status='timed_out',reason='CORE_RESTART' WHERE status='pending'").run();
    this.db.prepare("UPDATE bots SET last_seen=NULL,runtime_status='disconnected'").run();
    this.store.set('policy',{blocked:true,changedAt:iso(this.now())});
    this.store.event('core.started',{executionBlocked:true});
  }
  requireHuman(actor){if(actor?.kind!=='human')fail('HUMAN_CONFIRMATION_REQUIRED','Diese Aktion benötigt die Bestätigung in der lokalen Oberfläche.',403);}
  requireAccess(actor){
    if(!actor||!['human','assistant','agent'].includes(actor.kind))fail('ACCESS_REQUIRED','Ein freigegebener Zugang wird benötigt.',403);
    if(actor.kind==='agent'&&!this.db.prepare("SELECT id FROM tokens WHERE id=? AND kind='agent' AND revoked_at IS NULL").get(actor.id))fail('ACCESS_REVOKED','Dieser Zugang wurde widerrufen.',403);
  }
  requireProposal(actor){
    if(!actor?.canPropose)fail('READ_ONLY','Dieser Zugang darf nur lesen.',403);
    this.requireAccess(actor);
    if(actor.kind==='agent'){
      const t=this.db.prepare("SELECT can_propose FROM tokens WHERE id=? AND kind='agent' AND revoked_at IS NULL").get(actor.id);
      if(!t?.can_propose)fail('ACCESS_REVOKED','Dieser Zugang wurde widerrufen oder eingeschränkt.',403);
    }
  }
  rawBot(id){const row=this.db.prepare('SELECT * FROM bots WHERE id=?').get(id);if(!row)fail('BOT_NOT_FOUND','Bot wurde nicht gefunden.',404);return row;}
  #requireActive(bot){if(bot.archived_at!=null)fail('BOT_ARCHIVED','Dieses Botprofil ist archiviert. Vor einer erneuten Steuerung muss es reaktiviert und neu verbunden werden.',409);}
  #lifecycleRevision(bot,expected){
    if(!Number.isSafeInteger(expected)||expected<0)fail('LIFECYCLE_REVISION_REQUIRED','Die gelesene Profilversion fehlt.');
    if(bot.lifecycle_revision!==expected)fail('LIFECYCLE_REVISION_CONFLICT','Das Botprofil wurde inzwischen verändert. Aktuellen Stand laden.',409);
  }
  proposal(id){const p=this.db.prepare('SELECT * FROM proposals WHERE id=?').get(id);if(!p)fail('PROPOSAL_NOT_FOUND','Änderung wurde nicht gefunden.',404);return this.proposalShape(p);}
  proposalShape(p){return {id:p.id,botId:p.bot_id,revision:p.revision,values:JSON.parse(p.values_json),digest:p.digest,status:p.status,actorId:p.actor_id,baseRevision:p.base_revision,runtimeId:p.runtime_id,scope:'new-trades',createdAt:iso(p.created_at),confirmedAt:iso(p.confirmed_at),expiresAt:iso(p.expires_at),deliveredAt:iso(p.delivered_at),completedAt:iso(p.completed_at),reason:p.reason,historySource:this.store.get('proposalHistorySource:'+p.id)};}
  expire(){
    const expired=this.db.prepare("SELECT id,bot_id FROM proposals WHERE status='pending' AND expires_at<=?").all(this.now());
    for(const p of expired){this.db.prepare("UPDATE proposals SET status='timed_out',reason='ACK_TIMEOUT' WHERE id=? AND status='pending'").run(p.id);this.store.event('configuration.unconfirmed',{proposalId:p.id,reason:'ACK_TIMEOUT'},'system',p.bot_id);}
  }
  bot(id){this.expire();return this.#botSnapshot(this.rawBot(id));}
  #botSnapshot(b){
    const manifest=JSON.parse(b.manifest),archived=b.archived_at!=null;
    const fresh=!archived&&b.last_seen!=null&&this.now()>=b.last_seen&&this.now()-b.last_seen<=HEARTBEAT_TTL;
    const status=archived?'archived':['conflict','fault'].includes(b.runtime_status)?b.runtime_status:fresh?'connected':b.last_seen==null?'disconnected':'stale';
    const unresolved=this.db.prepare("SELECT id FROM proposals WHERE bot_id=? AND runtime_id=? AND status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE' ORDER BY revision LIMIT 1").get(b.id,b.runtime_id);
    const policy=this.store.get('policy'),releaseApproved=!policy.blocked&&status==='connected'&&this.runtimeGranted(b.id,b.runtime_id,b.account_id,b.environment,policy);
    const transitionBlocker=buildEntryBlocker(this.store,b.id);
    const controlBlocker=transitionBlocker?{code:transitionBlocker}:archived?{code:'BOT_ARCHIVED'}:b.adapter!=='bridge'?{code:'BRIDGE_UNSUPPORTED'}:
      status==='fault'?{code:'RUNTIME_FAULT'}:status==='conflict'?{code:'RUNTIME_CONFIGURATION_DIVERGED'}:
      status!=='connected'?{code:'BOT_NOT_CONNECTED'}:b.environment!=='demo'?{code:'DEMO_CONTROL_ONLY'}:
      unresolved?{code:'PREVIOUS_COMMAND_UNCONFIRMED',proposalId:unresolved.id}:
      policy.blocked?{code:'CONTROL_BLOCKED'}:!unambiguousAccountGrant(policy.grants,b.account_id,b.environment)?{code:'ACCOUNT_ENTRY_CONFLICT'}:!releaseApproved?{code:'RUNTIME_RELEASE_REQUIRED'}:null;
    const bot={id:b.id,name:b.name,adapter:b.adapter,manifest,revision:b.revision,lifecycleRevision:b.lifecycle_revision,archivedAt:iso(b.archived_at),desired:JSON.parse(b.desired),actual:b.actual?JSON.parse(b.actual):null,actualRevision:b.actual_revision,status,runtimeId:b.runtime_id,accountId:b.account_id,environment:b.environment,lastSeen:iso(b.last_seen),runtimeBlocked:!!b.runtime_blocked,releaseApproved,controlBlocker,faultCode:this.store.get('fault:'+b.id),capabilities:{liveConfiguration:fresh&&b.runtime_status==='connected'&&b.adapter==='bridge'&&manifest.capabilities.liveConfiguration,telemetry:fresh&&manifest.capabilities.telemetry,metadata:b.adapter==='ctrader-cli'},proposals:this.db.prepare('SELECT * FROM proposals WHERE bot_id=? ORDER BY created_at DESC,revision DESC LIMIT 40').all(b.id).map(p=>this.proposalShape(p))};
    const pending=this.db.prepare("SELECT id FROM proposals WHERE bot_id=? AND status='pending' LIMIT 1").get(b.id);
    bot.observation=this.observation.status(b);
    bot.capabilityProfile=createCapabilityProfile(bot,{fresh,pendingProposalId:pending?.id||null,importEvidence:b.adapter==='ctrader-cli'?this.store.get('botImportEvidence:'+b.id):null});
    return bot;
  }
  bots(){this.expire();return this.db.prepare('SELECT * FROM bots WHERE archived_at IS NULL ORDER BY created_at,id').all().map(b=>this.#botSnapshot(b));}
  profileCounts(){const total=this.db.prepare('SELECT count(*) AS total, count(archived_at) AS archived FROM bots').get();return {active:total.total-total.archived,archived:total.archived,total:total.total};}
  listArchivedBots({limit=20,cursor=null}={},actor=HUMAN){
    this.requireAccess(actor);pageLimit(limit);let after=null;
    if(cursor!==null){
      if(typeof cursor!=='string'||cursor.length>400||!/^[A-Za-z0-9_-]+$/.test(cursor))fail('ARCHIVE_CURSOR_INVALID','Die Archivseite ist ungültig. Das Archiv erneut öffnen.');
      try{after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{fail('ARCHIVE_CURSOR_INVALID','Die Archivseite ist ungültig. Das Archiv erneut öffnen.');}
      if(!object(after)||Object.keys(after).length!==2||!Number.isSafeInteger(after.archivedAt)||after.archivedAt<0||after.archivedAt>8640000000000000||typeof after.id!=='string'||!/^[a-f0-9-]{36}$/.test(after.id)||Buffer.from(JSON.stringify(after)).toString('base64url')!==cursor)fail('ARCHIVE_CURSOR_INVALID','Die Archivseite ist ungültig. Das Archiv erneut öffnen.');
    }
    const rows=after?this.db.prepare('SELECT * FROM bots WHERE archived_at<? OR (archived_at=? AND id>?) ORDER BY archived_at DESC,id LIMIT ?').all(after.archivedAt,after.archivedAt,after.id,limit+1):this.db.prepare('SELECT * FROM bots WHERE archived_at IS NOT NULL ORDER BY archived_at DESC,id LIMIT ?').all(limit+1);
    const page=rows.slice(0,limit),last=page.at(-1);
    return {bots:page.map(b=>this.#botSnapshot(b)),nextCursor:rows.length>limit?Buffer.from(JSON.stringify({archivedAt:last.archived_at,id:last.id})).toString('base64url'):null,totalArchived:this.profileCounts().archived};
  }
  renameBot(botId,input,actor=HUMAN){
    this.requireHuman(actor);const name=text(input.name,100,'Botname');
    return this.store.transaction(()=>{
      const bot=this.rawBot(botId);this.#lifecycleRevision(bot,input.expectedLifecycleRevision);
      if(bot.name===name)return {bot:this.#botSnapshot(bot),changed:false};
      this.db.prepare('UPDATE bots SET name=?,lifecycle_revision=lifecycle_revision+1 WHERE id=?').run(name,botId);
      this.store.event('bot.renamed',{previousName:bot.name,name,lifecycleRevision:bot.lifecycle_revision+1},actor.id,botId);
      return {bot:this.#botSnapshot(this.rawBot(botId)),changed:true};
    });
  }
  archivePreview(botId,actor=HUMAN){
    this.requireHuman(actor);const bot=this.rawBot(botId),policy=this.store.get('policy');
    const tokens=this.db.prepare("SELECT id FROM tokens WHERE bot_id=? AND kind='bridge' AND revoked_at IS NULL ORDER BY id").all(botId);
    const commands=this.db.prepare("SELECT id,revision,status,digest,runtime_id,delivered_at,reason FROM proposals WHERE bot_id=? AND (status IN ('proposed','pending') OR (status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE')) ORDER BY id").all(botId);
    const grants=(Array.isArray(policy.grants)?policy.grants:[]).filter(grant=>grant.botId===botId);
    const state={botId,name:bot.name,adapter:bot.adapter,lifecycleRevision:bot.lifecycle_revision,archivedAt:bot.archived_at,revision:bot.revision,actualRevision:bot.actual_revision,actualDigest:digest(bot.actual?JSON.parse(bot.actual):null),runtimeId:bot.runtime_id,accountId:bot.account_id,environment:bot.environment,runtimeStatus:bot.runtime_status,tokens,commands,grants};
    return {botId,name:bot.name,lifecycleRevision:bot.lifecycle_revision,archivedAt:iso(bot.archived_at),reviewDigest:digest(state),effects:{bridgeTokens:tokens.length,grants:grants.length,pendingCommands:commands.filter(p=>p.status==='pending').length,unconfirmedCommands:commands.filter(p=>p.status==='timed_out').length,draftProposals:commands.filter(p=>p.status==='proposed').length,strategyStopped:false,historyPreserved:true}};
  }
  archiveBot(botId,input,actor=HUMAN){
    this.requireHuman(actor);
    if(typeof input.reviewDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewDigest))fail('ARCHIVE_REVIEW_REQUIRED','Vor dem Archivieren müssen die Auswirkungen geprüft und bestätigt werden.',409);
    return this.store.transaction(()=>{
      const bot=this.rawBot(botId);this.#lifecycleRevision(bot,input.expectedLifecycleRevision);
      if(bot.archived_at!=null)return {bot:this.#botSnapshot(bot),changed:false,strategyStopped:false};
      const preview=this.archivePreview(botId,actor);
      if(preview.reviewDigest!==input.reviewDigest)fail('ARCHIVE_REVIEW_CHANGED','Profil, Verbindung oder ausstehende Änderungen haben sich verändert. Archivvorschau erneut prüfen.',409);
      const time=this.now();
      this.db.prepare("UPDATE tokens SET revoked_at=? WHERE bot_id=? AND kind='bridge' AND revoked_at IS NULL").run(time,botId);
      this.revokeRuntimeGrant(botId);
      // Both pending and already uncertain delivered commands get a permanent
      // fence. Neither a new token nor a reused runtimeId may later ACK them.
      this.db.prepare("UPDATE proposals SET status='timed_out',reason='BOT_ARCHIVED' WHERE bot_id=? AND (status='pending' OR (status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'FULL_RESTORE'))").run(botId);
      this.db.prepare("UPDATE proposals SET status='cancelled',reason='BOT_ARCHIVED' WHERE bot_id=? AND status='proposed'").run(botId);
      this.db.prepare("UPDATE bots SET archived_at=?,lifecycle_revision=lifecycle_revision+1,runtime_status='disconnected',runtime_blocked=1 WHERE id=?").run(time,botId);
      this.store.event('bot.archived',{...preview.effects,lifecycleRevision:bot.lifecycle_revision+1,runtimeId:bot.runtime_id},actor.id,botId);
      return {bot:this.#botSnapshot(this.rawBot(botId)),changed:true,strategyStopped:false};
    });
  }
  reactivateBot(botId,input,actor=HUMAN){
    this.requireHuman(actor);
    return this.store.transaction(()=>{
      const bot=this.rawBot(botId);this.#lifecycleRevision(bot,input.expectedLifecycleRevision);
      if(bot.archived_at==null)return {bot:this.#botSnapshot(bot),changed:false,requiresReconnect:bot.adapter==='bridge'&&bot.last_seen==null};
      if(this.profileCounts().active>=MAX_RESTORE_BOTS)fail('BOT_LIMIT','Maximal 100 aktive Botprofile sind möglich. Zuerst ein anderes Profil archivieren.',409);
      this.db.prepare("UPDATE bots SET archived_at=NULL,lifecycle_revision=lifecycle_revision+1,runtime_id=NULL,account_id=NULL,environment=NULL,last_seen=NULL,sequence=-1,runtime_status='disconnected',runtime_blocked=1 WHERE id=?").run(botId);
      this.revokeRuntimeGrant(botId);this.store.set('fault:'+botId,null);
      this.store.event('bot.reactivated',{lifecycleRevision:bot.lifecycle_revision+1,requiresReconnect:bot.adapter==='bridge',credentialsRestored:false,strategyStarted:false},actor.id,botId);
      return {bot:this.#botSnapshot(this.rawBot(botId)),changed:true,requiresReconnect:bot.adapter==='bridge'};
    });
  }
  createBot(input,actor=HUMAN){
    this.requireHuman(actor);
    const profile=input.profileId===undefined?null:BOT_PROFILES.find(p=>p.id===input.profileId);
    if(input.profileId!==undefined&&!profile)fail('BOT_PROFILE_UNKNOWN','Dieses Botprofil wird nicht unterstützt.');
    if(profile&&input.manifest)fail('BOT_PROFILE_AMBIGUOUS','Ein vordefiniertes Profil und ein eigenes Schema können nicht gleichzeitig gewählt werden.');
    const name=text(input.name,100,'Botname'),manifest=validateManifest(profile?.manifest||input.manifest||STANDARD_MANIFEST),id=randomUUID();
    const adapter=input.adapter==='ctrader-cli'?'ctrader-cli':'bridge';
    if(adapter==='ctrader-cli') {manifest.capabilities.liveConfiguration=false;manifest.capabilities.telemetry=false;for(const p of manifest.parameters)p.live=false;}
    if(adapter!=='ctrader-cli'&&input.importEvidence!=null)fail('IMPORT_EVIDENCE_INVALID','Ein Metadatennachweis gehört nur zu einem über die CLI importierten Botprofil.',409);
    const importEvidence=adapter==='ctrader-cli'?normalizeImportEvidence(input.importEvidence,manifest,this.now()):null;
    this.store.transaction(()=>{
      if(this.profileCounts().active>=MAX_RESTORE_BOTS)fail('BOT_LIMIT','Maximal 100 aktive Botprofile sind möglich. Zuerst ein anderes Profil archivieren.',409);
      this.db.prepare('INSERT INTO bots(id,name,adapter,manifest,desired,created_at) VALUES(?,?,?,?,?,?)').run(id,name,adapter,JSON.stringify(manifest),JSON.stringify(defaults(manifest)),this.now());
      if(importEvidence)this.store.set('botImportEvidence:'+id,importEvidence);
      this.store.event('bot.registered',{name,adapter,manifestId:manifest.id},actor.id,id);
    });
    const bridgeToken=adapter==='bridge'?this.issueToken({name:'Bridge '+name,kind:'bridge',botId:id},actor).token:null;
    return {bot:this.bot(id),...(bridgeToken?{bridgeToken}:{})};
  }
  issueToken(input,actor=HUMAN){
    this.requireHuman(actor);const kind=input.kind==='bridge'?'bridge':'agent';
    const name=text(input.name,100),bot=kind==='bridge'?this.rawBot(input.botId):null,botId=bot?.id??null;
    if(bot)this.#requireActive(bot);
    if(bot&&bot.adapter!=='bridge')fail('BRIDGE_UNSUPPORTED','Dieser Bot besitzt keinen Bridge-Vertrag.');
    const id=randomUUID(),token=randomBytes(32).toString('base64url');
    this.store.transaction(()=>{
      if(kind==='bridge')this.db.prepare('UPDATE tokens SET revoked_at=? WHERE bot_id=? AND kind=? AND revoked_at IS NULL').run(this.now(),botId,kind);
      this.db.prepare('INSERT INTO tokens(id,name,hash,kind,bot_id,can_propose,created_at) VALUES(?,?,?,?,?,?,?)').run(id,name,tokenHash(token),kind,botId,input.allowProposals===true?1:0,this.now());
      if(kind==='bridge'){
        this.revokeRuntimeGrant(botId);
        this.db.prepare("UPDATE bots SET last_seen=NULL,runtime_status='disconnected' WHERE id=?").run(botId);
        this.db.prepare("UPDATE proposals SET status='timed_out',reason='BRIDGE_TOKEN_ROTATED' WHERE bot_id=? AND status='pending'").run(botId);
      }
      this.store.event('access.created',{id,kind,name,allowProposals:input.allowProposals===true},actor.id,botId);
    });
    return {id,token,kind,botId};
  }
  authenticate(token,kind=null){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const t=this.db.prepare('SELECT * FROM tokens WHERE hash=? AND revoked_at IS NULL').get(tokenHash(token));
    if(!t||(kind&&t.kind!==kind)||t.kind==='bridge'&&!this.db.prepare('SELECT id FROM bots WHERE id=? AND archived_at IS NULL').get(t.bot_id))return null;return {id:t.id,kind:t.kind,botId:t.bot_id,canPropose:!!t.can_propose};
  }
  tokens(){return this.db.prepare("SELECT id,name,can_propose,created_at,revoked_at FROM tokens WHERE kind='agent' ORDER BY created_at DESC").all().map(t=>({id:t.id,name:t.name,allowProposals:!!t.can_propose,createdAt:iso(t.created_at),revokedAt:iso(t.revoked_at),activity:this.store.get('agentActivity:'+t.id)}));}
  observeAgent(actor,activity){
    this.requireAccess(actor);
    if(actor.kind!=='agent'||!['initialize','tool'].includes(activity?.kind))return;
    const previous=this.store.get('agentActivity:'+actor.id,{lastConnectedAt:null,lastToolAt:null,clientName:null,clientVersion:null});
    const bounded=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100)||null:null;
    const next=activity.kind==='initialize'
      ?{...previous,lastConnectedAt:iso(this.now()),clientName:bounded(activity.clientName),clientVersion:bounded(activity.clientVersion)}
      :{...previous,lastToolAt:iso(this.now())};
    this.store.set('agentActivity:'+actor.id,next);
  }
  revokeToken(id,actor=HUMAN){
    this.requireHuman(actor);
    return this.store.transaction(()=>{
      const token=this.db.prepare('SELECT id,kind,bot_id FROM tokens WHERE id=? AND revoked_at IS NULL').get(id);
      if(!token)fail('TOKEN_NOT_FOUND','Zugang wurde nicht gefunden.',404);
      this.db.prepare('UPDATE tokens SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(this.now(),id);
      if(token.kind==='bridge'){
        this.revokeRuntimeGrant(token.bot_id);
        this.db.prepare("UPDATE bots SET last_seen=NULL,runtime_status='disconnected' WHERE id=?").run(token.bot_id);
        this.db.prepare("UPDATE proposals SET status='timed_out',reason='BRIDGE_ACCESS_REVOKED' WHERE bot_id=? AND status='pending'").run(token.bot_id);
      }
      this.store.event('access.revoked',{id,bridgeReleaseWithdrawn:token.kind==='bridge',runtimeStopConfirmed:false},actor.id,token.bot_id??null);
      return {revoked:true};
    });
  }
  validateConfiguration(botId,values){const b=this.rawBot(botId);return validateValues(JSON.parse(b.manifest),values);}
  configurationHistory(botId,{limit=20,beforeRevision=null}={},actor=HUMAN){
    this.requireAccess(actor);pageLimit(limit);const bot=this.rawBot(botId);
    if(beforeRevision!==null&&(!Number.isSafeInteger(beforeRevision)||beforeRevision<1))fail('HISTORY_CURSOR_INVALID','Die Konfigurationsseite ist ungültig. Die Historie erneut öffnen.');
    const rows=beforeRevision===null?this.db.prepare("SELECT * FROM proposals WHERE bot_id=? AND status='applied' ORDER BY revision DESC LIMIT ?").all(botId,limit+1):this.db.prepare("SELECT * FROM proposals WHERE bot_id=? AND status='applied' AND revision<? ORDER BY revision DESC LIMIT ?").all(botId,beforeRevision,limit+1);
    const entries=rows.slice(0,limit).map(p=>({proposalId:p.id,revision:p.revision,values:JSON.parse(p.values_json),appliedAt:iso(p.completed_at)}));
    return {botId,revision:bot.revision,actualRevision:bot.actual_revision,archivedAt:iso(bot.archived_at),entries,nextBeforeRevision:rows.length>limit?entries.at(-1).revision:null,totalApplied:this.db.prepare("SELECT count(*) AS n FROM proposals WHERE bot_id=? AND status='applied'").get(botId).n};
  }
  prepareHistoricalConfiguration(botId,input,actor=HUMAN){
    this.requireProposal(actor);this.#requireActive(this.rawBot(botId));
    const sourceId=text(input.sourceProposalId,100,'Historieneintrag');
    const source=this.db.prepare("SELECT * FROM proposals WHERE id=? AND bot_id=? AND status='applied'").get(sourceId,botId);
    if(!source)fail('HISTORY_ENTRY_UNAVAILABLE','Dieser Eintrag ist keine bestätigte Konfiguration dieses Botprofils.',409);
    const historySource={proposalId:source.id,revision:source.revision};
    const result=this.#propose(botId,{values:JSON.parse(source.values_json),expectedRevision:input.expectedRevision,idempotencyKey:input.idempotencyKey},actor,historySource);
    return {...result,historySource,applied:false,requiresHumanConfirmation:true};
  }
  propose(botId,input,actor=HUMAN){return this.#propose(botId,input,actor);}
  #propose(botId,input,actor,historySource=null){
    this.requireProposal(actor);
    const b=this.rawBot(botId),manifest=JSON.parse(b.manifest);
    this.#requireActive(b);
    const buildBlocker=buildEntryBlocker(this.store,botId);if(buildBlocker)fail(buildBlocker,'Vor weiteren Parameteraufträgen die native Writerübergabe bestätigen.',409);
    if(!supportsConfiguration({adapter:b.adapter,manifest}))fail('CONFIGURATION_NOT_SUPPORTED','Dieses Botprofil unterstützt keine gesteuerten Konfigurationsänderungen. Seine Einstellungen können gelesen und geprüft werden.',409);
    this.expire();const values=validateValues(manifest,input.values);
    if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail('REVISION_REQUIRED','Die gelesene Konfigurationsversion fehlt.');
    const key=text(input.idempotencyKey,100,'Anfragekennung');
    const requestDigest=digest({values,expectedRevision:input.expectedRevision,...(historySource?{historySource}:{})});
    const existing=this.db.prepare('SELECT * FROM proposals WHERE bot_id=? AND idempotency_key=?').get(botId,key);
    if(existing){if(existing.request_digest!==requestDigest||existing.actor_id!==actor.id)fail('IDEMPOTENCY_CONFLICT','Diese Anfragekennung gehört zu einer anderen Änderung.',409);return {proposal:this.proposalShape(existing),bot:this.bot(botId)};}
    if(input.expectedRevision!==b.revision)fail('REVISION_CONFLICT','Die Einstellungen wurden inzwischen geändert. Aktuellen Stand laden.',409);
    if(this.db.prepare("SELECT id FROM proposals WHERE bot_id=? AND status='pending'").get(botId))fail('COMMAND_PENDING','Zuerst die ausstehende Botantwort abwarten.',409);
    const id=randomUUID(),revision=b.revision+1,hash=digest({botId,id,revision,values,scope:'new-trades'});
    this.store.transaction(()=>{
      this.db.prepare("UPDATE proposals SET status='cancelled',reason='SUPERSEDED' WHERE bot_id=? AND status='proposed'").run(botId);
      this.db.prepare('INSERT INTO proposals(id,bot_id,revision,values_json,digest,status,actor_id,idempotency_key,request_digest,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,botId,revision,JSON.stringify(values),hash,'proposed',actor.id,key,requestDigest,this.now());
      if(historySource)this.store.set('proposalHistorySource:'+id,historySource);
      this.db.prepare('UPDATE bots SET revision=?,desired=? WHERE id=?').run(revision,JSON.stringify(values),botId);
      this.store.event('configuration.proposed',{proposalId:id,revision,changed:manifest.parameters.filter(p=>JSON.parse(b.desired)[p.id]!==values[p.id]).map(p=>p.id),...(historySource?{historySource}:{})},actor.id,botId);
    });
    return {proposal:this.proposal(id),bot:this.bot(botId)};
  }
  confirm(id,hash,actor=HUMAN,review){
    this.requireHuman(actor);this.#requireActive(this.rawBot(this.proposal(id).botId));this.expire();const p=this.proposal(id),b=this.bot(p.botId);
    if(p.digest!==hash)fail('PREVIEW_CHANGED','Der bestätigte Änderungsvergleich stimmt nicht überein.',409);
    if(p.status==='pending'||p.status==='applied')return {proposal:p,bot:b};
    if(p.status!=='proposed'||p.revision!==b.revision)fail('PROPOSAL_STALE','Diese Änderung ist nicht mehr aktuell.',409);
    if(this.store.get('policy').blocked)fail('CONTROL_BLOCKED','Die Steuerung ist gesperrt. Sperre zuerst bewusst freigeben.',403);
    if(b.status!=='connected'||!b.capabilities.liveConfiguration)fail('BOT_NOT_CONNECTED','Ein kompatibler Bot muss seine aktuelle Laufzeit bestätigen.',409);
    if(b.environment!=='demo')fail('DEMO_CONTROL_ONLY','Laufzeitänderungen sind in dieser Ausgabe nur für bestätigte Demokonten freigegeben.',403);
    if(!review||review.runtimeId!==b.runtimeId||review.accountId!==b.accountId||review.actualRevision!==b.actualRevision)fail('PREVIEW_RUNTIME_CHANGED','Der angezeigte Laufzeitzustand ist nicht mehr aktuell. Änderungsvergleich neu laden.',409);
    if(this.db.prepare("SELECT id FROM proposals WHERE bot_id=? AND runtime_id=? AND status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE'").get(b.id,b.runtimeId))fail('PREVIOUS_COMMAND_UNCONFIRMED','Eine zuvor übertragene Änderung ist noch ungeklärt. Zuerst die Laufzeitbestätigung abgleichen.',409);
    if(!b.releaseApproved)fail('RUNTIME_RELEASE_REQUIRED','Diese Botinstanz wurde noch nicht zur Demo-Steuerung freigegeben. Aktuelle Instanzen erneut prüfen.',403);
    if(b.manifest.parameters.some(x=>!x.live&&b.actual?.[x.id]!==p.values[x.id]))fail('RESTART_REQUIRED','Diese Änderung erfordert einen kontrollierten Botneustart; Live-Übernahme wird nicht angeboten.',409);
    this.store.transaction(()=>{
      this.db.prepare("UPDATE proposals SET status='pending',base_revision=?,runtime_id=?,confirmed_at=?,expires_at=? WHERE id=? AND status='proposed'").run(b.actualRevision,b.runtimeId,this.now(),this.now()+COMMAND_TTL,id);
      this.store.event('configuration.confirmed',{proposalId:id,revision:p.revision,runtimeId:b.runtimeId},actor.id,b.id);
    });
    return {proposal:this.proposal(id),bot:this.bot(b.id)};
  }
  cancel(id,actor=HUMAN){this.requireHuman(actor);const p=this.proposal(id);if(p.status!=='proposed')fail('CANNOT_CANCEL_DISPATCHED','Eine bereits übertragene Änderung kann nicht als unverändert zurückgenommen werden.',409);this.db.prepare("UPDATE proposals SET status='cancelled',reason='USER_CANCELLED' WHERE id=?").run(id);this.store.event('configuration.cancelled',{proposalId:id},actor.id,p.botId);return {proposal:this.proposal(id)};}
  runtimeGranted(botId,runtimeId,accountId,environment,policy=this.store.get('policy')){
    return !buildEntryBlocker(this.store,botId)&&unambiguousAccountGrant(policy.grants,accountId,environment)&&environment==='demo'&&supportsConfiguration({adapter:this.rawBot(botId).adapter,manifest:JSON.parse(this.rawBot(botId).manifest)})&&!!this.db.prepare('SELECT id FROM bots WHERE id=? AND archived_at IS NULL').get(botId)&&Array.isArray(policy.grants)&&policy.grants.some(g=>g.botId===botId&&g.runtimeId===runtimeId&&g.accountId===accountId&&g.environment===environment);
  }
  revokeRuntimeGrant(botId){
    const policy=this.store.get('policy');
    if(!Array.isArray(policy.grants))return;
    const checked=accountEntryConflicts(policy.grants);
    // Never turn a previously ambiguous legacy cohort into a silently selected
    // winner merely because the other token/profile/runtime disappears.
    const unsafe=new Set(checked.conflicts.flatMap(c=>c.runtimes.map(r=>r.botId)));
    const grants=checked.valid?policy.grants.filter(g=>g.botId!==botId&&!unsafe.has(g.botId)):[];
    if(grants.length!==policy.grants.length){
      this.store.set('policy',{...policy,grants,decisionId:randomUUID()});
      if(unsafe.size||!checked.valid)this.store.event('policy.ambiguous_grants_withdrawn',{profiles:unsafe.size,requiresNewReview:true,processesStopped:false});
    }
  }
  releaseReview(){
    const policy=this.store.get('policy'),bots=this.bots().sort((a,b)=>a.id.localeCompare(b.id));
    const roster=bots.map(b=>({botId:b.id,name:b.name,adapter:b.adapter,configurationSupported:supportsConfiguration(b),status:b.status,runtimeId:b.runtimeId,accountId:b.accountId,environment:b.environment,actualRevision:b.actualRevision,configurationDigest:digest(b.actual),faultCode:b.faultCode,buildTransitionBlocker:buildEntryBlocker(this.store,b.id),unconfirmed:b.controlBlocker?.code==='PREVIOUS_COMMAND_UNCONFIRMED'?b.controlBlocker.proposalId:null}));
    const eligible=b=>!b.buildTransitionBlocker&&b.configurationSupported&&b.adapter==='bridge'&&b.status==='connected'&&b.environment==='demo'&&!b.unconfirmed;
    const runtimes=roster.filter(eligible).map(({botId,name,runtimeId,accountId,environment,actualRevision})=>({botId,name,runtimeId,accountId,environment,actualRevision}));
    const authority=accountEntryConflicts(runtimes);
    return {digest:digest({policy,roster}),runtimes,accountEntryConflicts:authority.conflicts,accountIdentityComplete:authority.valid,
      unavailable:roster.filter(b=>!eligible(b)).map(b=>({botId:b.botId,name:b.name,status:b.status,reason:b.buildTransitionBlocker??(b.adapter!=='bridge'?'BRIDGE_UNSUPPORTED':!b.configurationSupported?'CONFIGURATION_NOT_SUPPORTED':b.unconfirmed?'PREVIOUS_COMMAND_UNCONFIRMED':b.status==='fault'?'RUNTIME_FAULT':b.status==='conflict'?'RUNTIME_CONFIGURATION_DIVERGED':b.status!=='connected'?'BOT_NOT_CONNECTED':'DEMO_CONTROL_ONLY')}))};
  }
  setPolicy(blocked,actor=HUMAN,review){
    this.requireHuman(actor);if(typeof blocked!=='boolean')fail('POLICY_INVALID','Sperre muss Ja oder Nein sein.');
    let grants=[];
    if(!blocked){
      if(!object(review)||typeof review.digest!=='string')fail('POLICY_REVIEW_REQUIRED','Die erreichbaren Demo-Instanzen müssen vor der Freigabe geprüft werden.',409);
      const current=this.releaseReview();
      if(review.digest!==current.digest)fail('POLICY_REVIEW_CHANGED','Botinstanzen oder Freigabe haben sich seit der Anzeige geändert. Aktuellen Stand erneut prüfen.',409);
      if(!current.accountIdentityComplete)fail('ACCOUNT_IDENTITY_UNCONFIRMED','Die Kontoidentität der Freigabeliste ist nicht vollständig. Verbindung erneut prüfen.',409);
      if(current.accountEntryConflicts.length)fail('ACCOUNT_ENTRY_CONFLICT','Mehrere steuerbare Botprofile melden dieselbe Demo-Kontonummer. Keine gemeinsame Einstiegserlaubnis: verantwortliche Instanz klären und die übrigen Profile nur beobachtend verbinden. Archivieren oder eine veraltete Meldung belegt keinen gestoppten Handelsprozess.',409);
      grants=current.runtimes.map(({botId,runtimeId,accountId,environment})=>({botId,runtimeId,accountId,environment}));
    }
    const policy={blocked,changedAt:iso(this.now()),grants,decisionId:randomUUID()};
    this.store.transaction(()=>{
      this.store.set('policy',policy);
      if(blocked)this.db.prepare("UPDATE proposals SET status='timed_out',reason='POLICY_BLOCKED' WHERE status='pending'").run();
      this.store.event('policy.changed',{blocked,runtimeAcknowledgementRequired:true,releasedRuntimeCount:grants.length},actor.id);
    });return {policy};
  }
  assertBridge(actor,botId){
    if(actor?.kind!=='bridge'||actor.botId!==botId)fail('BRIDGE_SCOPE_DENIED','Bridge-Zugang passt nicht zu diesem Bot.',403);
    this.#requireActive(this.rawBot(botId));
    if(!this.db.prepare("SELECT id FROM tokens WHERE id=? AND bot_id=? AND kind='bridge' AND revoked_at IS NULL").get(actor.id,botId))fail('ACCESS_REVOKED','Bridge-Zugang wurde widerrufen.',403);
  }
  heartbeat(input,actor){
    this.assertBridge(actor,input.botId);this.expire();const b=this.rawBot(input.botId),m=JSON.parse(b.manifest);
    const runtimeId=text(input.runtimeId,100),accountId=text(String(input.accountId||''),100);
    if(input.manifestId!==m.id||input.manifestVersion!==m.version)fail('MANIFEST_MISMATCH','Bridge-Version stimmt nicht mit dem Botprofil überein.',409);
    if(!['demo','live'].includes(input.environment)||!Number.isSafeInteger(input.actualRevision)||input.actualRevision<0||input.actualRevision>b.revision||!Number.isSafeInteger(input.sequence)||input.sequence<0||typeof input.blocked!=='boolean')fail('HEARTBEAT_INVALID','Laufzeitmeldung ist unvollständig.');
    assertBuildHeartbeat(this,input);
    this.observation.beforeHeartbeat(input,actor,b);
    const values=validateValues(m,input.values),fresh=b.last_seen!=null&&this.now()-b.last_seen<=HEARTBEAT_TTL;
    if(b.runtime_id&&b.runtime_id!==runtimeId&&fresh)fail('RUNTIME_CONFLICT','Für dieses Botprofil ist bereits eine andere Instanz erreichbar.',409);
    const changedRuntime=b.runtime_id!==runtimeId;
    if(input.faultCode!==undefined&&input.faultCode!==null&&(typeof input.faultCode!=='string'||!/^[A-Z][A-Z_0-9]{0,63}$/.test(input.faultCode)))fail('FAULT_CODE_INVALID','Fehlercode der Bridge ist ungültig.');
    // Connection status resets on Core restart and token rotation, but a runtime
    // fault is latched for the complete runtimeId lifetime, including reconnects.
    const fault=input.faultCode||(!changedRuntime?this.store.get('fault:'+b.id):null);
    if(!changedRuntime&&(input.sequence<=b.sequence))fail('SEQUENCE_REPLAY','Veraltete oder doppelte Laufzeitmeldung.',409);
    if(!changedRuntime&&b.account_id&&(b.account_id!==accountId||b.environment!==input.environment))fail('ACCOUNT_IDENTITY_CHANGED','Kontoidentität der laufenden Instanz hat sich geändert.',409);
    if(fault){
      this.db.prepare("UPDATE proposals SET status='timed_out',reason='RUNTIME_FAULT' WHERE bot_id=? AND status='pending'").run(b.id);
      if(b.runtime_status!=='fault')this.store.event('runtime.fault',{faultCode:fault},actor.id,b.id);
    }
    const pending=this.db.prepare("SELECT * FROM proposals WHERE bot_id=? AND status='pending'").get(b.id);
    let holdActual=false;
    if(pending&&!changedRuntime){
      const matchesPrevious=input.actualRevision===b.actual_revision&&b.actual&&canonical(values)===canonical(JSON.parse(b.actual));
      const matchesPending=input.actualRevision===pending.revision&&canonical(values)===canonical(JSON.parse(pending.values_json));
      if(!matchesPrevious&&!matchesPending){
        this.db.prepare("UPDATE proposals SET status='timed_out',reason='RUNTIME_CONFIGURATION_DIVERGED' WHERE id=?").run(pending.id);
        this.db.prepare("UPDATE bots SET runtime_status='conflict' WHERE id=?").run(b.id);
        this.store.event('runtime.configuration_conflict',{proposalId:pending.id},actor.id,b.id);
        fail('RUNTIME_CONFIGURATION_DIVERGED','Bot meldet einen abweichenden Zustand. Abgleich erforderlich.',409);
      }
      holdActual=matchesPending;
    }
    // A command observed in heartbeat still needs the matching explicit ACK.
    const unconfirmed=this.db.prepare("SELECT * FROM proposals WHERE bot_id=? AND revision=? AND status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE'").get(b.id,input.actualRevision);
    if(unconfirmed&&!changedRuntime&&canonical(values)===canonical(JSON.parse(unconfirmed.values_json)))holdActual=true;
    this.store.transaction(()=>{
      if(changedRuntime){
        this.revokeRuntimeGrant(b.id);
        this.db.prepare("UPDATE proposals SET status='timed_out',reason='RUNTIME_CHANGED' WHERE bot_id=? AND status='pending'").run(b.id);
        this.store.event('runtime.connected',{runtimeId,accountId,environment:input.environment,manifestId:m.id},actor.id,b.id);
      }
      this.store.set('fault:'+b.id,fault);
      this.db.prepare('UPDATE bots SET actual=?,actual_revision=?,runtime_id=?,account_id=?,environment=?,last_seen=?,sequence=?,runtime_blocked=?,runtime_status=? WHERE id=?').run(holdActual?b.actual:JSON.stringify(values),holdActual?b.actual_revision:input.actualRevision,runtimeId,accountId,input.environment,this.now(),input.sequence,input.blocked?1:0,fault?'fault':'connected',b.id);
      this.observation.committedHeartbeat(input,actor,b);
    });
    let command=null;const policy=this.store.get('policy'),granted=this.runtimeGranted(b.id,runtimeId,accountId,input.environment,policy);
    // Bind deadline selection and response metadata to one decision instant.
    // The native callback still checks its current clock before applying.
    const responseTime=this.now();
    const next=this.db.prepare("SELECT * FROM proposals WHERE bot_id=? AND runtime_id=? AND status='pending' AND expires_at>? ORDER BY confirmed_at LIMIT 1").get(b.id,runtimeId,responseTime);
    if(next&&!policy.blocked&&!fault&&granted){
      if(!next.delivered_at){this.db.prepare('UPDATE proposals SET delivered_at=? WHERE id=?').run(this.now(),next.id);this.store.event('configuration.dispatched',{proposalId:next.id,revision:next.revision},'system',b.id);}
      command={id:next.id,revision:next.revision,baseRevision:next.base_revision,digest:next.digest,values:JSON.parse(next.values_json),scope:'new-trades',runtimeId,expiresAt:iso(next.expires_at)};
    }
    return {serverTime:iso(responseTime),blocked:m.id===OBSERVER_ID||policy.blocked||!granted||!!fault,command:m.id===OBSERVER_ID?null:command};
  }
  ack(input,actor){
    this.assertBridge(actor,input.botId);const buildBlocker=buildEntryBlocker(this.store,input.botId);if(buildBlocker)fail(buildBlocker,'Die alte Parametervollmacht endet am Buildübergang. Keine neue Steuerfreigabe.',409);if(JSON.parse(this.rawBot(input.botId).manifest).id===OBSERVER_ID)fail('OBSERVER_READ_ONLY','Der Beobachter übernimmt keine Steueraufträge.',403);this.expire();const b=this.rawBot(input.botId),p=this.proposal(input.commandId);
    if(p.botId===b.id&&p.reason==='BOT_ARCHIVED')fail('ACK_ARCHIVED','Dieser Auftrag wurde durch die Archivierung dauerhaft gesperrt. Eine neue Verbindung kann ihn nicht nachträglich bestätigen.',409);
    if(p.botId===b.id&&p.reason==='FULL_RESTORE')fail('ACK_RESTORE_FENCED','Dieser Auftrag wurde durch die vollständige Wiederherstellung dauerhaft gesperrt. Eine neue Verbindung kann ihn nicht nachträglich bestätigen.',409);
    if(p.botId!==b.id||p.runtimeId!==input.runtimeId||b.runtime_id!==input.runtimeId||p.revision!==input.revision||p.digest!==input.digest||!p.deliveredAt)fail('ACK_MISMATCH','Bestätigung passt nicht zum übertragenen Auftrag.',409);
    if(typeof input.accepted!=='boolean')fail('ACK_INVALID','Bestätigungsstatus fehlt.');
    const values=validateValues(JSON.parse(b.manifest),input.values);
    if(input.accepted&&canonical(values)!==canonical(p.values))fail('ACK_VALUES_MISMATCH','Der Bot hat andere Werte als angefordert zurückgemeldet.',409);
    if(!input.accepted&&(input.revision!==p.revision||!b.actual||canonical(values)!==canonical(JSON.parse(b.actual))))fail('REJECTION_STATE_UNCERTAIN','Die Ablehnung belegt keinen unveränderten Laufzeitzustand.',409);
    if(p.status==='applied'||p.status==='rejected'){
      if((p.status==='applied')!==input.accepted)fail('ACK_CONFLICT','Widersprüchliche Bestätigung.',409);
      return {accepted:true,status:p.status,duplicate:true};
    }
    if(!['pending','timed_out'].includes(p.status))fail('ACK_STATE_INVALID','Dieser Auftrag wartet nicht auf eine Laufzeitbestätigung.',409);
    const newer=this.db.prepare("SELECT id FROM proposals WHERE bot_id=? AND revision>? AND status IN ('pending','applied')").get(b.id,p.revision);
    if(newer)fail('ACK_SUPERSEDED','Eine neuere Konfiguration muss zuerst abgeglichen werden.',409);
    const status=input.accepted?'applied':'rejected';
    this.store.transaction(()=>{
      this.db.prepare('UPDATE proposals SET status=?,completed_at=?,reason=? WHERE id=?').run(status,this.now(),input.accepted?(p.status==='timed_out'?'LATE_ACK':null):'RUNTIME_REJECTED',p.id);
      if(input.accepted)this.db.prepare('UPDATE bots SET actual=?,actual_revision=? WHERE id=?').run(JSON.stringify(values),p.revision,b.id);
      this.store.event('configuration.'+status,{proposalId:p.id,revision:p.revision,late:p.status==='timed_out'},actor.id,b.id);
    });
    return {accepted:true,status};
  }
  export({botIds}={}){
    let rows,scope='active';
    if(botIds!==undefined){
      if(!Array.isArray(botIds)||botIds.length<1||botIds.length>MAX_RESTORE_BOTS||botIds.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(botIds).size!==botIds.length)fail('EXPORT_SELECTION_INVALID','Für einen Export müssen 1 bis 100 unterschiedliche Botprofile ausgewählt werden.');
      rows=botIds.map(id=>this.rawBot(id));scope='selected';
    }else rows=this.db.prepare('SELECT * FROM bots WHERE archived_at IS NULL ORDER BY created_at,id').all();
    const bots=rows.map(b=>({name:b.name,adapter:b.adapter,manifest:JSON.parse(b.manifest),desired:JSON.parse(b.desired)}));
    if(!bots.length)fail('BACKUP_EMPTY','Noch keine Botprofile zum Exportieren.');
    const exported={format:'trading-local',schema:1,exportedAt:iso(this.now()),profile:this.store.get('profile'),onboarding:this.store.get('onboarding'),selection:{scope,count:bots.length,archivedCount:rows.filter(b=>b.archived_at!=null).length},bots,events:this.store.events(0,500),containsSecrets:false};
    if(backupByteLength(exported)>MAX_RESTORE_FILE_BYTES)fail('EXPORT_TOO_LARGE','Der vollständige Konfigurationsexport überschreitet 16 MiB. Es wurde keine gekürzte Datei erstellt. Eine lokale SQLite-Sicherung bleibt möglich.',413);
    return exported;
  }
  previewRestore(raw,actor=HUMAN){
    this.requireHuman(actor);
    return restorePreview(parseRestoreBackup(raw),readRestoreSnapshot(this.store));
  }
  // Only called inside one transaction, after validation and capacity/review
  // checks. The command's delivery evidence remains available for exact late ACKs.
  #applyRestoreProfiles(parsed,actor,requestId=null){
    const botIds=[],time=this.now();
    this.db.prepare("UPDATE proposals SET status='timed_out',reason='BACKUP_RESTORED' WHERE status='pending'").run();
    for(const bot of parsed.bots){const id=randomUUID();botIds.push(id);this.db.prepare('INSERT INTO bots(id,name,adapter,manifest,desired,created_at) VALUES(?,?,?,?,?,?)').run(id,bot.name,bot.adapter,JSON.stringify(bot.manifest),JSON.stringify(bot.values),time);}
    this.store.set('policy',{blocked:true,changedAt:iso(time)});
    this.store.set('onboarding',{step:1,completed:false});
    this.store.event('backup.restored',{count:botIds.length,activeStateRestored:false,credentialsRestored:false,...(requestId?{requestId}:{})},actor.id);
    return {restored:botIds.length,botIds,completedAt:iso(time)};
  }
  confirmRestore(raw,review,actor=HUMAN){
    this.requireHuman(actor);
    const requestId=restoreRequestId(review),parsed=parseRestoreBackup(raw);
    return this.store.transaction(()=>{
      const receipts=this.store.get('restoreReceipts',[]),previous=receipts.find(receipt=>receipt.requestId===requestId);
      // Receipt lookup precedes current capacity/state checks: a successful
      // import already changed those, and a retry must not import or block again.
      if(previous){
        if(previous.fileDigest!==parsed.fileDigest)fail('IDEMPOTENCY_CONFLICT','Diese Anfragekennung wurde bereits für eine andere Sicherung verwendet.',409);
        const {fileDigest,...result}=previous;
        return {...result,requiresReconnect:true,replayed:true};
      }
      const current=restorePreview(parsed,readRestoreSnapshot(this.store));
      if(current.reviewDigest!==review.reviewDigest)fail('RESTORE_REVIEW_CHANGED','Datei, Profile, Laufzeiten oder Freigaben haben sich seit der Vorschau geändert. Vorschau erneut prüfen.',409);
      const result=this.#applyRestoreProfiles(parsed,actor,requestId);
      const receipt={...result,requestId,fileDigest:parsed.fileDigest};
      this.store.set('restoreReceipts',[...receipts,receipt].slice(-MAX_RESTORE_RECEIPTS));
      return {...result,requestId,requiresReconnect:true,replayed:false};
    });
  }
  // Internal compatibility entry point. Public HTTP import uses confirmRestore.
  restore(raw,actor=HUMAN){
    this.requireHuman(actor);
    const parsed=parseRestoreBackup(raw);
    const result=this.store.transaction(()=>{restorePreview(parsed,readRestoreSnapshot(this.store));return this.#applyRestoreProfiles(parsed,actor);});
    return {restored:result.restored,bots:result.botIds.map(id=>this.bot(id)),requiresReconnect:true};
  }
}
