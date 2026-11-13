/** Isolated synthetic Store/Core process; deliberately SIGKILLed at COMMIT. */
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {writeFileSync} from 'node:fs';
const [directory,phase]=process.argv.slice(2),root=process.env.S01_INTERFACE_PLATFORM;
const {Store}=await import(pathToFileURL(join(root,'core/store.mjs')));const {Control,HUMAN}=await import(pathToFileURL(join(root,'core/control.mjs')));
const now=1800000000000,store=new Store(join(directory,'data'),{now:()=>now}),c=new Control(store,{now:()=>now});
const made=c.createBot({name:'SYNTHETIC_CRASH',profileId:'th3rev.ready20.v1'}),id=made.bot.id,token=made.bridgeToken,actor=c.authenticate(token,'bridge'),values=made.bot.desired;
const heartbeat={botId:id,runtimeId:'synthetic_crash_runtime',accountId:'synthetic_crash_account',environment:'demo',manifestId:made.bot.manifest.id,manifestVersion:made.bot.manifest.version,actualRevision:0,values,blocked:true,sequence:1};
c.heartbeat(heartbeat,actor);c.setPolicy(false,HUMAN,{digest:c.releaseReview().digest});
const proposal=c.propose(id,{values:{...values,risk:.5},expectedRevision:0,idempotencyKey:'synthetic_crash'},HUMAN).proposal;
c.confirm(proposal.id,proposal.digest,HUMAN,{runtimeId:heartbeat.runtimeId,accountId:heartbeat.accountId,actualRevision:0});
c.heartbeat({...heartbeat,sequence:2},actor);
const body={botId:id,runtimeId:heartbeat.runtimeId,commandId:proposal.id,revision:proposal.revision,digest:proposal.digest,accepted:false,values,reason:'RUNTIME_REJECTED_UNCHANGED'};
writeFileSync(join(directory,'case.json'),JSON.stringify({proposal,body,token,now}));
const exec=store.db.exec;store.db.exec=function(sql){if(sql==='COMMIT'&&phase==='before')process.kill(process.pid,'SIGKILL');const r=exec.call(this,sql);if(sql==='COMMIT'&&phase==='after')process.kill(process.pid,'SIGKILL');return r;};
c.ack(body,actor);throw Error('CRASH_HOOK_NOT_REACHED');
