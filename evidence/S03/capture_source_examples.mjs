/** S03 documentation witnesses from unmodified Core/SQLite sources.
 * Synthetic inputs use the ORIGINAL repository fixture; no UI, server or broker starts.
 * The original extraction is supplied by the external, hash-checking audit runner.
 */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
if(!process.env.S03_ORIGINAL_ROOT)throw Error('S03_ORIGINAL_ROOT_REQUIRED');
const original=resolve(process.env.S03_ORIGINAL_ROOT);
const {reconciliationFixture,clone,PID,NOW,at}=await import(pathToFileURL(join(original,'tests/support/reconciliation20-fixtures.mjs')));
const {reconcilePositionViews20}=await import(pathToFileURL(join(original,'core/reconciliation20.mjs')));
const {validateObservation}=await import(pathToFileURL(join(original,'core/observation.mjs')));
const cleanups=[];
function fixture(){return reconciliationFixture({after:fn=>cleanups.push(fn)});}
function coverage(v,changes){Object.assign(v.observerView.observation.coverage,changes);v.observerView.coverage=clone(v.observerView.observation.coverage);}
const cases=[];
try{
 const f=fixture(),v=f.views(),out=reconcilePositionViews20(v);
 assert.equal(out.positions[0].positionId,PID);
 cases.push({id:'reported_agreement',status:out.status,source_fresh:out.fresh,position_id:out.positions[0].positionId,entry:out.positions[0].observer.values.entry,original_plan_state:out.positions[0].originalPlan.state,exit_state:out.positions[0].exitHealth.state,native_protection_confirmed:out.nativeProtectionConfirmed,broker_independently_verified:out.brokerIndependentlyVerified,flat_confirmed:out.flatConfirmed,trade_granted:out.grantsTrading});
 const p=clone(v);coverage(p,{positionsComplete:false,positionCount:2});p.observerView.status='partial';
 const po=reconcilePositionViews20(p);
 cases.push({id:'fresh_partial',source_fresh:po.fresh,status:po.status,loaded_positions:po.summary.observedPositions,reported_count:p.observerView.observation.coverage.positionCount,current_pair:po.positions[0].comparison.currentPair,comparison_scope:po.positions[0].comparison.scope});
 const stale=clone(v);stale.engineView.positions[0].sourceTime=at(NOW-15001);stale.engineView.positions[0].fresh=true;
 const so=reconcilePositionViews20(stale);
 cases.push({id:'fresh_feed_stale_row',source_fresh:so.fresh,row_fresh:so.positions[0].engine.fresh,current_pair:so.positions[0].comparison.currentPair,original_plan_state:so.positions[0].originalPlan.state});
 const empty=clone(v);empty.observerView.observation.positions=[];coverage(empty,{positionCount:0});const eo=reconcilePositionViews20(empty);
 cases.push({id:'empty_observer_historical_report',observed_positions:eo.summary.observedPositions,loaded_reports:eo.summary.loadedEnginePositionReports,engine_is_open_list:eo.coverage.engineIsOpenPositionList,flat_confirmed:eo.flatConfirmed,reported_presence:eo.positions[0].engine.presence,exit_state:eo.positions[0].exitHealth.state});
 const accountKeys=Object.keys(v.observerView.observation.account).sort();
 let rejected=false;const wrong=clone(v.observerView.observation);wrong.account.freeMargin='100000';try{validateObservation(wrong,NOW);}catch{rejected=true;}
 cases.push({id:'observer_no_free_margin',account_keys:accountKeys,invented_free_margin_rejected:rejected,global_snapshot_exists:f.store.latestSnapshot()!==null});
 cases.push({id:'journal_is_projection',top_level_fields:Object.keys(v.engineView).sort(),has_events:Object.hasOwn(v.engineView,'events'),has_decisions:Object.hasOwn(v.engineView,'decisions'),status_reason_groups:v.engineView.status.report.decisionReasons,positions_are_reports:out.coverage.engineIsOpenPositionList===false});
 const mismatch=clone(v);mismatch.engineView.account.broker='OTHER_SYNTHETIC_BROKER';for(const r of [...mismatch.engineView.positions,...mismatch.engineView.plans])r.account.broker='OTHER_SYNTHETIC_BROKER';const mo=reconcilePositionViews20(mismatch);
 cases.push({id:'account_scope_mismatch',account_matched:mo.accountMatched,joined_rows:mo.positions.length,flat_confirmed:mo.flatConfirmed,trade_granted:mo.grantsTrading});
 console.log(JSON.stringify({schema:'extremelab-s03-original-source-examples/1',synthetic_only:true,source_mode:'original_core_sqlite_fixture',source_archive_sha256:'6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d',ui_verified:false,broker_connected:false,cases},null,2));
}finally{for(const cleanup of cleanups.reverse())cleanup();}
