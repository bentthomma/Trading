import { join } from 'node:path';

// TAP can name an import failure by its absolute filename. Only public source
// titles and fixed relative test filenames may enter the technical report.
export function projectAcceptanceTap(log,{root,testSources,mandatoryTitles=[],expectedSkips=[]}={}){
  const normalized=String(log).replace(/\r\n/g,'\n'),knownTitles=new Set(),knownPaths=new Map();
  const pathKey=value=>String(value).replaceAll('\\','/').toLowerCase();
  for(const [file,source] of Object.entries(testSources)){
    knownPaths.set(pathKey(join(root,file)),file);knownPaths.set(pathKey(file),file);
    for(const match of String(source).matchAll(/(?:\btest|\.test)\(\s*(?:'([^'\\\r\n]{1,240})'|"([^"\\\r\n]{1,240})")/g))knownTitles.add(match[1]??match[2]);
  }
  const publicTitle=(title,unknown)=>knownTitles.has(title)?title:knownPaths.get(pathKey(title))??unknown;
  const counts={};
  for(const match of normalized.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm)){
    const count=Number(match[2]);if(Number.isSafeInteger(count)&&count<=1000000)counts[match[1]]=count;
  }
  const skipped=[...normalized.matchAll(/^\s*ok \d+ - (.*?) # SKIP(?: (.*))?$/gm)].map(match=>publicTitle(match[1],'unknown_skipped_test'));
  const failed=[...normalized.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(match=>publicTitle(match[1],'unknown_test_failure'));
  const passedTitles=new Set([...normalized.matchAll(/^\s*ok \d+ - (.*?)(?: # SKIP(?: .*)?)?$/gm)]
    .filter(match=>!match[0].includes(' # SKIP')&&knownTitles.has(match[1])).map(match=>match[1]));
  const skipSet=new Set(expectedSkips);
  return {counts,skipped,failed,missingMandatory:mandatoryTitles.filter(title=>!passedTitles.has(title)),
    unexpectedSkips:skipped.filter(title=>!skipSet.has(title))};
}
