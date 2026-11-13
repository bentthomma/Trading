/**
 * Local Core admission check, not a broker-wide ownership claim.
 * The legacy heartbeat carries an account number/environment, not a verified
 * broker. Equal numbers are therefore conservatively ambiguous even when a
 * caller asserts they came from different brokers. No implicit winner is chosen.
 * This prevents simultaneous local grants; it is NOT a writer handover protocol
 * and does not stop an existing process or its position management.
 */
export const ACCOUNT_ENTRY_CONFLICT='ACCOUNT_ENTRY_CONFLICT';
const text=v=>typeof v==='string'&&v.length>0&&v.length<=100&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
export function accountEntryConflicts(runtimes){
 if(!Array.isArray(runtimes))return {valid:false,conflicts:[]};
 const groups=new Map();
 for(const r of runtimes){
  if(!r||!text(r.botId)||!text(r.runtimeId)||!text(r.accountId)||!['demo','live'].includes(r.environment))return {valid:false,conflicts:[]};
  const key=JSON.stringify([r.environment,r.accountId]);let group=groups.get(key);
  if(!group){group={environment:r.environment,accountId:r.accountId,runtimes:new Map()};groups.set(key,group)}
  group.runtimes.set(JSON.stringify([r.botId,r.runtimeId]),{botId:r.botId,runtimeId:r.runtimeId});
 }
 const conflicts=[...groups.values()].filter(g=>g.runtimes.size>1).map(g=>({environment:g.environment,accountId:g.accountId,
   runtimes:[...g.runtimes.values()].sort((a,b)=>a.botId.localeCompare(b.botId)||a.runtimeId.localeCompare(b.runtimeId)),
   code:ACCOUNT_ENTRY_CONFLICT,brokerIdentityVerified:false})).sort((a,b)=>a.environment.localeCompare(b.environment)||a.accountId.localeCompare(b.accountId));
 return {valid:true,conflicts};
}
export function unambiguousAccountGrant(grants,accountId,environment){
 const result=accountEntryConflicts(grants);
 return result.valid&&!result.conflicts.some(c=>c.accountId===accountId&&c.environment===environment);
}
