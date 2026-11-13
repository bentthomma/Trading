"""Tests use SYNTHETIC non-broker events. No network beyond local loopback."""
import asyncio
import json
import os
import ssl
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'relay'))
from relay import Store, Relay, ProtocolError, strict_json, checked_event, utc
import aiohttp
from aiohttp import web
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import rsa

WRITER='test-writer-'+'w'*40
READER='test-reader-'+'r'*40

def event(seq=1,run='test_run',kind='STATUS',**data):
    return dict(schema=2,seq=seq,run=run,utc=utc(),kind=kind,data={'synthetic':True,**data})

def batch(*items, bid='batch-1'):
    return dict(type='batch',batch=bid,events=list(items))

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(str(Path(self.tmp.name)/'test.sqlite'))
    def tearDown(self):self.store.close();self.tmp.cleanup()
    def commit(self,m):return self.store.commit(m,'test_run','test')
    def test_empty_store(self):self.assertIsNone(self.store.latest_run())
    def test_commit_before_durable_ack(self):
        a=self.commit(batch(event()));self.assertTrue(a['durable']);self.assertEqual(self.store.state('test_run')['receivedEvents'],1)
    def test_lost_ack_replay_returns_same_ack(self):
        m=batch(event());a=self.commit(m);self.assertEqual(a,self.commit(m));self.assertEqual(self.store.state('test_run')['receivedEvents'],1)
    def test_batch_content_conflict(self):
        self.commit(batch(event()));
        with self.assertRaisesRegex(ProtocolError,'BATCH_CONTENT_CONFLICT'):self.commit(batch(event(2)))
    def test_duplicate_event_different_batch(self):
        e=event();self.commit(batch(e));a=self.commit(batch(e,bid='other'));self.assertEqual(a['inserted'],0)
    def test_sequence_conflict_rolls_back_entire_batch(self):
        e=event();self.commit(batch(e));other={**e,'data':{'evil':'changed'}}
        with self.assertRaisesRegex(ProtocolError,'SEQUENCE_CONTENT_CONFLICT'):self.commit(batch(event(2),other,bid='other'))
        self.assertEqual(self.store.state('test_run')['receivedEvents'],1)
    def test_restart_persistence(self):
        e=event();a=self.commit(batch(e));self.store.close();self.store=Store(str(Path(self.tmp.name)/'test.sqlite'))
        self.assertEqual(self.commit(batch(e)),a)
    def test_missing_prefix_and_middle_sequences(self):
        self.commit(batch(event(2),event(4)));self.assertEqual(self.store.state('test_run')['missingSequenceCount'],2)
    def test_late_event_repairs_gap(self):
        self.commit(batch(event(3)));self.commit(batch(event(1),event(2),bid='late'))
        self.assertEqual(self.store.state('test_run')['missingSequenceCount'],0)
    def test_storage_limit_never_ack(self):
        self.store.max_payload_bytes=1
        with self.assertRaisesRegex(ProtocolError,'STORAGE_LIMIT'):self.commit(batch(event()))
        self.assertIsNone(self.store.latest_run())
    def test_batch_run_cannot_be_spoofed(self):
        with self.assertRaisesRegex(ProtocolError,'RUN_MISMATCH'):self.commit(batch(event(run='other')))
    def test_same_sequence_twice_in_batch_rejected(self):
        e=event()
        with self.assertRaisesRegex(ProtocolError,'DUPLICATE_SEQUENCE'):self.commit(batch(e,e))
    def test_numeric_nan_rejected(self):
        with self.assertRaises(ProtocolError):strict_json('{"pnl":NaN}')
    def test_duplicate_json_key_rejected(self):
        with self.assertRaises(ProtocolError):strict_json('{"seq":1,"seq":2}')
    def test_string_nan_allowed_as_named_number_legacy(self):
        e=event(margin='Infinity');checked_event(e,'test_run')
    def test_boolean_sequence_rejected(self):
        with self.assertRaises(ProtocolError):self.commit(batch(event(True)))
    def test_future_time_rejected(self):
        e=event();e['utc']=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
        with self.assertRaises(ProtocolError):self.commit(batch(e))
    def test_missing_timezone_rejected(self):
        e=event();e['utc']='2026-11-05T10:00:00'
        with self.assertRaises(ProtocolError):self.commit(batch(e))
    def test_symbol_snapshot_latest_by_sequence_not_arrival(self):
        a=event(2,kind='DECISION',Symbol='EURUSD');b=event(1,kind='DECISION',Symbol='EURUSD')
        self.commit(batch(a));self.commit(batch(b,bid='late'))
        r=self.store.events('test_run',0,'EURUSD',True)
        self.assertEqual(r['events'],[a]);self.assertFalse(r['historyComplete'])
    def test_bad_environment_change_rejected(self):
        self.commit(batch(event()))
        with self.assertRaisesRegex(ProtocolError,'ENVIRONMENT_CONFLICT'):self.store.commit(batch(event(2),bid='2'),'test_run','cloud')
    def test_max_batch_size(self):
        with self.assertRaises(ProtocolError):self.commit(batch(*(event(i+1) for i in range(65))))
    def test_schema_mismatch(self):
        e=event();e['schema']=1
        with self.assertRaises(ProtocolError):self.commit(batch(e))
    def test_key_separation(self):
        with self.assertRaises(ValueError):Relay(self.store,WRITER,WRITER)
    def test_non_object_data(self):
        e=event();e['data']=[]
        with self.assertRaises(ProtocolError):self.commit(batch(e))

class NetworkTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(str(Path(self.tmp.name)/'net.sqlite'))
        self.relay=Relay(self.store,WRITER,READER)
        self.runner=web.AppRunner(self.relay.app(),access_log=None);await self.runner.setup()
        self.site=web.TCPSite(self.runner,'127.0.0.1',0);await self.site.start()
        self.port=self.site._server.sockets[0].getsockname()[1]
        self.url=f'http://127.0.0.1:{self.port}'
        self.session=aiohttp.ClientSession();self.client_sockets=[]
    async def asyncTearDown(self):
        await asyncio.gather(*(ws.close() for ws in self.client_sockets),return_exceptions=True)
        await self.session.close();await self.runner.cleanup();self.store.close();self.tmp.cleanup()
    async def writer(self,key=WRITER,run='test_run'):
        ws=await self.session.ws_connect(self.url+'/ws');self.client_sockets.append(ws)
        await ws.send_json(dict(type='auth',key=key,run=run,environment='test'))
        return ws,await ws.receive_json()
    async def read(self,path='/live',key=READER):
        return await self.session.get(self.url+path,headers={'Authorization':'Bearer '+key})
    async def test_real_socket_to_storage_to_reader(self):
        ws,a=await self.writer();self.assertEqual(a['type'],'authenticated')
        e=event();await ws.send_json(batch(e));ack=await ws.receive_json();self.assertTrue(ack['durable'])
        r=await self.read();x=await r.json();self.assertEqual(x['events'],[e]);self.assertTrue(x['status']['dataFresh']);self.assertEqual(x['status']['reportedEnvironment'],'test')
    async def test_unauthenticated_read_denied(self):
        r=await self.session.get(self.url+'/live');self.assertEqual(r.status,401)
    async def test_writer_key_cannot_read(self):
        r=await self.read(key=WRITER);self.assertEqual(r.status,401)
    async def test_reader_key_cannot_write(self):
        ws,x=await self.writer(READER);self.assertEqual(x['code'],'AUTH_REJECTED');self.assertIsNone(self.store.latest_run())
    async def test_websocket_browser_origin_denied(self):
        with self.assertRaises(aiohttp.WSServerHandshakeError):await self.session.ws_connect(self.url+'/ws',origin='https://elsewhere.invalid')
    async def test_query_token_denied(self):
        with self.assertRaises(aiohttp.WSServerHandshakeError):await self.session.ws_connect(self.url+'/ws?token=bad')
    async def test_unknown_operation_cannot_place_order(self):
        ws,_=await self.writer();await ws.send_json(dict(type='place_order'));x=await ws.receive_json();self.assertEqual(x['code'],'UNSUPPORTED_OPERATION')
    async def test_one_producer_only(self):
        first,_=await self.writer();second,x=await self.writer(run='second');self.assertEqual(x['code'],'PRODUCER_ALREADY_CONNECTED')
    async def test_disconnect_is_not_live(self):
        ws,_=await self.writer();await ws.send_json(batch(event()));await ws.receive_json();await ws.close();await asyncio.sleep(.04)
        r=await self.read();x=await r.json();self.assertFalse(x['status']['producerConnected']);self.assertEqual(len(x['events']),1)
    async def test_stale_events_not_live_even_with_ping(self):
        ws,_=await self.writer();e=event();e['utc']=(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()
        await ws.send_json(batch(e));await ws.receive_json();await ws.send_json({'type':'ping'});await ws.receive_json()
        r=await self.read();x=await r.json();self.assertTrue(x['status']['producerConnected']);self.assertFalse(x['status']['dataFresh'])
    async def test_reconnect_retransmit_no_duplicate(self):
        ws,_=await self.writer();m=batch(event());await ws.send_json(m);a=await ws.receive_json();await ws.close();await asyncio.sleep(.04)
        ws,_=await self.writer();await ws.send_json(m);b=await ws.receive_json();self.assertEqual(a,b)
    async def test_run_switch_resets_browser_cursor(self):
        self.store.commit(batch(event()),'test_run','test');self.store.commit(batch(event(run='second')),'second','test')
        r=await self.read('/live?run=test_run&after=1000');x=await r.json();self.assertTrue(x['reset']);self.assertEqual(x['run'],'second')
    async def test_invalid_cursor(self):
        r=await self.read('/live?after=-1');self.assertEqual(r.status,400)
    async def test_snapshot_filter(self):
        a=event(1,kind='DECISION',Symbol='EURUSD');b=event(2,kind='DECISION',Symbol='NZDUSD');self.store.commit(batch(a,b),'test_run','test')
        r=await self.read('/snapshot?run=test_run&symbol=NZDUSD');self.assertEqual((await r.json())['events'],[b])
    async def test_snapshot_requires_symbol(self):
        r=await self.read('/snapshot');self.assertEqual(r.status,400)
    async def test_stream_does_not_allow_symbol_cursor_filter(self):
        r=await self.read('/events?symbol=NZDUSD');self.assertEqual(r.status,400)
    async def test_http_post_is_not_trading_endpoint(self):
        r=await self.session.post(self.url+'/live',headers={'Authorization':'Bearer '+READER},json={'trade':True});self.assertEqual(r.status,405)
    async def test_bad_token_error_does_not_echo_token(self):
        secret='secret_bad_test_token';ws,x=await self.writer(secret);self.assertNotIn(secret,json.dumps(x))
    async def test_storage_failure_not_durable(self):
        self.store.max_payload_bytes=1;ws,_=await self.writer();await ws.send_json(batch(event()));x=await ws.receive_json();self.assertFalse(x['durable']);self.assertEqual(x['type'],'error')
    async def test_catchup_not_labelled_live(self):
        for start in range(1,131,32):self.store.commit(batch(*(event(i) for i in range(start,min(131,start+32))),bid='b'+str(start)),'test_run','test')
        ws,_=await self.writer();r=await self.read();x=await r.json();self.assertTrue(x['hasMore']);self.assertFalse(x['status']['dataFresh'])
        r=await self.read('/live?run=test_run&after='+str(x['cursor']));y=await r.json();self.assertEqual(len(y['events']),2)
    async def test_tls_on_port_25345_local_only(self):
        key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'localhost')]);now=datetime.now(timezone.utc)
        cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(hours=1)).add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost')]),critical=False).sign(key,hashes.SHA256()))
        cp=Path(self.tmp.name)/'cert.pem';kp=Path(self.tmp.name)/'key.pem'
        cp.write_bytes(cert.public_bytes(serialization.Encoding.PEM));kp.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
        server=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);server.load_cert_chain(cp,kp)
        client=ssl.create_default_context(cafile=str(cp))
        site=web.TCPSite(self.runner,'127.0.0.1',25345,ssl_context=server);await site.start()
        ws=await self.session.ws_connect('wss://localhost:25345/ws',ssl=client);self.client_sockets.append(ws)
        await ws.send_json(dict(type='auth',key=WRITER,run='test_run',environment='test'));self.assertEqual((await ws.receive_json())['type'],'authenticated')
        await ws.send_json(batch(event()));self.assertTrue((await ws.receive_json())['durable'])
        await ws.close();await site.stop()

if __name__=='__main__':unittest.main(verbosity=2)
