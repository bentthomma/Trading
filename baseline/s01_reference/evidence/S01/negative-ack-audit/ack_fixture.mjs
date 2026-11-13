/** Real original Hub HTTP/auth/SQLite; only bridge messages and clocks are synthetic.
 * No bot, broker, account connection or native SDK execution. Reuses existing HTTP harness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture as originalFixture,load} from '../interface_checks/route_harness.mjs';
const {COMMAND_TTL,HEARTBEAT_TTL}=await load('core/control.mjs');
export const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
export const err=(r,code,status=409)=>{assert.equal(r.status,status,JSON.stringify(r.data));assert.equal(r.data.error,code,JSON.stringify(r.data));};
export async function setup(t,profileId='th3rev.ready20.v1'){
 const f=await originalFixture(t);let now=1800000000000,seq=0,key=0;
 const setClock=()=>{f.app.control.now=()=>now;f.app.store.now=()=>now;};setClock();
 const created=ok(await f.request('/api/hub/bots',{name:'SYNTHETIC_ACK_AUDIT',profileId}),201);
 const id=created.bot.id,initial=structuredClone(created.bot.desired),manifest=created.bot.manifest;
 let token=created.bridgeToken,runtimeId='synthetic_control_runtime',accountId='synthetic_control_account';
 const bot=async()=>ok(await f.request('/api/hub/bots/'+id)).bot;
 const hb=async(overrides={})=>f.request('/api/bridge/heartbeat',{botId:id,runtimeId,accountId,environment:'demo',manifestId:manifest.id,manifestVersion:manifest.version,values:initial,actualRevision:0,blocked:true,sequence:++seq,...overrides},{token});
 const propose=async(values={...initial,risk:.5},extra={})=>{const b=await bot();return ok(await f.request('/api/hub/bots/'+id+'/proposals',{values,expectedRevision:b.revision,idempotencyKey:'synthetic-'+(++key),...extra}),201).proposal;};
 const release=async()=>{const state=ok(await f.request('/api/hub/state'));return ok(await f.request('/api/hub/policy',{blocked:false,review:{digest:state.policyReview.digest}}));};
 const confirm=async p=>{const b=await bot();return f.request('/api/hub/proposals/'+p.id+'/confirm',{digest:p.digest,runtimeId:b.runtimeId,accountId:b.accountId,actualRevision:b.actualRevision});};
 const ackBody=(p,overrides={})=>({botId:id,runtimeId,commandId:p.id,revision:p.revision,digest:p.digest,accepted:true,values:p.values,...overrides});
 const ack=async(p,overrides={},auth={token})=>f.request('/api/bridge/ack',ackBody(p,overrides),auth);
 const ready=async()=>{ok(await hb());await release();const p=await propose();ok(await confirm(p));return f.app.control.proposal(p.id);};
 const delivered=async()=>{const p=await ready();const r=ok(await hb());assert.equal(r.command.id,p.id);return f.app.control.proposal(p.id);};
 return {...f,get app(){return f.app;},id,initial,manifest,bot,hb,propose,release,confirm,ack,ackBody,ready,delivered,
  get token(){return token;},set token(v){token=v;},get time(){return now;},at(v){now=v;},advance(v){now+=v;},
  async restart(){await f.restart();setClock();},get runtimeId(){return runtimeId;},set runtimeId(v){runtimeId=v;},
  proposal:p=>f.app.control.proposal(p.id),events:(type)=>f.app.store.db.prepare('SELECT * FROM events WHERE type=?').all(type)};
}

