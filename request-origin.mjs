// Codespaces rewrites Origin to https://localhost:PORT for forwarded requests.
// Accept that alias only at the configured local proxy and with browser metadata
// proving a same-origin fetch. Never trust X-Forwarded-Host/Origin for this check.
export function requestOriginAllowed(req,{origin,proxyHost=null}){
  let expected;
  try{expected=new URL(origin);}catch{return false;}
  if(!['http:','https:'].includes(expected.protocol)||expected.origin!==origin)return false;
  if(req.headers.origin===origin)return true;
  if(expected.protocol!=='https:'||typeof proxyHost!=='string'||!/^localhost:[1-9][0-9]{0,4}$/.test(proxyHost)||Number(proxyHost.split(':')[1])>65535)return false;
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)
    &&req.headers.host===proxyHost&&req.headers.origin==='https://'+proxyHost
    &&req.headers['sec-fetch-site']==='same-origin';
}
