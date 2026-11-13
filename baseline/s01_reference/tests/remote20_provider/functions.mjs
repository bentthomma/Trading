// Test double only: no SDK, network or durability claim. Production consumer unchanged.
export function getCache(options){
 globalThis.__remoteProviderNamespaces??=[];globalThis.__remoteProviderNamespaces.push(structuredClone(options));
 return {
  async get(key){const s=globalThis.__remoteProvider;s.trace.push({op:'cache.get',key});if(s.cacheGetError)throw s.cacheGetError;const r=s.cache.get(key);return r&&r.until>Date.now()?structuredClone(r.value):null;},
  async set(key,value,options){const s=globalThis.__remoteProvider;s.trace.push({op:'cache.set',key,ttl:options.ttl});const fail=s.failSet?.(key,value);if(fail==='before')throw Error('SYNTHETIC_PRIVATE_CACHE_ERROR');s.cache.set(key,{value:structuredClone(value),until:Date.now()+options.ttl*1000});if(fail==='after')throw Error('SYNTHETIC_PRIVATE_CACHE_ERROR');}
 };
}
