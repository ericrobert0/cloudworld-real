import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../presentation/demo-store.js',import.meta.url),'utf8'),memory=new Map();
let download;
function open(){const ctx=vm.createContext({localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},crypto:{randomUUID},Blob,URL:{createObjectURL:b=>{download=b;return 'blob:demo';},revokeObjectURL(){}},document:{createElement:()=>({click(){}})},setTimeout:fn=>fn()});return vm.runInContext(source+'\nCW',ctx);}
let cw=open();const c=cw.addCompany('Empresa de teste');cw.contact(c.id,'Contato fictício','Solicitação de teste');
assert.equal(cw.company(c.id).contacts.length,1);assert.equal(cw.company(c.id).tasks.length,1);assert.equal(cw.company('cafe').contacts.length,0);
cw=open();assert.equal(cw.company(c.id).contacts[0].name,'Contato fictício');
cw.finish(c.id,cw.company(c.id).tasks[0].id);assert.equal(cw.company(c.id).tasks[0].done,true);
cw.post(c.id,'Rascunho fictício');cw.toggle(c.id);assert.throws(()=>cw.contact(c.id,'Novo','Bloqueado'),/suspensa/);assert.throws(()=>cw.post(c.id,'Bloqueado'),/suspensa/);
cw.download('demo.json',{company:cw.company(c.id)});const payload=JSON.parse(await download.text());assert.equal(payload.company.contacts.length,1);assert.equal(payload.company.posts.length,1);assert.equal(payload.company.active,false);
assert.ok(cw.state.history.some(e=>e.text.includes('Tarefa concluída')));
console.log('OK: persistência, contato → tarefa, conclusão, dados por empresa, suspensão, rascunho, exportação JSON e histórico.');
