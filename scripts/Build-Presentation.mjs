import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
let html=read('presentation/presentation.html');const js=read('presentation/presentation.js');new vm.Script(js);
for(const [marker,file] of [['/* BOOTSTRAP */','public/vendor/bootstrap.min.css'],['/* PORTAL_CSS */','public/portal.css'],['/* DEMO_CSS */','presentation/presentation.css'],['/* DEMO_JS */','presentation/presentation.js']])html=html.replace(marker,()=>read(file).replace(/<\/script/gi,'<\\/script'));
if(/\bfetch\s*\(|XMLHttpRequest|<script[^>]+src=|<link[^>]+href=/.test(html))throw Error('Apresentacao nao deve depender de rede ou backend');
const dest=path.join(root,'presentation','CloudWorld-Apresentacao.html');fs.writeFileSync(dest,html);console.log('Apresentacao independente criada: '+dest);
