import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../infra.mjs';
const response=await fetch('http://127.0.0.1:9238/json/version');const {webSocketDebuggerUrl}=await response.json();
const socket=new WebSocket(webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let index=0;const pending=new Map();socket.onmessage=e=>{const message=JSON.parse(e.data);if(pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(Error(message.error.message)):resolve(message.result);}};
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++index;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
let target;
try{
  target=(await send('Target.createTarget',{url:'about:blank'})).targetId;
  const {sessionId}=await send('Target.attachToTarget',{targetId:target,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  await command('Page.enable');await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
  await command('Page.navigate',{url:'file:///'+path.join(ROOT,'reports/panel-preview.html').replaceAll('\\','/')});
  await new Promise(r=>setTimeout(r,3500));
  const {result}=await command('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,checks:JSON.parse(document.querySelector("#qa-results").textContent)})',returnByValue:true});
  const qa=JSON.parse(result.value);console.log(JSON.stringify(qa,null,2));
  if(qa.width!==390||qa.scrollWidth>390||qa.checks.some(c=>!c.ok))throw Error('Layout mobile invalido');
  const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(ROOT,'reports/panel-mobile.png'),Buffer.from(data,'base64'));
  fs.writeFileSync(path.join(ROOT,'reports/panel-mobile-qa.json'),JSON.stringify(qa,null,2));
}finally{if(target)await send('Target.closeTarget',{targetId:target});socket.close();}
