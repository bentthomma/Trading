// Explicit in-memory Blob protocol double; records exact production SDK arguments.
export async function get(path,options){
 const s=globalThis.__remoteProvider;s.trace.push({op:'blob.get',path,options:structuredClone(options)});
 if(s.getError)throw s.getError;if(s.record===null&&s.raw===undefined)return null;
 const bytes=Buffer.from(s.raw??JSON.stringify(s.record)),chunkSize=s.chunkSize??137;
 return {statusCode:s.statusCode??200,blob:{etag:String(s.etag)},stream:s.noStream?null:new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=chunkSize)c.enqueue(new Uint8Array(bytes.subarray(i,i+chunkSize)));},pull(c){c.close();},cancel(){s.cancelled++;}})};
}
export async function put(path,body,options){
 const s=globalThis.__remoteProvider;s.trace.push({op:'blob.put',path,options:structuredClone(options)});
 if(s.beforePut){const fn=s.beforePut;s.beforePut=null;fn(s);}
 if(s.putError)throw s.putError;
 if(s.record===null?options.allowOverwrite!==false:options.ifMatch!==String(s.etag)||options.allowOverwrite!==true)throw Error('SYNTHETIC_ETAG_CONFLICT');
 s.record=JSON.parse(body);s.etag++;s.writes++;
 if(s.afterPutError)throw s.afterPutError;
 return {etag:String(s.etag)};
}
