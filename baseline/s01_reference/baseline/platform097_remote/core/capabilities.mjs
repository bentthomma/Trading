import { fail, object } from './errors.mjs';

const unsupportedReasons = new Set(['unsupported_parameter_id','credential_parameter','unsupported_type','missing_or_invalid_default','parameter_limit']);
const messages = Object.freeze({
  BUILD_TRANSITION_REQUIRES_HANDOVER:'Buildfolge bestätigt; native Writerübergabe noch offen. Nur lesende Verbindung erlaubt.',
  BUILD_TRANSITION_STATE_INVALID:'Buildübergang unvollständig oder beschädigt. Keine Steuerfreigabe.',
  BUILD_ACCOUNT_HANDOVER_REQUIRED:'Dieses Konto besitzt eine ungeklärte Writerübergabe. Ein anderes Profil darf sie nicht umgehen.',
  ACCOUNT_ENTRY_CONFLICT:'Mehrere Instanzen sind derselben gemeldeten Kontonummer zugeordnet. Keine gemeinsame Einstiegserlaubnis; verantwortliche Instanz und tatsächlichen Prozesszustand prüfen.',
  CONFIGURATION_NOT_SUPPORTED:'Dieses Botprofil unterstützt keine gesteuerten Konfigurationsänderungen. Seine Einstellungen können gelesen und geprüft werden.',
  TELEMETRY_NOT_SUPPORTED:'Dieses Botprofil besitzt keinen unterstützten Vertrag für Laufzeitdaten.',
  BOT_ARCHIVED:'Dieses Botprofil ist archiviert. Erneute Steuerung benötigt eine bewusste Reaktivierung und neue Verbindung.',
  BOT_NOT_CONNECTED:'Eine aktuelle Bestätigung der passenden Bot-Bridge fehlt. Verbindung im Botleitfaden prüfen.',
  RUNTIME_FAULT:'Die Botlaufzeit meldet einen Fehler. Vor einer Übernahme muss die Laufzeit geprüft werden.',
  RUNTIME_CONFIGURATION_DIVERGED:'Die gemeldeten Botwerte widersprechen der erwarteten Konfiguration. Zuerst den Laufzeitzustand abgleichen.',
  DEMO_CONTROL_ONLY:'Laufzeitänderungen sind nur für bestätigte Demokonten unterstützt.',
  PREVIOUS_COMMAND_UNCONFIRMED:'Eine bereits übertragene Änderung ist noch ungeklärt. Zuerst die Botbestätigung abgleichen.',
  CONTROL_BLOCKED:'Die globale Botsperre ist gesetzt. Eine Freigabe benötigt eine bewusste Prüfung der erreichbaren Demo-Instanzen.',
  RUNTIME_RELEASE_REQUIRED:'Diese Botinstanz besitzt noch keine passende Demo-Freigabe. Aktuelle Instanzen erneut prüfen.',
  COMMAND_PENDING:'Eine Änderung wartet auf die Botantwort. Erst danach kann eine weitere Änderung vorbereitet werden.',
  RESTART_REQUIRED:'Der aktuelle Vorschlag verändert einen Startparameter. Ein kontrollierter Neustart ist in dieser Ausgabe nicht implementiert.'
  ,OBSERVER_PROCESS_REVIEW_REQUIRED:'Der eigenständige Observer kann nach Konto-, CLI- und Artefaktprüfung im Bereich Observer-Prozess gestartet werden. Der aktuelle Prozessstatus wird dort separat geprüft.'
  ,OBSERVER_PROCESS_OWNERSHIP_REQUIRED:'Nur der von diesem Core gehaltene Observer-Prozess kann gestoppt werden. Der aktuelle Prozessbesitz wird im Bereich Observer-Prozess geprüft.'
  ,OBSERVER_PROCESS_RESTART_REVIEW_REQUIRED:'Ein neuer Observer-Start braucht das bestätigte Ende des eigenen vorherigen Prozesses und eine neue Startprüfung. Keine Handelsengine wird gestartet.'
});

export function supportsConfiguration(bot) {
  return bot.adapter==='bridge' && bot.manifest?.capabilities?.liveConfiguration===true;
}

// The caller supplies this only after an actual inspectAlgo operation. Keep a
// bounded historical receipt, never paths, raw metadata, defaults or credentials.
// A JSON profile restore does not call this function or copy its KV record.
export function normalizeImportEvidence(raw,manifest,now) {
  if(raw===undefined||raw===null)return null;
  const invalid=()=>fail('IMPORT_EVIDENCE_INVALID','Der Metadatennachweis passt nicht zum importierten Botprofil. Datei erneut prüfen.',409);
  if(!object(raw)||typeof raw.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(raw.sha256)||
      typeof raw.cliVersion!=='string'||raw.cliVersion.length>80||!/^\d+\.\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9._-]+)?$/.test(raw.cliVersion)||
      !Number.isSafeInteger(raw.rawParameterCount)||raw.rawParameterCount<0||raw.rawParameterCount>200||
      !Array.isArray(raw.unsupportedParameters)||raw.unsupportedParameters.length>200)invalid();
  const sha256=raw.sha256.toLowerCase(),mappedParameterCount=manifest.parameters.length;
  if(raw.rawParameterCount!==mappedParameterCount+raw.unsupportedParameters.length||
      manifest.id.startsWith('ctrader.algo.')&&manifest.id!=='ctrader.algo.'+sha256.slice(0,24))invalid();
  const seen=new Set(manifest.parameters.map(p=>p.id));
  const unsupportedParameters=raw.unsupportedParameters.map(entry=>{
    if(!object(entry)||typeof entry.id!=='string'||typeof entry.type!=='string'||!unsupportedReasons.has(entry.reason))invalid();
    // A rejected identifier is display evidence, never a configurable key. Its
    // receipt need not impose the syntax required for supported parameters.
    const id=entry.reason==='unsupported_parameter_id'?entry.id.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,200):entry.id;
    if(!id||seen.has(id)||entry.reason!=='unsupported_parameter_id'&&!/^[A-Za-z_][A-Za-z0-9_]{0,199}$/.test(id))invalid();
    seen.add(id);
    return {id,type:entry.type.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100),reason:entry.reason};
  });
  return {kind:'ctrader-cli-metadata',historical:true,sha256,cliVersion:raw.cliVersion,importedAt:new Date(now).toISOString(),
    rawParameterCount:raw.rawParameterCount,mappedParameterCount,unsupportedParameters};
}

const reason = code => code ? {code,message:messages[code]||'Die Funktion benötigt einen erneut geprüften Botzustand.'} : null;
function action(id,label,{supported=true,code=null,unconfirmed=false,human=false}={}) {
  const available=supported&&!code;
  return {id,label,implemented:true,supported,available,status:!supported?'unsupported':available?'available':unconfirmed?'unconfirmed':'blocked',reason:reason(code),requiresHumanConfirmation:human};
}
function notImplemented(id,label,message) {
  return {id,label,implemented:false,supported:false,available:false,status:'not_implemented',reason:{code:'NOT_IMPLEMENTED',message},requiresHumanConfirmation:false};
}

// A shared description, not an authorisation token. The Core still checks the
// actor, current proposal/revision, runtime identity, Demo policy and final ACK.
// "available" describes present prerequisites, not a promise that arbitrary
// parameter values or an unconfirmed proposal can be applied.
export function createCapabilityProfile(bot,{fresh=false,importEvidence=null,pendingProposalId=null}={}) {
  const manifest=bot.manifest,configuration=supportsConfiguration(bot);
  const managedObserver=bot.adapter==='bridge'&&manifest.id==='th3rev.observer.v1';
  const archived=bot.archivedAt!=null||bot.status==='archived';
  fresh=fresh&&!archived;
  const telemetry=bot.adapter==='bridge'&&manifest.capabilities.telemetry===true;
  const confirmed=fresh&&bot.status==='connected'&&object(bot.actual)&&!!bot.runtimeId&&!!bot.accountId;
  const runtimeCode=archived?'BOT_ARCHIVED':bot.status==='fault'?'RUNTIME_FAULT':bot.status==='conflict'?'RUNTIME_CONFIGURATION_DIVERGED':!confirmed?'BOT_NOT_CONNECTED':null;
  const currentProposal=bot.proposals.find(p=>p.status==='proposed'&&p.revision===bot.revision);
  const restartRequired=confirmed&&currentProposal&&manifest.parameters.some(p=>!p.live&&bot.actual[p.id]!==currentProposal.values[p.id]);
  const applyCode=!configuration?'CONFIGURATION_NOT_SUPPORTED':runtimeCode||bot.controlBlocker?.code||
    (pendingProposalId?'COMMAND_PENDING':restartRequired?'RESTART_REQUIRED':null);
  return {
    schemaVersion:1,
    declared:{liveConfiguration:manifest.capabilities.liveConfiguration===true,telemetry:manifest.capabilities.telemetry===true,
      parameterCount:manifest.parameters.length,liveParameterCount:manifest.parameters.filter(p=>p.live).length},
    runtime:{status:bot.status,fresh,confirmed,lastSeen:bot.lastSeen,runtimeId:bot.runtimeId,accountId:bot.accountId,environment:bot.environment},
    importEvidence:bot.adapter==='ctrader-cli'?importEvidence:null,
    actions:[
      action('configuration.read','Einstellungen lesen'),
      action('configuration.validate','Einstellungen prüfen'),
      action('configuration.propose','Änderung vorbereiten',{supported:configuration,code:!configuration?'CONFIGURATION_NOT_SUPPORTED':archived?'BOT_ARCHIVED':pendingProposalId?'COMMAND_PENDING':null}),
      action('configuration.apply','Laufzeitänderung übernehmen',{supported:configuration,code:applyCode,unconfirmed:applyCode==='BOT_NOT_CONNECTED',human:true}),
      action('telemetry.read','Laufzeitdaten lesen',{supported:telemetry,code:!telemetry?'TELEMETRY_NOT_SUPPORTED':runtimeCode,unconfirmed:runtimeCode==='BOT_NOT_CONNECTED'}),
      managedObserver?action('execution.start','Observer starten',{code:archived?'BOT_ARCHIVED':'OBSERVER_PROCESS_REVIEW_REQUIRED',unconfirmed:!archived,human:true}):notImplemented('execution.start','Bot starten','Der Hub kann diese Handelsengine in dieser Ausgabe nicht starten. Der Start erfolgt in cTrader.'),
      managedObserver?action('execution.stop','Eigenen Observer stoppen',{code:'OBSERVER_PROCESS_OWNERSHIP_REQUIRED',unconfirmed:true,human:true}):notImplemented('execution.stop','Bot stoppen','Der Hub kann diese Handelsengine in dieser Ausgabe nicht stoppen. Die Botsperre beendet keinen Prozess.'),
      managedObserver?action('configuration.restart','Observer neu starten',{code:archived?'BOT_ARCHIVED':'OBSERVER_PROCESS_RESTART_REVIEW_REQUIRED',unconfirmed:!archived,human:true}):notImplemented('configuration.restart','Bot neu starten','Ein kontrollierter Neustart dieser Handelsengine ist in dieser Ausgabe nicht implementiert.'),
      notImplemented('backtest.run','Backtest ausführen','Die Backtest-Ausführung über den Hub ist noch nicht implementiert. Ein Metadatenimport führt keinen Backtest aus.'),
      notImplemented('trading.live','Live-Handel steuern','Live-Handelsaktionen werden in dieser Ausgabe nicht unterstützt.')
    ]
  };
}
