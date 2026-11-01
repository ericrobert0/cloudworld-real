import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../infra.mjs';
const snapshot=JSON.parse(fs.readFileSync(path.join(ROOT,'reports/ui-snapshot.json')));
const fixture=JSON.stringify(snapshot).replaceAll('<','\\u003c');
let html=fs.readFileSync(path.join(ROOT,'public/index.html'),'utf8');
html=html.replace('/assets/bootstrap.min.css',pathToFileURL(path.join(ROOT,'public/vendor/bootstrap.min.css')).href).replace('/assets/panel.css',pathToFileURL(path.join(ROOT,'public/panel.css')).href);
html=html.replace('/* PANEL_APP */',()=>`window.fetch=async()=>new Response(JSON.stringify(${fixture}),{status:200,headers:{'Content-Type':'application/json'}});\n`+fs.readFileSync(path.join(ROOT,'public/panel.js'),'utf8')+`
setTimeout(()=>{
 const results=[];
 const check=(name,ok)=>results.push({name,ok});
 for(const view of Object.keys(titles)){navigate(view);check('Navegacao '+view,document.querySelectorAll('[data-section]:not([hidden])').length===1&&document.querySelector('[data-section="'+view+'"]').hidden===false);}
 navigate('companies');document.querySelector('#search').value='empresa-inexistente-qa';renderCompanies();check('Busca sem resultado',document.querySelector('#all-tenants .empty-state')!==null);document.querySelector('#search').value='';
 render(snapshot);navigate('overview');check('Aplicacoes disponiveis',document.querySelectorAll('#overview-tenants .app-link').length===snapshot.tenants.reduce((n,t)=>n+Object.keys(t.urls).length,0));
 check('Sem rolagem horizontal',document.documentElement.scrollWidth<=window.innerWidth);
 const output=document.createElement('output');output.id='qa-results';output.hidden=true;output.textContent=JSON.stringify(results);document.body.append(output);
},1800);
`);
fs.writeFileSync(path.join(ROOT,'reports/panel-preview.html'),html);
