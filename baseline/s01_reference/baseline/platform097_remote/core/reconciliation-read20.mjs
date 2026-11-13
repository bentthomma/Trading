import {fail} from './errors.mjs';
import {reconcilePositionViews20} from './reconciliation20.mjs';

// One read contract for authenticated HTTP and MCP. The caller selects both
// profiles explicitly; symbols, labels and matching account numbers never
// cause an automatic profile choice or any write/trading permission.
export function readReconciliation20(control,{engineBotId,observerBotId}={},actor){
 control.requireAccess(actor);
 if([engineBotId,observerBotId].some(id=>typeof id!=='string'||!id||id.length>100)||engineBotId===observerBotId)
  fail('RECONCILIATION_SELECTION_INVALID','Engine und Observer müssen ausdrücklich als zwei verschiedene Profile gewählt werden.');
 const engine=control.rawBot(engineBotId),observer=control.rawBot(observerBotId);
 const em=JSON.parse(engine.manifest),om=JSON.parse(observer.manifest);
 if(engine.adapter!=='bridge'||observer.adapter!=='bridge'||em.id!=='th3rev.ready20.v1'||om.id!=='th3rev.observer.v1'||em.version!=='1.0.0'||om.version!=='1.0.0')
  fail('RECONCILIATION_PROFILE_REQUIRED','Für den Vergleich werden ein Ready20-Profil und ein getrenntes Observerprofil benötigt.',409);
 return {...reconcilePositionViews20({
  observerView:control.observation.view(observerBotId,actor),
  engineView:control.engineJournal.view(engineBotId,actor,{limit:100}),
  now:control.now()
 }),engineBotId,observerBotId,selection:{engineBotId,observerBotId,engineProfileId:em.id,observerProfileId:om.id}};
}
