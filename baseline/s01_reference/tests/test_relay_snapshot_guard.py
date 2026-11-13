"""Offline tests of the actual archived relay, SQLite and Unix HTTP/WebSocket.

No replacement relay, fake store, monkeypatched clock, broker or IP connection.
S01_RELAY_SOURCE selects a private source copy only for explicit counterchecks.
"""
from __future__ import annotations
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
import zipfile

import aiohttp
from aiohttp import web
ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('S01_RELAY_SOURCE', str(ROOT / 'proposals/relay-snapshot-guard/relay.py')))
spec = importlib.util.spec_from_file_location('relay_snapshot_subject', SOURCE)
relay = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = relay
spec.loader.exec_module(relay)
WRITER='offline-synthetic-writer-'+'w'*40
READER='offline-synthetic-reader-'+'r'*40
RUN='synthetic-snapshot-run'
OMITTED=object()

def event(seq, candles=OMITTED, *, part=0, total=1, symbol='EURUSD', run=RUN, kind='BARS'):
    data={'symbol':symbol,'part':part}
    if total is not OMITTED: data['totalParts']=total
    if candles is not OMITTED: data['candles']=candles
    return dict(schema=2,run=run,seq=seq,utc=relay.utc(),kind=kind,data=data)

def batch(*items, bid=None):
    return dict(type='batch',batch=bid or 'batch-'+str(items[0]['seq']),events=list(items))

def candle(n=1):
    return {'t':n,'o':1.25,'h':1.5,'l':1.0,'c':1.4,'v':7}

class SourceTests(unittest.TestCase):
    def test_exact_source_and_unchanged_writer_methods(self):
        import ast
        archive=ROOT/'baseline/original_engine121_source.zip'
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),'8baa784faa8fada648b30ff8b81d99edd21958149dbde1fd5a720459319c3c43')
        with zipfile.ZipFile(archive) as z:
            original=z.read('ExtremeLab_1_2_1_Integrationskandidat/relay/relay.py')
        self.assertEqual(original,(ROOT/'baseline/relay_snapshot/relay.py').read_bytes())
        old=ast.parse(original);new=ast.parse(SOURCE.read_bytes())
        for cls,method in [('Store','commit'),('Relay','websocket'),('Relay','read')]:
            def method_ast(tree):
                c=next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name==cls)
                return ast.dump(next(x for x in c.body if getattr(x,'name',None)==method),include_attributes=False)
            self.assertEqual(method_ast(old),method_ast(new),(cls,method))
    def test_ip_sockets_denied_but_unix_works(self):
        for family in (socket.AF_INET,socket.AF_INET6,socket.AF_PACKET):
            with self.subTest(family=family), self.assertRaises(PermissionError): socket.socket(family)
        a,b=socket.socketpair()
        try:a.sendall(b'private');self.assertEqual(b.recv(7),b'private')
        finally:a.close();b.close()

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'events.sqlite';self.store=relay.Store(str(self.path))
    def tearDown(self):self.store.close();self.tmp.cleanup()
    def commit(self,*items,bid=None):return self.store.commit(batch(*items,bid=bid),items[0]['run'],'test')
    def snapshot(self,symbol='EURUSD',run=RUN):return self.store.events(run,0,symbol,True)
    def assert_bad(self,result,seqs):
        self.assertTrue(result['partialSnapshot']);self.assertFalse(result['hasMore'])
        self.assertIs(result['checkpoint']['complete'],False)
        self.assertEqual(result['checkpoint']['completeness'],'invalid_candle_payload')
        self.assertEqual(result['checkpoint']['invalidPayloadSequences'],seqs)
    def test_invalid_containers_never_crash_or_claim_complete(self):
        for i,payload in enumerate([OMITTED,None,True,42,3.14,'not-candles',{'0':candle()}],1):
            e=event(i,payload,symbol='S'+str(i));ack=self.commit(e)
            self.assertTrue(ack['durable'])
            r=self.snapshot('S'+str(i));self.assert_bad(r,[i]);self.assertEqual(r['checkpoint']['candlesObserved'],0)
            self.assertEqual(r['events'],[e])
    def test_invalid_array_members_are_explicit(self):
        for i,payload in enumerate([[None],[42],['text'],[[]],[candle(),None]],1):
            e=event(i,payload,symbol='S'+str(i));self.commit(e)
            r=self.snapshot('S'+str(i));self.assert_bad(r,[i]);self.assertEqual(r['events'],[e]);self.assertEqual(r['checkpoint']['candlesObserved'],0)
    def test_valid_multipart_late_arrival_is_complete_and_sequence_ordered(self):
        a,b=event(1,[candle(1)],part=0,total=2),event(2,[candle(2)],part=1,total=2)
        self.commit(b);self.commit(a)
        r=self.snapshot();self.assertEqual(r['events'],[a,b]);self.assertTrue(r['checkpoint']['complete']);self.assertFalse(r['partialSnapshot']);self.assertEqual(r['checkpoint']['candlesObserved'],2)
        self.assertEqual(r['checkpoint']['invalidPayloadSequences'],[])
    def test_empty_array_retains_existing_completeness_semantics(self):
        self.commit(event(1,[]));r=self.snapshot();self.assertTrue(r['checkpoint']['complete']);self.assertEqual(r['checkpoint']['candlesObserved'],0)
    def test_mixed_good_and_bad_parts_preserve_raw_history(self):
        a,b=event(1,[candle()],part=0,total=2),event(2,'bad',part=1,total=2)
        self.commit(a,b);r=self.snapshot();self.assert_bad(r,[2]);self.assertEqual(r['checkpoint']['candlesObserved'],1)
        self.assertEqual(self.store.events(RUN,0)['events'],[a,b])
    def test_snapshot_does_not_mutate_database_or_ack_on_reopen(self):
        e=event(1,None);ack=self.commit(e);before=self.store.db.execute('SELECT cursor,raw,hash FROM events').fetchall()
        self.assert_bad(self.snapshot(),[1]);self.store.close();self.store=relay.Store(str(self.path))
        self.assert_bad(self.snapshot(),[1]);self.assertEqual(self.commit(e),ack)
        self.assertEqual(self.store.db.execute('SELECT cursor,raw,hash FROM events').fetchall(),before)
    def test_new_checkpoint_recovers_without_deleting_old_events(self):
        a,b=event(1,42),event(2,[candle(2)])
        self.commit(a);self.assert_bad(self.snapshot(),[1]);self.commit(b)
        r=self.snapshot();self.assertEqual(r['events'],[b]);self.assertTrue(r['checkpoint']['complete']);self.assertFalse(r['partialSnapshot'])
        self.assertEqual(self.store.events(RUN,0)['events'],[a,b])
    def test_bad_symbol_and_run_do_not_poison_other_snapshots(self):
        self.commit(event(1,None,symbol='BAD'));good=event(2,[candle()],symbol='GOOD');self.commit(good)
        other=event(1,[candle()],run='other');self.commit(other)
        self.assertTrue(self.snapshot('GOOD')['checkpoint']['complete']);self.assertTrue(self.snapshot(run='other')['checkpoint']['complete'])
        self.assertEqual(self.snapshot('GOOD')['events'],[good]);self.assertEqual(self.snapshot(run='other')['events'],[other])
    def test_unknown_total_parts_remains_unknown(self):
        self.commit(event(1,[candle()],total=OMITTED));r=self.snapshot()
        self.assertIsNone(r['checkpoint']['complete']);self.assertEqual(r['checkpoint']['completeness'],'unknown_total_parts_not_declared')
    def test_unknown_total_with_bad_payload_is_still_partial(self):
        self.commit(event(1,None,total=OMITTED));self.assert_bad(self.snapshot(),[1])
    def test_missing_parts_and_byte_limit_still_flag_partial(self):
        self.commit(event(1,[candle()],part=0,total=3),event(2,[candle()],part=2,total=3))
        self.assertTrue(self.snapshot()['partialSnapshot']);self.assertFalse(self.snapshot()['checkpoint']['complete'])
        # Do not change MAX_READ: fill real allowed event payloads to exceed it.
        for i in range(3,55):
            self.commit(event(i,[{'payload':'x'*50000}],part=i-3,total=52))
        r=self.snapshot();self.assertTrue(r['partialSnapshot']);self.assertEqual(r['checkpoint']['invalidPayloadSequences'],[])
        # Existing contract: checkpoint refers to stored chunks, partialSnapshot
        # flags response truncation. Do not re-label this as full response validity.
        self.assertTrue(r['checkpoint']['complete']);self.assertLess(len(r['events']),52)

class NativeHTTPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=relay.Store(str(Path(self.tmp.name)/'events.sqlite'))
        self.subject=relay.Relay(self.store,WRITER,READER);self.runner=web.AppRunner(self.subject.app(),access_log=None)
        await self.runner.setup();self.sock=Path(self.tmp.name)/'http.sock';self.site=web.UnixSite(self.runner,str(self.sock));await self.site.start()
        self.session=aiohttp.ClientSession(connector=aiohttp.UnixConnector(path=str(self.sock)),timeout=aiohttp.ClientTimeout(total=10));self.sockets=[]
    async def asyncTearDown(self):
        for ws in self.sockets:await ws.close()
        await self.session.close();await self.runner.cleanup();self.store.close();self.tmp.cleanup()
    async def writer(self,run=RUN):
        ws=await self.session.ws_connect('http://localhost/ws');self.sockets.append(ws)
        await ws.send_json(dict(type='auth',key=WRITER,run=run,environment='test'))
        self.assertEqual((await ws.receive_json())['type'],'authenticated');return ws
    async def send(self,ws,message):
        await asyncio.sleep(.03);await ws.send_json(message);return await ws.receive_json()
    async def get(self,path,key=READER):
        async with self.session.get('http://localhost'+path,headers={'Authorization':'Bearer '+key}) as response:
            data=await response.read();return response.status,data,dict(response.headers)
    async def test_ws_ack_then_invalid_snapshot_is_diagnostic_not_500(self):
        ws=await self.writer();e=event(1,42);ack=await self.send(ws,batch(e));self.assertTrue(ack['durable'])
        status,b,headers=await self.get('/snapshot?symbol=EURUSD&run='+RUN)
        self.assertEqual(status,200);r=json.loads(b);self.assertTrue(r['partialSnapshot']);self.assertFalse(r['checkpoint']['complete']);self.assertEqual(r['checkpoint']['invalidPayloadSequences'],[1])
        self.assertEqual(r['events'],[e]);self.assertEqual(headers['Cache-Control'],'no-store')
        self.assertNotIn('TypeError',b.decode());self.assertNotIn(WRITER,b.decode());self.assertNotIn(READER,b.decode())
    async def test_string_candles_never_become_complete_over_http(self):
        ws=await self.writer();await self.send(ws,batch(event(1,'string-not-candles')))
        code,b,_=await self.get('/snapshot?symbol=EURUSD');self.assertEqual(code,200)
        r=json.loads(b);self.assertFalse(r['checkpoint']['complete']);self.assertEqual(r['checkpoint']['candlesObserved'],0);self.assertTrue(r['partialSnapshot'])
    async def test_new_valid_checkpoint_restores_snapshot_after_bad_ack(self):
        ws=await self.writer();a,b=event(1,None),event(2,[candle()]);await self.send(ws,batch(a));await self.send(ws,batch(b))
        code,data,_=await self.get('/snapshot?symbol=EURUSD');self.assertEqual(code,200);r=json.loads(data)
        self.assertTrue(r['checkpoint']['complete']);self.assertEqual(r['events'],[b]);self.assertFalse(r['partialSnapshot'])
        code,data,_=await self.get('/events?run='+RUN);self.assertEqual(json.loads(data)['events'],[a,b])
    async def test_archived_csharp_wire_and_duplicate_ack_remain_exact(self):
        raw=(ROOT/'baseline/relay_snapshot/wire-fixture.json').read_bytes();m=json.loads(raw);run=m['events'][0]['run'];ws=await self.writer(run)
        await ws.send_str(raw.decode());ack=await ws.receive_json();self.assertTrue(ack['durable']);self.assertEqual(ack['inserted'],2)
        await asyncio.sleep(.03);await ws.send_str(raw.decode());self.assertEqual(await ws.receive_json(),ack)
        code,b,_=await self.get('/events?run='+run);self.assertEqual(code,200);self.assertEqual(json.loads(b)['events'],m['events'])
    async def test_read_auth_and_trading_command_rejection_unchanged(self):
        for key in ('wrong',WRITER):self.assertEqual((await self.get('/snapshot?symbol=EURUSD',key))[0],401)
        ws=await self.writer();e=await self.send(ws,{'type':'place_order'})
        self.assertEqual(e['code'],'UNSUPPORTED_OPERATION');self.assertFalse(e['durable']);self.assertIsNone(self.store.latest_run())
    async def test_method_query_and_snapshot_contract_rejections_unchanged(self):
        for url in ('/snapshot','/events?symbol=EURUSD','/snapshot?symbol=EURUSD&after=-1'):
            self.assertEqual((await self.get(url))[0],400,url)
        async with self.session.post('http://localhost/snapshot?symbol=EURUSD',headers={'Authorization':'Bearer '+READER}) as r:self.assertEqual(r.status,405)

if __name__=='__main__':unittest.main(verbosity=2)
