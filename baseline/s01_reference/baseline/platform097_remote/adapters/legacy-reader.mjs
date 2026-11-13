// Retained strict credential parser and exact decimal conversion from the recovered reader.
// Network clients, cookie credentials and inferred unit normalization have been removed.
export class ReaderError extends Error {
 constructor(code,status=502){super(code);this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new ReaderError(code,status);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ascii=x=>typeof x==='string'&&/^[\x21-\x7e]+$/.test(x);
export function parseCredential(input){
 if(typeof input!=='string'||input.length>16000)fail('INVALID_CONFIGURATION',400);
 let token=input.trim();
 if(token.startsWith('{')){
  let config;try{config=JSON.parse(token);}catch{fail('INVALID_CONFIGURATION',400);}
  if(object(config?.mcpServers)){
   const entries=Object.values(config.mcpServers);
   if(entries.length!==1)fail('SELECT_ONE_CTRADER_CONFIGURATION',400);
   config=entries[0];
  }
  if(!object(config)||typeof config.url!=='string'||!object(config.headers))fail('INVALID_CONFIGURATION',400);
  let u;try{u=new URL(config.url);}catch{fail('INVALID_CONFIGURATION',400);}
  if(u.protocol!=='https:'||u.hostname!=='mcp.ctrader.com'||u.port||u.username||u.password||u.search||u.hash||!['/data/mcp','/trading/mcp'].includes(u.pathname))fail('OFFICIAL_CTRADER_URL_REQUIRED',400);
  const keys=Object.keys(config.headers);
  if(keys.length!==1||keys[0].toLowerCase()!=='authorization')fail('ONLY_AUTHORIZATION_HEADER_ACCEPTED',400);
  token=config.headers[keys[0]];
 }
 if(typeof token!=='string')fail('INVALID_TOKEN',400);
 token=token.trim().replace(/^Bearer\s+/i,'');
 if(!ascii(token)||token.length<32||token.length>2200||token.includes('"')||token.includes('\\'))fail('INVALID_TOKEN',400);
 return token;
}

export function decimal(raw,digits){
 if(!Number.isInteger(digits)||digits<0||digits>12)return null;
 let x;if(typeof raw==='number'){if(!Number.isSafeInteger(raw))return null;x=BigInt(raw);}else if(typeof raw==='string'&&/^-?\d{1,28}$/.test(raw)){x=BigInt(raw);}else return null;
 const negative=x<0n;if(negative)x=-x;
 const s=x.toString().padStart(digits+1,'0');
 return (negative?'-':'')+(digits?s.slice(0,-digits)+'.'+s.slice(-digits):s);
}
