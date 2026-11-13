import { parseCredential, decimal } from './legacy-reader.mjs';

const LOCAL = 'http://127.0.0.1:9876/mcp/';
const REMOTE = 'https://mcp.ctrader.com/data/mcp';
const VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
const READ_NAMES = new Set(['get_balance', 'get_account', 'get_account_info', 'get_account_summary', 'get_account_stats',
  'get_positions', 'get_open_positions', 'get_assets', 'get_symbols', 'get_symbol', 'get_symbol_details',
  'get_spot_prices', 'get_prices', 'get_trendbars', 'get_candles', 'get_historical_candles']);
const PERIODS = Object.freeze({ M_1:60000, M_5:300000, M_15:900000, H_1:3600000, H_4:14400000, D_1:86400000 });
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = (code, message, status = 502) => { throw Object.assign(new Error(message), { code, status, safe:true }); };
const requireActive = signal => { if (signal?.aborted) fail('BROKER_CANCELLED', 'Die cTrader-Abfrage wurde abgebrochen.', 503); };
const text = x => typeof x === 'string' && x.length <= 160 ? x : null;
const id = x => typeof x === 'string' && /^[1-9]\d{0,18}$/.test(x) ? x : Number.isSafeInteger(x) && x > 0 ? String(x) : null;
const unwrap = x => { for (let n = 0; n < 4 && object(x) && Object.keys(x).length === 1 && Object.hasOwn(x, 'data'); n++) x = x.data; return x; };
const list = (x, name) => { x = unwrap(x); return Array.isArray(x) ? x : Array.isArray(x?.[name]) ? x[name] : null; };
function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? String(value) : null;
  if (typeof value === 'string' && /^-?\d{1,15}(?:\.\d{1,12})?$/.test(value)) return value;
  return null;
}
function scaled(value, digits) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 12) return null;
  const exact = decimal(value, digits); if (exact !== null) return exact;
  const n = numeric(value); return n === null ? null : String(Number(n) / 10 ** digits);
}

function configFor(config) {
  if (!object(config) || !['local', 'remote'].includes(config.mode)) fail('CTRADER_MODE_INVALID', 'Bitte einen lokalen oder entfernten cTrader-Anschluss wählen.', 400);
  let token = null;
  if (config.mode === 'remote') {
    try { token = parseCredential(config.token); } catch { fail('CTRADER_CONFIGURATION_INVALID', 'Die cTrader-Konfiguration oder der Token ist ungültig.', 400); }
  }
  return { mode: config.mode, token, url: config.mode === 'local' ? LOCAL : REMOTE };
}

function accountEnvironment(account) {
  const flag = account?.isLive === true ? 'live' : account?.isLive === false ? 'demo' : null;
  const label = ['demo','live'].includes(account?.environment) ? account.environment : null;
  if (flag && label && flag !== label)
    fail('ACCOUNT_CHANGED_DURING_READ', 'Die cTrader-Kontoangaben zum Demo- oder Live-Umfeld widersprechen sich. Bitte erneut laden.', 409);
  return flag || label || 'unconfirmed';
}

async function readRpc(response, requestId) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('text/event-stream')) fail('MCP_CONTENT_TYPE', 'cTrader hat kein unterstütztes Datenformat geliefert.');
  const reader = response.body?.getReader(); if (!reader) fail('MCP_EMPTY_RESPONSE', 'cTrader hat keine Antwort geliefert.');
  const decoder = new TextDecoder(); let buffer = '', total = 0;
  const pick = value => {
    const candidates = Array.isArray(value) ? value : [value];
    for (const r of candidates) {
      if (!object(r) || r.jsonrpc !== '2.0' || r.id !== requestId) continue;
      if (r.error) fail('MCP_RPC_REJECTED', 'cTrader hat die Leseanfrage abgelehnt.');
      if (!Object.hasOwn(r, 'result')) fail('MCP_RESULT_MISSING', 'In der cTrader-Antwort fehlt das Ergebnis.');
      return { found: true, result: r.result };
    }
    return { found: false };
  };
  const parse = data => { try { return JSON.parse(data); } catch { fail('MCP_INVALID_JSON', 'Die cTrader-Antwort ist beschädigt.'); } };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) { total += value.byteLength; if (total > 2 * 1024 * 1024) fail('MCP_RESPONSE_TOO_LARGE', 'Die cTrader-Antwort ist zu gross.'); buffer += decoder.decode(value, { stream: true }); }
      if (done) buffer += decoder.decode();
      if (contentType.includes('text/event-stream')) {
        buffer = buffer.replace(/\r\n/g, '\n');
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
          if (data) { const result = pick(parse(data)); if (result.found) return result.result; }
        }
      }
      if (done) break;
    }
    if (contentType.includes('application/json')) { const result = pick(parse(buffer)); if (result.found) return result.result; }
    fail('MCP_RESPONSE_ID_MISMATCH', 'Die cTrader-Antwort gehört nicht zu dieser Anfrage.');
  } catch (e) { if (e?.code) throw e; fail('MCP_READ_FAILED', 'Die cTrader-Datenübertragung wurde unterbrochen.'); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function schemaValue(schema, value, depth = 0) {
  if (!object(schema) || depth > 8 || schema.$ref || schema.oneOf || schema.anyOf) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'integer' && !Number.isSafeInteger(value) || schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)) ||
      schema.type === 'string' && typeof value !== 'string' || schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'array') return Array.isArray(value) && value.length <= 100 && object(schema.items) && value.every(x => schemaValue(schema.items, x, depth + 1));
  if (!['integer', 'number', 'string', 'boolean'].includes(schema.type)) return false;
  if (typeof value === 'number' && (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum)) return false;
  return typeof value !== 'string' || value.length <= (schema.maxLength ?? 1000);
}

class ReadMcp {
  constructor(config, fetcher, signal) {
    Object.assign(this, configFor(config)); this.fetcher = fetcher; this.signal = signal; this.version = '2025-11-25';
    this.requestId = 0; this.session = null; this.deadline = Date.now() + 25000; this.tools = new Map(); this.toolTimes = {};
  }
  async rpc(method, params, notify = false) {
    requireActive(this.signal);
    if (!['initialize', 'notifications/initialized', 'tools/list', 'tools/call'].includes(method)) fail('MCP_METHOD_FORBIDDEN', 'Diese MCP-Methode ist nicht freigegeben.', 403);
    if (method === 'tools/call' && !READ_NAMES.has(params?.name)) fail('BROKER_READ_ONLY', 'Der Brokeradapter erlaubt ausschliesslich geprüfte Leseoperationen.', 403);
    const timeout = Math.min(8000, this.deadline - Date.now()); if (timeout <= 0) fail('MCP_TIMEOUT', 'Die cTrader-Abfrage hat zu lange gedauert.', 504);
    const requestId = ++this.requestId;
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (this.token) headers.authorization = 'Bearer ' + this.token;
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = this.version;
    const deadline = AbortSignal.timeout(timeout), signal = this.signal ? AbortSignal.any([this.signal, deadline]) : deadline;
    let response;
    try {
      response = await this.fetcher(this.url, { method: 'POST', headers,
        body: JSON.stringify({ jsonrpc: '2.0', ...(!notify ? { id: requestId } : {}), method, ...(params === undefined ? {} : { params }) }),
        redirect: 'error', cache: 'no-store', signal });
    } catch { requireActive(this.signal); fail('MCP_UNREACHABLE', this.mode === 'local' ? 'cTrader ist lokal nicht erreichbar. cTrader öffnen und MCP in den Einstellungen aktivieren.' : 'Der cTrader-MCP-Anschluss ist nicht erreichbar.', 503); }
    if (this.signal?.aborted) { await response.body?.cancel().catch(() => {}); requireActive(this.signal); }
    if (!response.ok || response.redirected) {
      await response.body?.cancel().catch(() => {});
      if ([401, 403].includes(response.status)) fail('CTRADER_TOKEN_EXPIRED', 'Die cTrader-Freigabe ist abgelaufen oder wurde abgelehnt.', 401);
      if (response.status === 429) fail('CTRADER_RATE_LIMIT', 'cTrader begrenzt die Anfragen. Bitte später erneut versuchen.', 429);
      fail('MCP_HTTP_ERROR', 'cTrader hat die Verbindung nicht bestätigt.', 503);
    }
    if (notify) { await response.body?.cancel().catch(() => {}); return null; }
    if (method === 'initialize') {
      const session = response.headers.get('mcp-session-id');
      if (session !== null) { if (!/^[\x21-\x7e]{1,256}$/.test(session)) fail('MCP_SESSION_INVALID', 'cTrader hat eine ungültige Sitzung geliefert.'); this.session = session; }
    }
    try {
      const result = await readRpc(response, requestId);
      requireActive(this.signal);
      return result;
    } catch (error) { requireActive(this.signal); throw error; }
  }
  async initialize() {
    const result = await this.rpc('initialize', { protocolVersion: this.version, capabilities: {}, clientInfo: { name: 'LocalTradingReader', version: '1.0.0' } });
    if (!VERSIONS.has(result?.protocolVersion)) fail('MCP_VERSION_UNSUPPORTED', 'Diese cTrader-MCP-Protokollversion wird noch nicht unterstützt.');
    this.version = result.protocolVersion;
    await this.rpc('notifications/initialized', undefined, true);
    let cursor; const cursors = new Set();
    for (let n = 0; n < 5; n++) {
      const page = await this.rpc('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(page?.tools) || page.tools.length > 300) fail('MCP_TOOL_LIST_INVALID', 'cTrader hat keine gültige Werkzeugliste geliefert.');
      for (const t of page.tools) {
        if (!object(t) || typeof t.name !== 'string' || !object(t.inputSchema)) fail('MCP_TOOL_LIST_INVALID', 'Eine cTrader-Werkzeugdefinition ist ungültig.');
        if (READ_NAMES.has(t.name) && t.annotations?.readOnlyHint !== false) {
          if (this.tools.has(t.name)) fail('MCP_TOOL_DUPLICATE', 'Die cTrader-Werkzeugliste enthält doppelte Definitionen.');
          this.tools.set(t.name, t);
        }
      }
      if (!page.nextCursor) return;
      if (typeof page.nextCursor !== 'string' || page.nextCursor.length > 1000 || cursors.has(page.nextCursor)) fail('MCP_CURSOR_INVALID', 'Die cTrader-Werkzeugliste kann nicht vollständig geprüft werden.');
      cursor = page.nextCursor; cursors.add(cursor);
    }
    fail('MCP_TOOL_LIST_INCOMPLETE', 'Die cTrader-Werkzeugliste überschreitet den unterstützten Umfang.');
  }
  select(names) { return names.map(name => this.tools.get(name)).find(Boolean) || null; }
  async call(tool, args = {}) {
    if (!tool || !this.tools.has(tool.name) || !READ_NAMES.has(tool.name)) fail('BROKER_TOOL_UNAVAILABLE', 'Die benötigte cTrader-Lesefunktion ist nicht verfügbar.');
    const schema = tool.inputSchema;
    if (schema.type !== 'object' || schema.oneOf || schema.anyOf || schema.$ref || !Array.isArray(schema.required ?? [])) fail('BROKER_SCHEMA_UNSUPPORTED', 'Das cTrader-Werkzeugschema wird noch nicht unterstützt.');
    if ((schema.required || []).some(k => !Object.hasOwn(args, k))) fail('BROKER_ARGUMENTS_UNSUPPORTED', 'Für dieses cTrader-Werkzeug fehlen eindeutig zugeordnete Argumente.');
    for (const [k, v] of Object.entries(args)) if (!schemaValue(schema.properties?.[k], v)) fail('BROKER_ARGUMENTS_UNSUPPORTED', 'Das cTrader-Werkzeug verwendet ein unbekanntes Argumentformat.');
    const result = await this.rpc('tools/call', { name: tool.name, arguments: args });
    if (!object(result) || result.isError === true) fail('CTRADER_READ_REJECTED', 'cTrader hat die Datenabfrage abgelehnt.');
    let data = result.structuredContent;
    if (!object(data) && !Array.isArray(data)) {
      const pieces = Array.isArray(result.content) ? result.content.filter(x => x?.type === 'text') : [];
      if (pieces.length !== 1 || typeof pieces[0].text !== 'string') fail('BROKER_OUTPUT_UNSUPPORTED', 'cTrader hat keine strukturierten Daten geliefert.');
      try { data = JSON.parse(pieces[0].text); } catch { fail('BROKER_OUTPUT_UNSUPPORTED', 'Die cTrader-Ausgabe ist nicht als Datensatz lesbar.'); }
    }
    if (!object(data) && !Array.isArray(data) || data?.error || data?.isError === true) fail('BROKER_OUTPUT_UNSUPPORTED', 'Die cTrader-Datenantwort ist ungültig.');
    this.toolTimes[tool.name] = new Date().toISOString();
    return data;
  }
  async close() {
    if (!this.session || this.signal?.aborted) return;
    try {
      const headers = { 'Mcp-Session-Id': this.session, 'MCP-Protocol-Version': this.version };
      if (this.token) headers.authorization = 'Bearer ' + this.token;
      const deadline = AbortSignal.timeout(1000), signal = this.signal ? AbortSignal.any([this.signal, deadline]) : deadline;
      const r = await this.fetcher(this.url, { method: 'DELETE', headers, redirect: 'error', signal });
      await r.body?.cancel();
    } catch { /* Only the adapter's MCP session is ended; no broker state is changed. */ }
  }
}

function propertyInfo(schema, field, depth = 0) {
  if (!object(schema) || depth > 7) return null;
  if (object(schema.properties?.[field])) return schema.properties[field];
  for (const name of ['data', 'account', 'positions', 'symbols', 'prices', 'trendbars', 'candles', 'bars']) {
    const child = schema.properties?.[name];
    const result = propertyInfo(child?.items || child, field, depth + 1); if (result) return result;
  }
  return schema.items ? propertyInfo(schema.items, field, depth + 1) : null;
}
const description = (tool, field) => String(propertyInfo(tool?.outputSchema, field)?.description || '').toLowerCase();
function money(tool, row, field, digits) {
  if (row?.[field] === undefined || row[field] === null) return null;
  const d = description(tool, field);
  if (/unscaled|major units|unskaliert/.test(d)) return numeric(row[field]);
  if (/minor|cents?|scaled|moneydigits|10\s*\^/.test(d)) return scaled(row[field], digits);
  if (/currency|währung|monetary|major units/.test(d)) return numeric(row[field]);
  return null;
}
function price(tool, row, field, digits) {
  if (row?.[field] === undefined || row[field] === null) return null;
  const d = description(tool, field);
  if (/unscaled|actual price|display price|decimal price|anzeigepreis|unskaliert/.test(d)) return numeric(row[field]);
  if (/pipette|scaled|10\s*\^/.test(d)) return scaled(row[field], digits);
  return null;
}
function precision(symbol) {
  const candidates = [symbol?.pipDigits, symbol?.digits].filter(x => x !== undefined);
  if (!candidates.length || candidates.some(x => !Number.isInteger(x) || x < 0 || x > 8) || candidates.some(x => x !== candidates[0])) return null;
  return candidates[0];
}
function epochTime(tool, value) {
  if (typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value))) return Date.parse(value);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  const d = description(tool,'timestamp');
  const millis = /milliseconds?|epoch\s*ms|epoch.*millis|epoch.*\(ms\)/.test(d);
  const seconds = !millis && /epoch.*seconds?|unix.*seconds?/.test(d);
  const t = millis ? value : seconds ? value * 1000 : null;
  return Number.isSafeInteger(t) && t > 0 && t < 8640000000000000 ? t : null;
}
function accountArgs(tool, balance) {
  const args = {}, required = tool?.inputSchema?.required || [];
  for (const k of required) {
    if (!['accountId', 'ctidTraderAccountId'].includes(k)) continue;
    const identity = id(balance.ctidTraderAccountId ?? balance.accountId);
    if (identity) args[k] = tool.inputSchema.properties?.[k]?.type === 'integer' ? Number(identity) : identity;
  }
  return args;
}
async function fetchCatalogue(client, warnings) {
  const tool = client.select(['get_symbols']);
  if (!tool) { warnings.push('SYMBOL_CATALOGUE_UNAVAILABLE'); return { symbols: [], tool: null }; }
  const value = await client.call(tool), symbols = list(value, 'symbols');
  if (!symbols || symbols.length > 20000 || symbols.some(s => !object(s) || !id(s.symbolId) || !text(s.symbolName)))
    fail('SYMBOL_CATALOGUE_UNSUPPORTED', 'Die cTrader-Symbolliste besitzt ein unbekanntes Format.');
  if (new Set(symbols.map(s => id(s.symbolId))).size !== symbols.length) fail('SYMBOL_CATALOGUE_DUPLICATE', 'Die cTrader-Symbolliste enthält doppelte Kennungen.');
  return { symbols, tool };
}

async function snapshotFrom(client) {
  const startedAt = new Date().toISOString(), warnings = [];
  const balanceTool = client.select(['get_balance', 'get_account_summary', 'get_account_info', 'get_account_stats', 'get_account']);
  const positionsTool = client.select(['get_positions', 'get_open_positions']);
  const balance = unwrap(await client.call(balanceTool));
  if (!object(balance) || !Object.hasOwn(balance, 'balance')) fail('BALANCE_SHAPE_UNSUPPORTED', 'Der cTrader-Kontodatensatz besitzt ein unbekanntes Format.');
  const positionsRaw = unwrap(await client.call(positionsTool, accountArgs(positionsTool, balance))), positions = list(positionsRaw, 'positions');
  if (!positions || positions.length > 500) fail('POSITIONS_SHAPE_UNSUPPORTED', 'Die cTrader-Positionen besitzen ein unbekanntes Format.');
  if (positionsRaw.hasMore === true) warnings.push('POSITIONS_PARTIAL');
  const { symbols } = await fetchCatalogue(client, warnings);
  const symbolMap = new Map(symbols.map(s => [id(s.symbolId), s]));
  let assets = [];
  if (!text(balance.currency) && client.tools.has('get_assets')) {
    try { assets = list(await client.call(client.tools.get('get_assets')), 'assets') || []; }
    catch (e) { requireActive(client.signal); if (e.status === 401 || e.status === 403) throw e; warnings.push('ASSETS_UNAVAILABLE'); }
  }
  const currency = text(balance.currency) || text(assets.find(a => id(a?.assetId) === id(balance.depositAssetId))?.name);
  const moneyDigits = Number.isInteger(balance.moneyDigits) && balance.moneyDigits >= 0 && balance.moneyDigits <= 12 ? balance.moneyDigits : null;
  // REST and MCP versions may use different numeric units. The live advertised
  // output schema is authoritative; missing units remain null, never inferred
  // from the tool name, numeric magnitude or a different API's documentation.
  const account = { id: id(balance.ctidTraderAccountId ?? balance.accountId), currency: currency || 'Währung unbekannt',
    balance: money(balanceTool, balance, 'balance', moneyDigits), equity: money(balanceTool, balance, 'equity', moneyDigits),
    freeMargin: money(balanceTool, balance, 'freeMargin', moneyDigits), unrealizedPnl: money(balanceTool, balance, 'unrealizedPnl', moneyDigits),
    balanceVersion: id(balance.balanceVersion), moneyDigits };
  if ([account.balance, account.equity, account.freeMargin].some(x => x === null)) warnings.push('ACCOUNT_AMOUNT_UNITS_UNCONFIRMED');
  let quotes = [], quoteTool = client.select(['get_spot_prices', 'get_prices']);
  const ids = [...new Set(positions.map(p => id(p?.symbolId)).filter(Boolean))].slice(0,50);
  if (ids.length && quoteTool) {
    const properties = quoteTool.inputSchema.properties || {};
    const fields = ['symbolIds', 'symbolId'].filter(k => properties[k]?.type === 'array' && properties[k]?.items?.type === 'integer');
    if (fields.length === 1 && ids.every(s => Number.isSafeInteger(Number(s)))) {
      try { quotes = list(await client.call(quoteTool, { ...accountArgs(quoteTool, balance), [fields[0]]: ids.map(Number) }), 'prices') || []; }
      catch (e) { requireActive(client.signal); if ([401,403].includes(e.status)) throw e; warnings.push('QUOTES_UNAVAILABLE'); }
    } else warnings.push('QUOTE_SCHEMA_UNSUPPORTED');
  }
  const quoteMap = new Map(quotes.filter(object).map(q => [id(q.symbolId), q]));
  const rows = positions.map(p => {
    if (!object(p) || !id(p.positionId) || !id(p.symbolId)) fail('POSITION_SHAPE_UNSUPPORTED', 'Eine Position hat keine eindeutige Positions- und Symbolkennung.');
    const s = symbolMap.get(id(p.symbolId)), digits = precision(s), q = quoteMap.get(id(p.symbolId));
    let units = null;
    if (Object.hasOwn(p, 'volumeInUnits')) units = numeric(p.volumeInUnits);
    else if (/base units|in units|basiseinheiten/.test(description(positionsTool, 'volume'))) units = numeric(p.volume);
    else if (/hundredths of.*unit|0\.01.*unit/.test(description(positionsTool, 'volume'))) units = scaled(p.volume, 2);
    if (units === null && p.volume !== undefined) warnings.push('VOLUME_UNITS_UNCONFIRMED');
    if (digits === null) warnings.push('PRICE_PRECISION_MISSING');
    const side = typeof p.tradeSide === 'string' ? p.tradeSide.toUpperCase() : '';
    return { id: id(p.positionId), symbolId: id(p.symbolId), symbol: text(s?.symbolName) || text(p.symbolName) || id(p.symbolId),
      side: ['BUY','SELL'].includes(side) ? side : 'Unbekannt', units,
      entry: price(positionsTool,p,'entryPrice',digits), stop: price(positionsTool,p,'stopLoss',digits),
      target: price(positionsTool,p,'takeProfit',digits), unrealizedPnl: money(positionsTool,p,'unrealizedPnl',moneyDigits),
      commission: money(positionsTool,p,'commission',moneyDigits), swap: money(positionsTool,p,'swap',moneyDigits), label: text(p.label),
      bid: price(quoteTool,q,'bid',digits), ask: price(quoteTool,q,'ask',digits),
      quoteUtc: epochTime(quoteTool,q?.timestamp) === null ? null : new Date(epochTime(quoteTool,q?.timestamp)).toISOString(),
      pricePrecisionKnown: digits !== null, moneyPrecisionKnown: moneyDigits !== null };
  });
  if (new Set(rows.map(r => r.id)).size !== rows.length) fail('DUPLICATE_POSITIONS', 'cTrader hat eine Position mehrfach geliefert.');
  const endBalance=unwrap(await client.call(balanceTool));
  const finalId=id(endBalance?.ctidTraderAccountId??endBalance?.accountId);
  const initialEnvironment=accountEnvironment(balance), finalEnvironment=accountEnvironment(endBalance);
  if (account.id && finalId && account.id!==finalId || balance.currency && endBalance?.currency && balance.currency!==endBalance.currency ||
      initialEnvironment !== 'unconfirmed' && finalEnvironment !== 'unconfirmed' && initialEnvironment !== finalEnvironment)
    fail('ACCOUNT_CHANGED_DURING_READ','Das aktive cTrader-Konto hat sich während der Abfrage geändert. Bitte erneut laden.',409);
  if (!account.id || !finalId) warnings.push('ACCOUNT_IDENTITY_UNCONFIRMED');
  const env = initialEnvironment === finalEnvironment ? initialEnvironment : 'unconfirmed';
  if (env === 'unconfirmed') warnings.push('ACCOUNT_ENVIRONMENT_UNCONFIRMED');
  const pending = Array.isArray(positionsRaw.pendingOrders) ? positionsRaw.pendingOrders : Array.isArray(positionsRaw.orders) ? positionsRaw.orders : null;
  return { source: client.mode === 'local' ? 'CTRADER_LOCAL_MCP_DATA' : 'CTRADER_REMOTE_MCP_DATA', connectionMode: client.mode,
    readOnly: true, botInternalsAvailable: false, autoTrading: false, startedAt, observedAt: new Date().toISOString(), nonAtomicSnapshot: true, toolTimes: client.toolTimes,
    environment: env, environmentClaim: env === 'unconfirmed' ? 'Kontotyp nicht vom Datensatz bestätigt' : 'Vom Kontodatensatz gemeldet', account,
    positions: rows, positionCount: rows.length, pendingCount: pending?.length ?? null,
    catalogue: symbols.map(s => ({ id:id(s.symbolId), symbol:s.symbolName, digits:precision(s) })),
    partial: warnings.length > 0, warnings:[...new Set(warnings)], pnlMeaning:'Nur gelieferte Kontowerte; kein Nachweis eines Strategieertrags.' };
}

async function withClient(config, fetcher, signal, run) {
  const client = new ReadMcp(config, fetcher, signal);
  try { await client.initialize(); return await run(client); } finally { await client.close(); requireActive(signal); }
}
export async function readBroker(config, { fetcher = fetch, signal } = {}) { return withClient(config, fetcher, signal, snapshotFrom); }
export async function probeBroker(config, { fetcher = fetch, signal } = {}) {
  return withClient(config, fetcher, signal, async c => {
    const snapshot = await snapshotFrom(c);
    return { connected:true, mode:c.mode, readOnly:true, snapshot,
      tools:[...c.tools.values()].map(t => ({ name:t.name, inputSchema:t.inputSchema, ...(t.outputSchema ? { outputSchema:t.outputSchema } : {}) })),
      capabilities:{account:true,positions:true,candles:false,candleToolAvailable:!!c.select(['get_trendbars','get_candles','get_historical_candles'])}, protocolVersion:c.version };
  });
}

function candleArgs(tool, query, symbol) {
  const p = tool.inputSchema.properties || {}, args = {};
  if (p.symbolId) args.symbolId = p.symbolId.type === 'integer' ? Number(query.symbolId) : String(query.symbolId);
  else if (p.symbolName?.type === 'string') args.symbolName = symbol.symbolName;
  else fail('CANDLE_SCHEMA_UNSUPPORTED', 'Die Kursabfrage hat keine eindeutig zuordenbare Symbolkennung.');
  if (!p.period || p.period.type !== 'string') fail('CANDLE_SCHEMA_UNSUPPORTED', 'Der Zeitraum kann diesem Kurswerkzeug nicht zugeordnet werden.');
  args.period = query.period;
  const count = 300, end = new Date(), start = new Date(end.getTime() - PERIODS[query.period] * count);
  if (p.count?.type === 'integer') args.count = Math.min(count, p.count.maximum ?? count);
  for (const [key, date] of [['fromTimestamp',start],['toTimestamp',end]]) {
    if (p[key]?.type === 'string') args[key] = date.toISOString();
    else if (p[key] && (tool.inputSchema.required || []).includes(key)) fail('CANDLE_TIMESTAMP_UNSUPPORTED', 'Das Kurswerkzeug verwendet ein nicht bestätigtes Zeitformat.');
  }
  return args;
}
export async function readBrokerChart(config, query, { fetcher = fetch, signal } = {}) {
  if (!object(query) || !id(query.symbolId) || !PERIODS[query.period]) fail('CHART_QUERY_INVALID', 'Instrument oder Zeitraum ist ungültig.', 400);
  return withClient(config, fetcher, signal, async c => {
    const warnings = [], {symbols} = await fetchCatalogue(c,warnings);
    let symbol = symbols.find(s => id(s.symbolId) === String(query.symbolId));
    if (!symbol) fail('SYMBOL_UNAVAILABLE', 'Das Instrument ist auf diesem Konto nicht verfügbar.', 404);
    if (precision(symbol) === null) {
      const detailsTool = c.select(['get_symbol_details','get_symbol']);
      if (detailsTool?.inputSchema?.properties?.symbolId) {
        const arg = detailsTool.inputSchema.properties.symbolId.type === 'integer' ? Number(query.symbolId) : String(query.symbolId);
        const details = unwrap(await c.call(detailsTool,{symbolId:arg}));
        if (object(details) && id(details.symbolId) === String(query.symbolId)) symbol = {...symbol,...details};
      }
    }
    const digits = precision(symbol);
    if (digits === null) fail('PRICE_PRECISION_MISSING', 'cTrader hat die Preispräzision dieses Instruments nicht eindeutig geliefert.');
    const tool = c.select(['get_trendbars','get_candles','get_historical_candles']);
    if (!tool) fail('CANDLE_TOOL_UNAVAILABLE', 'Dieser cTrader-Anschluss bietet kein unterstütztes Kurswerkzeug.');
    const data = unwrap(await c.call(tool,candleArgs(tool,query,symbol)));
    const raw = Array.isArray(data) ? data : ['trendbars','candles','bars'].map(k => data?.[k]).find(Array.isArray);
    if (!raw || raw.length > 500) fail('CANDLE_OUTPUT_UNSUPPORTED', 'Die gelieferten Kerzendaten besitzen ein unbekanntes Format.');
    if (data.symbolId !== undefined && String(data.symbolId) !== String(query.symbolId) || data.period !== undefined && data.period !== query.period)
      fail('CANDLE_IDENTITY_MISMATCH', 'Die gelieferten Kurse gehören zu einem anderen Instrument oder Zeitraum.');
    const bars = raw.map(row => {
      if (!object(row)) fail('CANDLE_OUTPUT_UNSUPPORTED', 'Eine Kurskerze ist ungültig.');
      const time=epochTime(tool,row.timestamp);
      if (time === null) fail('CANDLE_TIME_UNSUPPORTED', 'Die Kerzenzeit ist nicht eindeutig als UTC-Zeitstempel verfügbar.');
      const bar = {time};
      for (const key of ['open','high','low','close']) {
        const value = price(tool,row,key,digits);
        if (value === null || !Number.isFinite(Number(value))) fail('CANDLE_PRICE_UNSUPPORTED', 'Die Einheit der Kursdaten ist nicht bestätigt.');
        bar[key] = Number(value);
      }
      if (bar.high < Math.max(bar.open,bar.close,bar.low) || bar.low > Math.min(bar.open,bar.close,bar.high)) fail('CANDLE_RANGE_INVALID', 'Eine Kurskerze enthält widersprüchliche Werte.');
      return bar;
    }).sort((a,b) => a.time-b.time);
    if (bars.some((b,i) => i && b.time === bars[i-1].time)) fail('CANDLE_DUPLICATE_TIME', 'Die Kursdaten enthalten doppelte Zeitpunkte.');
    return { source:c.mode === 'local' ? 'CTRADER_LOCAL_MCP_DATA' : 'CTRADER_REMOTE_MCP_DATA', connectionMode:c.mode, readOnly:true,
      symbolId:String(query.symbolId),symbol:symbol.symbolName,period:query.period,digits,mode:'price',bars,observedAt:new Date().toISOString(),
      coverage:bars.length ? {from:new Date(bars[0].time).toISOString(),to:new Date(bars.at(-1).time).toISOString(),count:bars.length} : null,
      tool:tool.name,partial:data.hasMore === true,warnings:data.hasMore === true ? ['CANDLES_PARTIAL'] : [] };
  });
}
