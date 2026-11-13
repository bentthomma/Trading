"""ExtremeLab read-only telemetry relay. NOT an order-execution service.

Listen privately behind TLS on 443 (reader) and 25345 (cTrader writer).
SQLite FULL transactions precede every durable acknowledgement. No cloud
compatibility is implied by this implementation; run the separate probe first.
"""
from __future__ import annotations
import asyncio
import contextlib
import hashlib
import hmac
import json
import os
import re
import shutil
import sqlite3
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from aiohttp import web, WSMsgType

ID = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
KINDS = re.compile(r"^[A-Z][A-Z0-9_]{0,47}$")
MAX_FRAME = 512 * 1024
MAX_EVENT = 64 * 1024
MAX_READ = 2400 * 1024
MAX_SEQ = 9007199254740991

class ProtocolError(ValueError):
    pass


def utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def strict_json(text: str) -> Any:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ProtocolError('DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    def invalid(value):
        raise ProtocolError('NONFINITE_JSON_NUMBER')
    try:
        return json.loads(text, object_pairs_hook=unique, parse_constant=invalid)
    except (ValueError, RecursionError) as exc:
        raise ProtocolError('INVALID_JSON') from exc


def canonical(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':'))
    except (ValueError, TypeError, RecursionError) as exc:
        raise ProtocolError('INVALID_EVENT') from exc


def timestamp(value: Any) -> float:
    if not isinstance(value, str) or not 10 <= len(value) <= 40:
        raise ProtocolError('INVALID_TIME')
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            raise ValueError('timezone required')
        result = dt.timestamp()
        if result < 946684800 or result > time.time() + 120:
            raise ValueError('time out of range')
        return result
    except (ValueError, OverflowError) as exc:
        raise ProtocolError('INVALID_TIME') from exc


def checked_event(event: Any, run: str) -> tuple[str, str, float]:
    if not isinstance(event, dict) or event.get('schema') != 2 or isinstance(event.get('schema'), bool):
        raise ProtocolError('SCHEMA_2_REQUIRED')
    if event.get('run') != run:
        raise ProtocolError('RUN_MISMATCH')
    seq = event.get('seq')
    if type(seq) is not int or not 1 <= seq <= MAX_SEQ:
        raise ProtocolError('INVALID_SEQUENCE')
    kind = event.get('kind')
    if not isinstance(kind, str) or not KINDS.fullmatch(kind):
        raise ProtocolError('INVALID_KIND')
    if not isinstance(event.get('data'), dict):
        raise ProtocolError('OBJECT_DATA_REQUIRED')
    t = timestamp(event.get('utc'))
    raw = canonical(event)
    if len(raw.encode()) > MAX_EVENT:
        raise ProtocolError('EVENT_TOO_LARGE')
    return raw, hashlib.sha256(raw.encode()).hexdigest(), t


class Store:
    """One process per database. All connections serialized, I/O off the event loop."""
    def __init__(self, path: str, max_payload_bytes: int = 256 * 1024 * 1024):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.max_payload_bytes = max_payload_bytes
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.path), check_same_thread=False, isolation_level=None)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS runs (
          run TEXT PRIMARY KEY, first_received TEXT NOT NULL, environment TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (
          cursor INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, seq INTEGER NOT NULL,
          kind TEXT NOT NULL, symbol TEXT NOT NULL, event_time REAL NOT NULL,
          received TEXT NOT NULL, hash TEXT NOT NULL, raw TEXT NOT NULL, bytes INTEGER NOT NULL,
          UNIQUE(run,seq));
        CREATE INDEX IF NOT EXISTS event_run_cursor ON events(run,cursor);
        CREATE INDEX IF NOT EXISTS event_snapshot ON events(run,kind,symbol,seq);
        CREATE TABLE IF NOT EXISTS batches (
          run TEXT NOT NULL, batch TEXT NOT NULL, hash TEXT NOT NULL,
          ack TEXT NOT NULL, PRIMARY KEY(run,batch));
        CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
        INSERT OR IGNORE INTO meta VALUES ('payload_bytes',0);
        ''')

    def commit(self, message: dict, run: str, environment: str) -> dict:
        if set(message) != {'type','batch','events'} or message['type'] != 'batch':
            raise ProtocolError('INVALID_BATCH')
        batch = message['batch']
        if not isinstance(batch, str) or not ID.fullmatch(batch):
            raise ProtocolError('INVALID_BATCH_ID')
        items = message['events']
        if not isinstance(items, list) or not 1 <= len(items) <= 64:
            raise ProtocolError('BATCH_COUNT')
        parsed = [(e, *checked_event(e, run)) for e in items]
        if len({e['seq'] for e in items}) != len(items):
            raise ProtocolError('DUPLICATE_SEQUENCE_IN_BATCH')
        digest = hashlib.sha256(canonical(message).encode()).hexdigest()
        now = utc()
        with self.lock:
            old = self.db.execute('SELECT hash,ack FROM batches WHERE run=? AND batch=?',(run,batch)).fetchone()
            if old:
                if not hmac.compare_digest(old[0],digest):
                    raise ProtocolError('BATCH_CONTENT_CONFLICT')
                return json.loads(old[1])
            if shutil.disk_usage(self.path.parent).free < 32*1024*1024:
                raise ProtocolError('STORAGE_LOW_NO_ACK')
            self.db.execute('BEGIN IMMEDIATE')
            try:
                existing = self.db.execute('SELECT environment FROM runs WHERE run=?',(run,)).fetchone()
                if existing and existing[0] != environment:
                    raise ProtocolError('ENVIRONMENT_CONFLICT')
                self.db.execute('INSERT OR IGNORE INTO runs VALUES (?,?,?)',(run,now,environment))
                total = self.db.execute("SELECT value FROM meta WHERE name='payload_bytes'").fetchone()[0]
                added = 0
                for e, raw, eh, ts in parsed:
                    prev = self.db.execute('SELECT hash FROM events WHERE run=? AND seq=?',(run,e['seq'])).fetchone()
                    if prev:
                        if not hmac.compare_digest(prev[0],eh):
                            raise ProtocolError('SEQUENCE_CONTENT_CONFLICT')
                        continue
                    size = len(raw.encode())
                    if total + size > self.max_payload_bytes:
                        raise ProtocolError('STORAGE_LIMIT_NO_ACK')
                    symbol = e['data'].get('Symbol', e['data'].get('symbol',''))
                    if not isinstance(symbol, str) or len(symbol)>100 or any(ord(x)<32 for x in symbol):
                        raise ProtocolError('INVALID_SYMBOL')
                    self.db.execute('INSERT INTO events(run,seq,kind,symbol,event_time,received,hash,raw,bytes) VALUES(?,?,?,?,?,?,?,?,?)',
                                    (run,e['seq'],e['kind'],symbol,ts,now,eh,raw,size))
                    total += size
                    added += 1
                cursor = self.db.execute('SELECT MAX(cursor) FROM events WHERE run=?',(run,)).fetchone()[0] or 0
                ack = dict(type='ack',batch=batch,durable=True,run=run,cursor=cursor,accepted=len(items),inserted=added,storedUtc=now)
                self.db.execute('INSERT INTO batches VALUES (?,?,?,?)',(run,batch,digest,canonical(ack)))
                self.db.execute("UPDATE meta SET value=? WHERE name='payload_bytes'",(total,))
                self.db.execute('COMMIT')
                return ack
            except BaseException:
                self.db.execute('ROLLBACK')
                raise

    def latest_run(self) -> str | None:
        with self.lock:
            row = self.db.execute('SELECT run FROM events ORDER BY cursor DESC LIMIT 1').fetchone()
            return row[0] if row else None

    def state(self, run: str | None) -> dict:
        if not run:
            return dict(run=None,lastEventUtc=None,missingSequenceCount=0)
        with self.lock:
            row = self.db.execute('SELECT COUNT(*),MIN(seq),MAX(seq),MAX(event_time),MAX(cursor) FROM events WHERE run=?',(run,)).fetchone()
            env = self.db.execute('SELECT environment FROM runs WHERE run=?',(run,)).fetchone()
            count, lo, hi, last, cursor = row
            return dict(run=run,receivedEvents=count,firstSequence=lo,lastSequence=hi,cursor=cursor or 0,
                        # A new run starts at 1; prefix gaps are gaps too.
                        missingSequenceCount=max(0,(hi or 0)-count),
                        lastEventUtc=datetime.fromtimestamp(last,timezone.utc).isoformat() if last else None,
                        reportedEnvironment=env[0] if env else None)

    def events(self, run: str, after: int, symbol: str | None = None, snapshot: bool = False) -> dict:
        """Bounded projection preserving all observed parts of the latest checkpoint.

        XL2 v1.2 does not declare totalParts/checkpointEnd. Consequently contiguous
        observed parts are NOT proof that the last part arrived. Report this
        uncertainty instead of silently calling the snapshot complete.
        """
        with self.lock:
            count, lo, hi, maximum = self.db.execute(
                'SELECT COUNT(*),MIN(seq),MAX(seq),MAX(cursor) FROM events WHERE run=?',
                (run,)).fetchone()
            maximum = maximum or 0
            stored_complete = bool(count and lo == 1 and count == hi)
            checkpoint = None
            more = False
            if snapshot:
                if symbol is None:
                    raise ProtocolError('SNAPSHOT_SYMBOL_REQUIRED')
                # State types use their last event; candles are a multipart stream.
                sql = '''SELECT e.cursor,e.raw,e.bytes FROM events e
                 JOIN (SELECT MAX(seq) seq,kind FROM events
                       WHERE run=? AND symbol=? AND kind NOT IN ('BARS','BAR') GROUP BY kind) s
                   ON e.seq=s.seq AND e.kind=s.kind
                 WHERE e.run=? AND e.symbol=? ORDER BY e.seq'''
                rows = self.db.execute(sql,(run,symbol,run,symbol)).fetchall()
                start = self.db.execute(
                    "SELECT MAX(seq) FROM events WHERE run=? AND symbol=? AND kind='BARS' "
                    "AND json_extract(raw,'$.data.part')=0",(run,symbol)).fetchone()[0]
                # Missing part zero must remain explicitly incomplete.
                floor = start if start is not None else 0
                chunks = self.db.execute(
                    "SELECT cursor,raw,bytes FROM events WHERE run=? AND symbol=? AND kind='BARS' "
                    "AND seq>=? ORDER BY seq DESC LIMIT 129",(run,symbol,floor)).fetchall()
                chunks.reverse()
                updates = self.db.execute(
                    "SELECT cursor,raw,bytes FROM events WHERE run=? AND symbol=? AND kind='BAR' "
                    "AND seq>=? ORDER BY seq DESC LIMIT 81",(run,symbol,floor)).fetchall()
                updates.reverse()
                if len(chunks)>128 or len(updates)>80:
                    more=True
                chunk_events=[json.loads(r[1]) for r in chunks]
                if chunk_events:
                    parts=[e['data'].get('part') for e in chunk_events]
                    integers=all(type(x) is int and 0<=x<=10000 for x in parts)
                    contiguous=integers and parts==list(range(len(parts)))
                    declared=chunk_events[0]['data'].get('totalParts')
                    declared_ok=type(declared) is int and 1<=declared<=128
                    declarations_consistent=declared_ok and all(e['data'].get('totalParts')==declared for e in chunk_events)
                    complete=(contiguous and len(parts)==declared) if declarations_consistent else None
                    # Retain raw telemetry, but never infer a usable candle snapshot
                    # from malformed payloads already acknowledged by the journal.
                    invalid_payloads=[e['seq'] for e in chunk_events
                        if not isinstance(e['data'].get('candles'),list)
                        or any(not isinstance(c,dict) for c in e['data']['candles'])]
                    if invalid_payloads:
                        complete=False
                    checkpoint=dict(firstSequence=start,observedParts=parts,
                        declaredParts=declared if declared_ok else None,complete=complete,
                        completeness= 'invalid_candle_payload' if invalid_payloads else
                            'verified_declared_parts' if complete is True else
                            'missing_or_inconsistent_parts' if not contiguous or declared_ok else
                            'unknown_total_parts_not_declared',
                        candlesObserved=sum(len(e['data']['candles']) for e in chunk_events
                            if e['seq'] not in invalid_payloads),
                        invalidPayloadSequences=invalid_payloads)
                    if invalid_payloads or not contiguous or (declared_ok and complete is not True):
                        more=True
                # Sort by event sequence, never by late arrival order.
                rows=sorted(rows+chunks+updates,key=lambda r:json.loads(r[1])['seq'])
            else:
                rows=self.db.execute(
                    'SELECT cursor,raw,bytes FROM events WHERE run=? AND cursor>? ORDER BY cursor LIMIT 129',
                    (run,after)).fetchall()
            data,size,cursor=[],0,after
            for c,raw,n in rows:
                if (len(data)>=128 and not snapshot) or size+n>MAX_READ:
                    more=True
                    break
                data.append(json.loads(raw));size+=n;cursor=c
            if snapshot:
                cursor=maximum
            return dict(run=run,events=data,cursor=cursor,hasMore=more and not snapshot,
                        partialSnapshot=more if snapshot else False,snapshot=snapshot,
                        checkpoint=checkpoint,storedHistoryComplete=stored_complete,
                        missingPrefix=max(0,(lo or 1)-1),
                        missingWithinObservedRange=max(0,(hi or 0)-(lo or 1)+1-count),
                        historyComplete=bool(not snapshot and stored_complete and not more and after==0))

    def close(self):
        with self.lock:
            self.db.close()


@dataclass
class Connection:
    run: str | None = None
    environment: str | None = None
    last_contact: float | None = None
    active: bool = False


class Relay:
    def __init__(self, store: Store, writer: str, reader: str):
        if len(writer)<32 or len(reader)<32 or hmac.compare_digest(writer,reader):
            raise ValueError('Use distinct writer/read keys of at least 32 characters')
        self.store,self.writer,self.reader = store,writer,reader
        self.connection=Connection()
        self.producer_lock=asyncio.Lock()
        self.sessions=set()

    async def status(self, run: str | None = None) -> dict:
        run = run or await asyncio.to_thread(self.store.latest_run)
        state = await asyncio.to_thread(self.store.state,run)
        c=self.connection
        contact=c.last_contact if c.run==run else None
        age=max(0,time.time()-contact) if contact else None
        event_age=None
        if state['lastEventUtc']:
            event_age=max(0,time.time()-datetime.fromisoformat(state['lastEventUtc']).timestamp())
        return dict(**state,producerConnected=bool(c.active and c.run==run),
                    lastContact=datetime.fromtimestamp(contact,timezone.utc).isoformat() if contact else None,
                    secondsSinceContact=age,dataAgeSeconds=event_age,
                    dataFresh=bool(c.active and age is not None and age<45 and event_age is not None and event_age<45),
                    persistence='sqlite-full-local-disk',cloudVerified=False,
                    verification='Environment is sender-reported, not independently attested')

    async def websocket(self, request: web.Request):
        if request.query_string or request.headers.get('Origin'):
            raise web.HTTPForbidden(text='WRITER_ONLY')
        ws=web.WebSocketResponse(max_msg_size=MAX_FRAME,heartbeat=15,compress=False,receive_timeout=35)
        if len(self.sessions)>=8:
            raise web.HTTPServiceUnavailable(text='CONNECTION_LIMIT')
        await ws.prepare(request);self.sessions.add(ws)
        owns=False
        try:
            raw=await asyncio.wait_for(ws.receive(),5)
            if raw.type!=WSMsgType.TEXT:raise ProtocolError('AUTH_REQUIRED')
            auth=strict_json(raw.data)
            if not isinstance(auth,dict) or set(auth)!={'type','key','run','environment'} or auth.get('type')!='auth':
                raise ProtocolError('AUTH_REQUIRED')
            if not isinstance(auth['key'],str) or len(auth['key'])>200 or not hmac.compare_digest(auth['key'].encode(),self.writer.encode()):
                raise ProtocolError('AUTH_REJECTED')
            run,environment=auth['run'],auth['environment']
            if not isinstance(run,str) or not ID.fullmatch(run) or environment not in {'test','cloud','desktop','cli'}:
                raise ProtocolError('INVALID_SENDER')
            if self.producer_lock.locked():raise ProtocolError('PRODUCER_ALREADY_CONNECTED')
            await self.producer_lock.acquire();owns=True
            self.connection=Connection(run,environment,time.time(),True)
            await ws.send_json(dict(type='authenticated',readOnly=True,run=run))
            last_batch_time=0.0
            async for raw in ws:
                if raw.type!=WSMsgType.TEXT:
                    if raw.type in {WSMsgType.CLOSE,WSMsgType.CLOSED,WSMsgType.ERROR}:break
                    raise ProtocolError('TEXT_REQUIRED')
                m=strict_json(raw.data)
                if not isinstance(m,dict):raise ProtocolError('OBJECT_REQUIRED')
                if m=={'type':'ping'}:
                    self.connection.last_contact=time.time()
                    await ws.send_json(dict(type='pong',serverUtc=utc()));continue
                if m.get('type')!='batch':raise ProtocolError('UNSUPPORTED_OPERATION')
                # Bound authenticated ingress, never acknowledge without storage.
                if time.monotonic()-last_batch_time<0.02:raise ProtocolError('SEND_RATE_LIMIT')
                last_batch_time=time.monotonic()
                ack=await asyncio.to_thread(self.store.commit,m,run,environment)
                self.connection.last_contact=time.time()
                await ws.send_json(ack)
        except (ProtocolError,asyncio.TimeoutError) as exc:
            code=str(exc) if isinstance(exc,ProtocolError) else 'AUTH_TIMEOUT'
            if not ws.closed:
                with contextlib.suppress(Exception):
                    await ws.send_json(dict(type='error',code=code,durable=False))
                    await ws.close(code=1008,message=b'Invalid telemetry request')
        except Exception:
            # Never send exception strings, request bodies, tokens or SQL back to clients.
            if not ws.closed:
                with contextlib.suppress(Exception):
                    await ws.send_json(dict(type='error',code='STORAGE_OR_CONNECTION_ERROR_NO_ACK',durable=False))
                    await ws.close(code=1011,message=b'No durable acknowledgement')
        finally:
            self.sessions.discard(ws)
            if owns:
                self.connection.active=False
                self.producer_lock.release()
            with contextlib.suppress(Exception):await ws.close()
        return ws

    async def read(self,request: web.Request):
        supplied=request.headers.get('Authorization','')
        if not hmac.compare_digest(supplied.encode(),('Bearer '+self.reader).encode()):
            raise web.HTTPUnauthorized(text='READ_AUTH_REQUIRED')
        if request.method!='GET':raise web.HTTPMethodNotAllowed(request.method,['GET'])
        run=request.query.get('run')
        if run is not None and not ID.fullmatch(run):raise web.HTTPBadRequest(text='INVALID_RUN')
        symbol=request.query.get('symbol')
        if symbol is not None and (not 1<=len(symbol)<=100 or any(ord(c)<32 for c in symbol)):
            raise web.HTTPBadRequest(text='INVALID_SYMBOL')
        try:
            after=int(request.query.get('after','0'))
            if not 0<=after<=MAX_SEQ:raise ValueError()
        except ValueError:raise web.HTTPBadRequest(text='INVALID_CURSOR')
        path=request.path
        if path=='/snapshot' and symbol is None:raise web.HTTPBadRequest(text='SNAPSHOT_SYMBOL_REQUIRED')
        if path!='/snapshot' and symbol is not None:raise web.HTTPBadRequest(text='SYMBOL_ONLY_FOR_SNAPSHOT')
        active=await asyncio.to_thread(self.store.latest_run)
        reset=path=='/live' and run!=active
        selected=active if path=='/live' else run or active
        state=await self.status(selected)
        if path=='/status':return web.json_response(dict(status=state,readOnly=True),headers={'Cache-Control':'no-store'})
        if not selected:
            result=dict(events=[],cursor=0,run=None,hasMore=False,partialSnapshot=False)
        else:
            result=await asyncio.to_thread(self.store.events,selected,0 if reset else after,symbol,path=='/snapshot')
        if result.get('hasMore'):
            state['catchingUp']=True
            state['dataFresh']=False
        result.update(status=state,reset=reset,readOnly=True,serverUtc=utc())
        return web.json_response(result,headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})

    def app(self) -> web.Application:
        app=web.Application(client_max_size=MAX_FRAME)
        app.router.add_get('/ws',self.websocket)
        for path in ['/live','status','snapshot','events']:
            if not path.startswith('/'):path='/'+path
            app.router.add_get(path,self.read)
        async def health(_):
            return web.json_response(dict(service='ExtremeLabRelay',version='1.3.3-qa',readOnly=True),headers={'Cache-Control':'no-store'})
        app.router.add_get('/health',health)
        async def stop(_):
            await asyncio.gather(*(ws.close(code=1001,message=b'Shutdown') for ws in list(self.sessions)),return_exceptions=True)
        app.on_shutdown.append(stop)
        return app


def main():
    # Plain HTTP ONLY on loopback. A TLS reverse proxy is mandatory for public use.
    writer=os.environ['XL_WRITER_TOKEN']
    reader=os.environ['XL_READER_TOKEN']
    store=Store(os.environ.get('XL_DB','/var/lib/extremelab/events.sqlite'))
    relay=Relay(store,writer,reader)
    try:web.run_app(relay.app(),host='127.0.0.1',port=8765,access_log=None)
    finally:store.close()

if __name__=='__main__':main()
