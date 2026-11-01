import fs from 'node:fs';
import http from 'node:http';
const html=fs.readFileSync(new URL('../presentation/CloudWorld-Apresentacao.html',import.meta.url));
const server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'"});res.end(html);});
server.listen(8098,'127.0.0.1',()=>console.log('Previa local: http://127.0.0.1:8098/ · PID '+process.pid));
setTimeout(()=>server.close(),600000).unref();
