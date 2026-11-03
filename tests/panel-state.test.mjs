import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/panel.js',import.meta.url),'utf8');
const start=source.indexOf('function rowsFor('),end=source.indexOf('function safeUrl(');
const context=vm.createContext({snapshot:{engine:{containers:[]}}});
vm.runInContext(source.slice(start,end)+';this.evaluate=tenantState;',context);

test('completed Temporal initializer does not mark a running company as partially active',()=>{
 const row=(name,state,status)=>({Project:'vw-alpha',Names:'vw-alpha-'+name+'-1',State:state,Status:status});
 context.snapshot.engine.containers=[row('chat','running','Up 1 minute'),row('temporal-init','exited','Exited (0) 1 minute ago')];
 assert.equal(context.evaluate({project:'vw-alpha'})[0],'Em execução');
 context.snapshot.engine.containers[1].Status='Exited (1) 1 minute ago';
 assert.equal(context.evaluate({project:'vw-alpha'})[0],'Precisa de atenção');
 context.snapshot.engine.containers=[row('chat','exited','Exited (0) 1 minute ago'),row('erp','running','Up 1 minute')];
 assert.equal(context.evaluate({project:'vw-alpha'})[0],'Parcialmente ativo');
});
