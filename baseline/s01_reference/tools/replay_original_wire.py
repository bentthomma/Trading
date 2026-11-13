#!/usr/bin/env python3
"""Replay original archived synthetic C# wire with the original Python receiver.

The fixture is historical, not newly compiled C#. Network access is cooperatively
restricted to loopback TLS :25345 in this audited Python process. No broker exists.
"""
from __future__ import annotations
import contextlib
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import platform
import runpy
import socket
import sys
import tempfile
import zipfile
from recover_bot_source import read_original_sources, ARCHIVE_ROOT

ROOT=Path(__file__).resolve().parents[1]
archive=ROOT/'baseline/original_engine121_source.zip'
read_original_sources(archive)  # exact archive and all 30 original hashes
expected={'aiohttp':'3.13.3','cryptography':'46.0.4'}
versions={n:importlib.metadata.version(n) for n in expected}
if versions != expected:
    raise RuntimeError('DEPENDENCY_VERSION_DIFFERS: '+json.dumps(versions))
original_connect=socket.socket.connect
original_connect_ex=socket.socket.connect_ex
original_bind=socket.socket.bind
original_getaddrinfo=socket.getaddrinfo
observed=[]
def allowed(address):
    if not isinstance(address,tuple) or len(address)<2 or address[0] not in ('127.0.0.1','::1','localhost') or address[1]!=25345:
        raise PermissionError('NON_LOOPBACK_TEST_ENDPOINT_DENIED')
def connect(sock,address):
    allowed(address);observed.append({'operation':'connect','host':address[0],'port':address[1]})
    return original_connect(sock,address)
def connect_ex(sock,address):
    allowed(address);observed.append({'operation':'connect_ex','host':address[0],'port':address[1]})
    return original_connect_ex(sock,address)
def bind(sock,address):
    allowed(address);observed.append({'operation':'bind','host':address[0],'port':address[1]})
    return original_bind(sock,address)
def getaddrinfo(host,port,*args,**kwargs):
    allowed((host,port));return original_getaddrinfo(host,port,*args,**kwargs)
socket.socket.connect=connect;socket.socket.connect_ex=connect_ex
socket.socket.bind=bind;socket.getaddrinfo=getaddrinfo
try:
    with tempfile.TemporaryDirectory(prefix='s01-original-wire-') as tmp:
        tmp=Path(tmp)
        with zipfile.ZipFile(archive) as z:z.extractall(tmp) # archive verified safe above
        original=tmp/ARCHIVE_ROOT
        fixture=(original/'evidence/wire-fixture.json').read_bytes()
        watched={p.relative_to(original).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in original.rglob('*') if p.is_file() and (p.parts[-2] in ('src','relay') or p.name=='test_csharp_wire.py')}
        # No user API credentials, server configuration or home files are passed.
        previous=dict(os.environ)
        os.environ.clear();os.environ.update({'PATH':os.defpath,'HOME':str(tmp),'LANG':'C.UTF-8','PYTHONDONTWRITEBYTECODE':'1'})
        sys.dont_write_bytecode=True
        capture=io.StringIO()
        try:
            with contextlib.redirect_stdout(capture):runpy.run_path(str(original/'integration-tests/test_csharp_wire.py'),run_name='__main__')
        finally:
            os.environ.clear();os.environ.update(previous)
        report=json.loads((original/'evidence/csharp-python-interoperability.json').read_text())
        for rel,digest in watched.items():
            assert hashlib.sha256((original/rel).read_bytes()).hexdigest()==digest,rel
        print(json.dumps({'execution':'fresh_original_receiver_with_archived_synthetic_fixture','python':platform.python_version(),'uid':os.getuid(),'dependencies':versions,
            'fixture_sha256':hashlib.sha256(fixture).hexdigest(),'fixture_newly_generated_by_csharp':False,
            'native_csharp_tests_executed':False,'bot_started':False,'broker_connection':False,
            'network_guard':'cooperative Python socket/DNS loopback-only filter; not an OS sandbox',
            'observed_test_endpoints':observed,'source_unchanged':True,'result':report},indent=2))
finally:
    socket.socket.connect=original_connect;socket.socket.connect_ex=original_connect_ex
    socket.socket.bind=original_bind;socket.getaddrinfo=original_getaddrinfo
