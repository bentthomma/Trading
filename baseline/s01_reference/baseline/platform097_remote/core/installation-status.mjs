// A deliberately small projection for the local UI. Installation metadata is
// file input, not permission to run an installer or a publisher attestation.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const version = value => typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:alpha|beta|rc)(?:[.-]?\d{1,3})?)?$/.test(value) ? value : null;
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
const reasons = new Set(['unavailable','missing','invalid','unsupported_schema','schema_mismatch','integrity_failed','limit_exceeded','unsafe_entry','invalid_manifest','incomplete_manifest','hash_mismatch','file_changed','package_incompatible','backup_in_progress','stale','legacy','download_mismatch']);
const rollbackReasons = new Set(['not_managed','no_previous','compatible','schema_incompatible','invalid_installation','unsupported']);

function date(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now && new Date(parsed).toISOString() === value ? value : null;
}

function packageCheck(report, runningVersion, now) {
  const item = (Array.isArray(report?.checks) ? report.checks : []).find(check => object(check) && check.id === 'package');
  if (!item) return null;
  const evidence = object(item.evidence) ? item.evidence : {};
  const observedAt = date(item.observedAt, now), checkedVersion = version(evidence.version);
  let status = ['pass','warning','error','not_checked'].includes(item.status) ? item.status : 'not_checked';
  let reason = reasons.has(evidence.reason) ? evidence.reason : null;
  if (!observedAt) { status = 'not_checked'; reason = 'invalid'; }
  else if (checkedVersion && checkedVersion !== runningVersion) { status = 'error'; reason = 'package_incompatible'; }
  else if (status === 'pass' && (evidence.manifestVerified !== true || !checkedVersion)) { status = 'not_checked'; reason = 'invalid'; }
  return {status,observedAt,version:checkedVersion,manifestSha256:sha256(evidence.manifestSha256),reason,scope:'running_package',signatureVerified:false};
}

export function buildInstallationStatus({deployment,applicationVersion,databaseSchemaVersion,lastSystemCheck=null,
  platform=process.platform,architecture=process.arch,startedAt,now=Date.now(),unavailable=false}={}) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) throw new TypeError('Invalid installation-status clock');
  const runningVersion = version(applicationVersion);
  if (!runningVersion || !Number.isSafeInteger(databaseSchemaVersion) || databaseSchemaVersion < 0) throw new TypeError('Invalid running application identity');
  const source = object(deployment) ? deployment : {};
  let mode = !unavailable && ['portable','managed','unknown'].includes(source.mode) ? source.mode : 'unknown';
  let selectedVersion = mode === 'managed' ? version(source.selectedVersion) : null;
  let previousVersion = mode === 'managed' ? version(source.previousVersion) : null;
  if (mode === 'managed' && !selectedVersion) { mode = 'unknown'; previousVersion = null; }
  const runningSelectionMatches = mode === 'managed' && typeof source.runningSelectionMatches === 'boolean'
    ? source.runningSelectionMatches && selectedVersion === runningVersion : null;
  const systemPlatform = ['win32','linux','darwin'].includes(platform) ? platform : 'other';
  const systemArchitecture = ['x64','arm64'].includes(architecture) ? architecture : 'other';
  const suppliedRollback = object(source.rollback) ? source.rollback : {};
  let rollbackReason = mode === 'portable' ? 'not_managed' : mode !== 'managed' ? 'invalid_installation'
    : rollbackReasons.has(suppliedRollback.reason) ? suppliedRollback.reason : 'unsupported';
  const rollbackVersion = mode === 'managed' && version(suppliedRollback.version) === previousVersion ? previousVersion : null;
  const available = mode === 'managed' && systemPlatform === 'win32' && systemArchitecture !== 'other' && suppliedRollback.available === true
    && rollbackReason === 'compatible' && rollbackVersion !== null;
  if (!available && rollbackReason === 'compatible') rollbackReason = 'unsupported';
  const previousCheck = object(source.lastVerification) ? source.lastVerification : {};
  const committedAt = date(previousCheck.checkedAt, now), manifestSha256 = sha256(previousCheck.manifestSha256);
  const lastVerification = mode === 'managed' && previousCheck.scope === 'installation_commit' && committedAt && manifestSha256
    ? {checkedAt:committedAt,manifestSha256,scope:'installation_commit'} : null;
  return {
    format:'trading-local-installation-status',schema:1,mode,runningVersion,selectedVersion,previousVersion,
    runningSelectionMatches,databaseSchemaVersion,rollback:{available,version:rollbackVersion,reason:rollbackReason},
    lastVerification,checkedAt:new Date(now).toISOString(),
    runtime:{platform:systemPlatform,architecture:systemArchitecture,startedAt:date(startedAt,now)},
    packageCheck:packageCheck(lastSystemCheck,runningVersion,now),
    automaticUpdateSupported:false,publisherVerified:false,updateMode:'manual_installer',restartRequired:true,
    windowsAcceptance:'pending',actions:{recheck:true,backup:true,openInstaller:false,rollbackInApp:false},
    ...(unavailable ? {statusError:'INSTALLATION_STATUS_UNAVAILABLE'} : {})
  };
}
