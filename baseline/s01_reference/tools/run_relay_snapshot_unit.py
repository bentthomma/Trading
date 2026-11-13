#!/usr/bin/env python3
"""Single offline process. Fresh import of real source, no network beyond Unix."""
import argparse,importlib.util,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from unix_http_offline import install
install()
sys.dont_write_bytecode=True
p=argparse.ArgumentParser();p.add_argument('--legacy',action='store_true');p.add_argument('--test');args=p.parse_args()
spec=importlib.util.spec_from_file_location('snapshot_checks',ROOT/'tests/test_relay_snapshot_guard.py');mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=mod;spec.loader.exec_module(mod)
if args.legacy:
    sys.modules['relay']=mod.relay
    spec=importlib.util.spec_from_file_location('legacy_original',ROOT/'baseline/relay_snapshot/test_relay_legacy.py');legacy=importlib.util.module_from_spec(spec);sys.modules[spec.name]=legacy;spec.loader.exec_module(legacy)
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(legacy.StorageTests)
elif args.test:suite=unittest.defaultTestLoader.loadTestsFromName(args.test,mod)
else:suite=unittest.defaultTestLoader.loadTestsFromModule(mod)
result=unittest.TextTestRunner(verbosity=2).run(suite)
print('METHODS',result.testsRun,'FAIL',len(result.failures),'ERROR',len(result.errors),'SKIP',len(result.skipped))
sys.exit(0 if result.wasSuccessful() else 1)
