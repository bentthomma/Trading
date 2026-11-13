import {getCache} from '@vercel/functions';
import {get,put} from '@vercel/blob';
import {authenticated} from '../lib/security.mjs';
import {RemoteView20Service} from '../lib/service.mjs';
import {createRemoteView20Handler} from '../lib/http.mjs';
export const config={api:{bodyParser:false}};
const recordPath='th3rev20/private/view-device-v1.json';
const cache=getCache({namespace:'th3rev20:'+(process.env.VERCEL_PROJECT_ID||'extremelab-desk')+':view-v1'});
const registry={
 async read(){const r=await get(recordPath,{access:'private',useCache:false});if(!r)return null;if(r.statusCode!==200||!r.stream)throw Error('REMOTE_REGISTRY_READ_FAILED');const reader=r.stream.getReader();let size=0,parts=[];for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>8192){await reader.cancel();throw Error('REMOTE_REGISTRY_TOO_LARGE');}parts.push(Buffer.from(x.value));}return {record:JSON.parse(Buffer.concat(parts).toString('utf8')),etag:r.blob.etag};},
 async write(record,etag){await put(recordPath,JSON.stringify(record),{access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});}
};
const service=new RemoteView20Service({cache,registry});
export default createRemoteView20Handler({service,authenticated,origins:()=>[process.env.APP_ORIGIN,process.env.VERCEL_URL&&'https://'+process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL&&'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean)});
