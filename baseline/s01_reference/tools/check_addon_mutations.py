#!/usr/bin/env python3
"""Two bounded behavior mutations in discarded generated-source copies."""
import argparse,json,sys,tempfile,zipfile
from pathlib import Path
from addon_build_audit import ROOT,DONOR,ARCHIVE_ROOT,prepare,run_node,pinned_inputs,tree

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--reports-dir',type=Path,required=True);a=ap.parse_args()
    logs=a.reports_dir.resolve()
    if logs==ROOT or ROOT in logs.parents:raise ValueError('LOGS_MUST_BE_EXTERNAL')
    if logs.exists() and any(logs.iterdir()):raise ValueError('REFUSE_OVERWRITE_LOGS')
    logs.mkdir(parents=True,exist_ok=True)
    pinned_inputs()
    mutations=[
      ('remove_lowlevel_read_allowlist',"if(method==='tools/call'&&!READ_TOOLS.includes(params?.name))fail('TRADING_OPERATION_FORBIDDEN',400);",'', 'write calls rejected even through low-level RPC function'),
      ('remove_pairing_owner_binding',"v.owner!==hash(ownerSession)||",'', 'encrypted pairing is owner-bound, timed, tamper-evident and not plaintext')
    ]
    out=[]
    for label,old,new,pattern in mutations:
        with tempfile.TemporaryDirectory(prefix='s01-addon-mutant-') as t:
            stage=Path(t)/'stage';prepare(stage)
            p=run_node(['build-account-addon.mjs'],stage)
            if p.returncode:raise RuntimeError(p.stderr)
            target=stage/'lib/ctrader-readonly.mjs';code=target.read_text()
            if code.count(old)!=1:raise RuntimeError('MUTATION_TARGET_NOT_UNIQUE')
            before=tree(stage);target.write_text(code.replace(old,new))
            after=tree(stage)
            if [n for n in before if before[n]!=after[n]]!=['lib/ctrader-readonly.mjs']:raise RuntimeError('UNEXPECTED_MUTATION_SCOPE')
            (stage/'tests').mkdir()
            with zipfile.ZipFile(DONOR) as z:(stage/'tests/reader.test.mjs').write_bytes(z.read(ARCHIVE_ROOT+'tests/reader.test.mjs'))
            p=run_node(['--test','--test-name-pattern='+pattern,'tests/reader.test.mjs'],stage)
            (logs/(label+'.log')).write_text(p.stdout+'\n--- STDERR ---\n'+p.stderr)
            detected=p.returncode!=0 and '# fail 1' in p.stdout and 'AssertionError' in p.stdout
            out.append({'mutation':label,'source':'temporary generated lib/ctrader-readonly.mjs only','test':pattern,'exit':p.returncode,'detected_by_original_behavior_test':detected,'log':label+'.log'})
            if not detected:raise RuntimeError('Mutation escaped: '+label)
    result={'mutations':out,'detected':len(out),'unique_test_methods_added':0,'product_sources_changed':False}
    (logs/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
