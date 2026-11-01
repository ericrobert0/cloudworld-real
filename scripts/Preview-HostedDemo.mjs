import http from 'node:http';
import fs from 'node:fs';
const dir=new URL('../sites/cloudworld-demo/dist/',import.meta.url);
const server=http.createServer((req,res)=>{const file={'/':'index.html','/admin.html':'admin.html','/cliente.html':'cliente.html'}[req.url?.split('?')[0]];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(new URL(file,dir)));});
server.listen(8098,'127.0.0.1',()=>console.log('Preview 127.0.0.1:8098 PID '+process.pid));
setTimeout(()=>server.close(),600000).unref();
