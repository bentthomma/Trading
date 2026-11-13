"""Build and execute the real standalone C# wire probe. Missing SDK => exit 2, never pass."""
from pathlib import Path
import argparse,copy,hashlib,json,os,re,shutil,subprocess,tempfile,sys,importlib.util
R=Path(__file__).resolve().parents[2]
def run_native(output,dotnet=None):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    binary=dotnet or shutil.which('dotnet')
    report={'criterion':'S02-C01','native_compiler_executed':False,'native_event_count':0,'broker_or_bot_started':False,'commands':[]}
    if not binary or not Path(binary).is_file():
        report.update(status='blocked',reason='DOTNET_SDK_NOT_AVAILABLE',next='Run this exact probe with an installed .NET SDK >=8 and its local framework reference pack. No external package sources required.')
        (output/'native.json').write_text(json.dumps(report,indent=2)+'\n');return report,2
    binary=str(Path(binary).resolve())
    with tempfile.TemporaryDirectory(prefix='s02-native-')as td:
        work=Path(td);shutil.copytree(R/'adapters/contracts/v1/native',work/'probe');env=os.environ.copy()
        env.update(DOTNET_CLI_TELEMETRY_OPTOUT='1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1',DOTNET_CLI_HOME=str(work/'home'),DOTNET_NOLOGO='1',DOTNET_CLI_USE_MSBUILD_SERVER='0',DOTNET_EnableDiagnostics='0',MSBUILDDISABLENODEREUSE='1',NUGET_PACKAGES=str(work/'packages'))
        def call(name,args,stdin=None,timeout=120):
            p=subprocess.run(args,cwd=work/'probe',env=env,text=True,input=stdin,capture_output=True,timeout=timeout)
            (output/(name+'.stdout')).write_text(p.stdout);(output/(name+'.stderr')).write_text(p.stderr)
            report['commands'].append({'name':name,'argv':args,'exit_code':p.returncode,'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()})
            if p.returncode:raise RuntimeError(name+':'+str(p.returncode))
            return p.stdout
        try:
            version=call('sdks',[binary,'--list-sdks']);report['sdk_listing']=version
            versions=[int(m.group(1))for m in re.finditer(r'^(\d+)\.\d+\.\d+',version,re.M) if int(m.group(1))>=8]
            if not versions:raise RuntimeError('DOTNET_SDK_VERSION_UNSUPPORTED')
            # Use the installed SDK's bundled target pack: no internet-based pack restore.
            major=max(versions);project=work/'probe/NativeWireProbe.csproj';project.write_text(project.read_text().replace('net8.0',f'net{major}.0'))
            call('restore',[binary,'restore','--configfile','NuGet.Config','--ignore-failed-sources','-p:NuGetAudit=false'])
            report['native_build_attempted']=True
            call('build',[binary,'build','-c','Release','--no-restore','-p:UseSharedCompilation=false','-nodeReuse:false'])
            report['native_compiler_executed']=True
            report['native_build_succeeded']=True
            fixture=json.loads((R/'contracts/domain/v1/golden-events.json').read_text())
            spec=importlib.util.spec_from_file_location('native_expected',R/'adapters/contracts/v1/domain.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
            events=copy.deepcopy(fixture['events'])
            # Include a cashflow without instrument and the null count-cap variant.
            cash=next(e for e in events if e['kind']=='Cashflow');cash['instrument_version']=None
            policy=next(e for e in events if e['kind']=='PolicyVersion');variant=copy.deepcopy(policy);variant['payload']['maximum_positions']=None;variant['payload_hash']=d.fingerprint(variant['payload']);events.append(variant)
            requests=[{'event':e,'catalog':fixture['catalog']}for e in events]
            payload=''.join(json.dumps(x)+'\n'for x in requests)
            out=call('roundtrip',[binary,str(work/f'probe/bin/Release/net{major}.0/NativeWireProbe.dll'),str(R/'contracts/domain/v1/schema.json')],payload)
            actual=[json.loads(x)for x in out.splitlines()];expected=[{'ok':True,'canonical':d.canonical(e),'sha256':d.fingerprint(e)}for e in events]
            if actual!=expected:raise RuntimeError('NATIVE_CANONICAL_MISMATCH')
            node=os.environ.get('S02_NODE','node');p=subprocess.run([node,str(R/'adapters/contracts/v1/domain.mjs')],input=payload,text=True,capture_output=True,timeout=20)
            if p.returncode or [json.loads(x)for x in p.stdout.splitlines()]!=expected:raise RuntimeError('JAVASCRIPT_CANONICAL_MISMATCH')
            negatives=[]
            for change in ['field','unit','number','version','overflow']:
                e=copy.deepcopy(next(v for v in events if v['kind']=='OrderIntent'))
                if change=='field':e['unexpected']=True
                if change=='unit':e['payload']['quantity']['unit']='pounds'
                if change=='number':e['payload']['quantity']['value']=1.25
                if change=='version':del e['schema_version']
                if change=='overflow':e['sequence']='18446744073709551616'
                negatives.append({'event':e})
            neg=call('native_shape_negatives',[binary,str(work/f'probe/bin/Release/net{major}.0/NativeWireProbe.dll'),str(R/'contracts/domain/v1/schema.json')],''.join(json.dumps(x)+'\n'for x in negatives))
            answers=[json.loads(x)for x in neg.splitlines()]
            if len(answers)!=len(negatives)or any(x.get('ok')for x in answers):raise RuntimeError('NATIVE_NEGATIVE_ACCEPTED')
            report.update(status='passed',native_event_count=len(events),shape_negative_cases=len(answers),framework=f'net{major}.0',scope='Wire model typed serialization and schema shape only. Not the complete native semantic/risk validator; no broker runtime.')
            rc=0
        except (OSError,RuntimeError,subprocess.TimeoutExpired)as e:
            report.update(status='failed',reason=str(e));rc=1
    (output/'native.json').write_text(json.dumps(report,indent=2)+'\n');return report,rc
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--dotnet');a=p.parse_args();r,c=run_native(a.output,a.dotnet);print(json.dumps(r,indent=2));raise SystemExit(c)
