"""Real Chromium + original journal UI; no cloned DOM or renderer.

The snapshot comes from the existing relay proposal's real SQLite Store.
This is the archived import interface, NOT the unavailable final live/skin client.
All data are synthetic. IP sockets are denied before child processes start.
"""
from __future__ import annotations
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from unix_http_offline import install
install()
from playwright.sync_api import sync_playwright
SOURCE=Path(os.environ.get('S01_CONSUMER_SOURCE',str(ROOT/'proposals/snapshot-consumer-guard/app.js')))
spec=importlib.util.spec_from_file_location('snapshot_consumer_relay',ROOT/'proposals/relay-snapshot-guard/relay.py')
relay=importlib.util.module_from_spec(spec);sys.modules[spec.name]=relay;spec.loader.exec_module(relay)
STAMP='2026-01-01T00:10:00Z'
RUN='synthetic-consumer'
MISSING=object()

def event(seq,kind,data,run=RUN):
    return dict(schema=2,run=run,seq=seq,utc=STAMP,kind=kind,data=data)

def candle(time='2026-01-01T00:00:00Z'):
    return dict(Time=time,Open=1.25,High=1.5,Low=1.0,Close=1.4,TickVolume=7)

def chunk(seq,candles=MISSING,part=0,total=1):
    d={'symbol':'EURUSD','part':part}
    if total is not MISSING:d['totalParts']=total
    if candles is not MISSING:d['candles']=candles
    return event(seq,'BARS',d)

def decision(seq=2):
    return event(seq,'DECISION',{'Symbol':'EURUSD','Id':'SYNTHETIC','Currency':'CHF',
        'Feature':{'Side':0,'Low':1,'High':2,'BuyLow':1,'BuyHigh':1.2,'SellLow':1.8,'SellHigh':2,'Z':0.5,'Close':1.5}})

class SourceTests(unittest.TestCase):
    def test_original_renderer_reproduced_by_original_patch_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'app.js'
            target.write_bytes((ROOT/'baseline/derived_assets/public/app.js').read_bytes())
            result=subprocess.run(['/usr/bin/env','node',str(ROOT/'baseline/vercel_recovered/src/patch_ui.mjs'),str(target)],capture_output=True,text=True,timeout=20)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(target.read_bytes(),(ROOT/'baseline/recovery_donors/expected_patched_app.js').read_bytes())
    def test_sources_and_scope_are_explicit(self):
        p=json.loads((ROOT/'proposals/snapshot-consumer-guard/proposal.json').read_text())
        self.assertEqual(hashlib.sha256((ROOT/p['original_path']).read_bytes()).hexdigest(),p['original_sha256'])
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(),p['candidate_sha256'])
        self.assertEqual(hashlib.sha256((ROOT/'proposals/relay-snapshot-guard/relay.py').read_bytes()).hexdigest(),p['relay_proposal_sha256'])
        self.assertFalse(p['independent_review'])
        for f in (socket.AF_INET,socket.AF_INET6):
            with self.assertRaises(PermissionError):socket.socket(f)

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--no-sandbox','--disable-background-networking','--disable-dev-shm-usage'])
        cls.html=(ROOT/'baseline/derived_assets/public/index.html').read_text()
        cls.html=re.sub(r'<script src="[^"]+" defer></script>','',cls.html)
        cls.html=re.sub(r'<link[^>]+stylesheet[^>]*>','',cls.html)
        cls.code=SOURCE.read_text()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop()
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=relay.Store(str(Path(self.tmp.name)/'events.sqlite'))
        self.context=self.browser.new_context(accept_downloads=True)
        self.context.route('**/*',lambda route:route.abort())
        self.page=self.context.new_page();self.errors=[];self.requests=[]
        self.page.on('pageerror',lambda exc:self.errors.append(str(exc)))
        self.page.on('request',lambda req:self.requests.append(req.url))
        # about:blank document injection avoids blocked network navigation.
        # This only reveals the isolated renderer fixture, not production auth.
        self.page.set_content(self.html)
        self.page.evaluate("document.getElementById('privateArea').hidden=false;document.getElementById('loginArea').hidden=true")
        self.page.add_script_tag(content=self.code)
    def tearDown(self):
        try:
            self.assertEqual(self.requests,[],'Rendering unexpectedly tried network access')
            self.assertEqual(self.errors,[],'Uncaught renderer errors')
        finally:
            self.context.close();self.store.close();self.tmp.cleanup()
    def snap(self,*events):
        for i,e in enumerate(events):
            ack=self.store.commit(dict(type='batch',batch='synthetic-'+str(e['seq']),events=[e]),e['run'],'test')
            self.assertTrue(ack['durable'])
        return self.store.events(RUN,0,'EURUSD',True)
    def load(self,doc):
        self.page.evaluate('x=>ExtremeLabUI.load(JSON.stringify(x),"Synthetischer Import – nicht live")',doc)
    def state(self):return self.page.evaluate('ExtremeLabUI.getState()')
    def error(self):return self.page.locator('#importError').text_content()
    def quality(self):return self.page.locator('#quality').text_content()
    def export(self):
        with self.page.expect_download() as got:
            self.page.evaluate("document.getElementById('export').click()")
        p=Path(self.tmp.name)/'export.json';got.value.save_as(p)
        return json.loads(p.read_text())
    def test_valid_real_store_snapshot_renders_and_retains_source_scope(self):
        doc=self.snap(chunk(1,[candle()]),decision())
        self.assertTrue(doc['checkpoint']['complete']);self.load(doc)
        self.assertEqual(self.error(),'');self.assertEqual(len(self.state()['bars']),1)
        self.assertEqual(self.page.locator('#chart svg').count(),1)
        self.assertEqual(self.state()['meta']['snapshot']['checkpoint']['complete'],True)
        self.assertIn('kein vollständiges Journal',self.quality())
        self.assertEqual(self.page.url,'about:blank')
    def test_invalid_real_snapshot_is_readable_without_losing_raw_events(self):
        doc=self.snap(chunk(1,42),decision())
        self.assertTrue(doc['partialSnapshot']);self.load(doc)
        self.assertEqual(self.error(),'')
        s=self.state();self.assertEqual(s['bars'],[]);self.assertEqual(s['all'],doc['events'])
        self.assertIs(s['meta']['snapshot']['checkpoint']['complete'],False)
        self.assertEqual(s['meta']['snapshot']['checkpoint']['invalidPayloadSequences'],[1])
        self.assertIn('strukturell ungültige',self.quality())
        self.assertIn('Checkpoint ausdrücklich unvollständig',self.quality())
        self.assertEqual(self.page.locator('#qualityLabel').text_content(),'Datenprüfung beachten')
    def test_invalid_list_shapes_and_members_do_not_poison_renderer(self):
        values=[MISSING,None,True,42,'not-candles',{},[None],[42],['x'],[[]],[candle(),None]]
        for seq,value in enumerate(values,1):
            with self.subTest(value=repr(value)):
                # New valid part-zero identifies a new checkpoint in the real Store.
                doc=self.snap(chunk(seq*2-1,value),decision(seq*2));self.load(doc)
                self.assertEqual(self.error(),'');self.assertEqual(self.state()['bars'],[])
                self.assertEqual(len(self.state()['meta']['invalidCandlePayloads']),1)
                self.assertEqual(self.state()['all'],doc['events'])
    def test_mixed_chunks_do_not_count_partially_valid_chunk(self):
        doc=self.snap(chunk(1,[candle()],0,2),chunk(2,[candle(),None],1,2),decision(3));self.load(doc)
        self.assertEqual(self.error(),'');self.assertEqual(len(self.state()['bars']),1)
        self.assertEqual(self.state()['all'],doc['events'])
        self.assertFalse(self.state()['meta']['snapshot']['checkpoint']['complete'])
    def test_real_byte_limited_response_not_promoted_by_complete_checkpoint(self):
        events=[]
        for i in range(52):
            c=candle();c['syntheticPadding']='x'*50000
            events.append(chunk(i+1,[c],i,52))
        # Existing MAX_READ is not patched or lowered.
        doc=self.snap(*events,decision(53))
        self.assertTrue(doc['checkpoint']['complete']);self.assertTrue(doc['partialSnapshot'])
        self.assertLess(len(doc['events']),53);self.load(doc)
        self.assertEqual(self.error(),'');self.assertTrue(self.state()['meta']['snapshot']['partialSnapshot'])
        self.assertIn('Snapshot-Antwort unvollständig',self.quality())
        self.assertEqual(self.state()['all'],doc['events'])
    def test_unknown_total_is_unknown_after_import_export_reload(self):
        doc=self.snap(chunk(1,[candle()],total=MISSING),decision());self.load(doc)
        self.assertIsNone(self.state()['meta']['snapshot']['checkpoint']['complete'])
        self.assertIn('Vollständigkeit unbekannt',self.quality())
        output=self.export();self.load(output)
        self.assertIsNone(self.state()['meta']['snapshot']['checkpoint']['complete'])
    def test_download_roundtrip_preserves_diagnosis_and_raw_events(self):
        doc=self.snap(chunk(1,'bad'),decision());self.load(doc)
        first=self.state();out=self.export()
        self.assertEqual(out['source'],'imported_journal_not_live')
        self.assertEqual(out['events'],doc['events'])
        self.assertEqual(out['meta']['snapshot'],first['meta']['snapshot'])
        self.load(out);self.assertEqual(self.error(),'')
        self.assertEqual(self.state()['meta']['snapshot'],first['meta']['snapshot'])
        self.assertEqual(self.state()['all'],doc['events'])
    def test_recovered_checkpoint_does_not_retain_previous_warning(self):
        self.load(self.snap(chunk(1,42),decision(2)))
        self.assertIn('strukturell ungültige',self.quality())
        self.load(self.snap(chunk(3,[candle()]),decision(4)))
        self.assertNotIn('strukturell ungültige',self.quality())
        self.assertTrue(self.state()['meta']['snapshot']['checkpoint']['complete'])
        self.assertEqual(self.store.events(RUN,0)['events'][0]['data']['candles'],42)
    def test_source_diagnostics_are_not_executable_markup(self):
        doc=self.snap(chunk(1,[candle()]),decision())
        doc['checkpoint']['completeness']='<img src=x onerror="window.untrustedExecuted=true">'
        self.load(doc)
        self.assertIn('<img',self.quality())
        self.assertEqual(self.page.locator('#quality img').count(),0)
        self.assertIsNone(self.page.evaluate('window.untrustedExecuted??null'))
    def test_plain_journal_resets_snapshot_metadata(self):
        self.load(self.snap(chunk(1,42),decision()))
        good=[chunk(1,[candle()]),decision()]
        self.load(good)
        self.assertIsNone(self.state()['meta']['snapshot'])
        self.assertEqual(self.state()['meta']['invalidCandlePayloads'],[])
        self.assertNotIn('Snapshot-Ausschnitt',self.quality())
        self.assertEqual(len(self.state()['bars']),1)
    def test_empty_snapshot_refuses_import_without_replacing_last_view(self):
        self.load([chunk(1,[candle()]),decision()]);before=self.state()
        self.load({'snapshot':True,'partialSnapshot':True,'events':[]})
        self.assertIn('Keine vollständigen',self.error());self.assertEqual(self.state(),before)
    def test_direct_decision_and_single_bar_share_shape_guards(self):
        d=decision(3);d['data']['Candles']=[None]
        self.load([chunk(1,[candle()]),event(2,'BAR',{'symbol':'EURUSD','candle':[]}),d])
        self.assertEqual(self.error(),'');self.assertEqual(self.state()['bars'],[])
        self.assertEqual(len(self.state()['meta']['invalidCandlePayloads']),2)
    def test_replay_no_future_candles_and_legacy_parser_counts_preserved(self):
        a=candle();future=candle('2026-01-01T00:09:00Z')
        self.load([chunk(1,[a,future]),decision(3),decision(3)])
        s=self.state();self.assertEqual(s['bars'],[a]);self.assertEqual(s['meta']['duplicates'],1);self.assertEqual(s['meta']['gaps'],1)
        self.assertEqual(self.page.locator('#chart svg').count(),1)
    def test_existing_open_position_and_error_lock_rendering_unchanged(self):
        status=event(1,'STATUS',{'state':'FEHLER / neue Orders gesperrt','accountCheck':'UNKNOWN','currency':'CHF','positions':1})
        pos=event(2,'POSITIONS',{'items':[{'symbol':'EURUSD','positionId':'9007199254740993','side':'Long','entry':1.2,'stop':1.0,'target':1.5,'net':2.25}]})
        self.load([status,pos]);self.assertEqual(self.error(),'')
        self.assertIn('FEHLER',self.page.locator('#headline').text_content())
        self.assertIn('9007199254740993',self.page.locator('#active').text_content())
        self.assertIn('POSITION OFFEN',self.page.locator('#state').text_content())
        self.page.select_option('#marketFilter','open');self.assertEqual(self.page.locator('#markets .market').count(),1)

if __name__=='__main__':unittest.main(verbosity=2)
