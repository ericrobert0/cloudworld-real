// Read-only by default. Optional repair re-encrypts only the managed service
// account's unreadable secret using its existing private CloudWorld credential.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {tenantPath,RUNTIME,writeJSON} from '../infra.mjs';
import {IntegrationHub,requestApp} from '../integration.mjs';
import {assertPresentationTenant} from '../codespaces.mjs';
import {containerCommand} from '../container-runtime.mjs';
const id=process.argv[2]||'apresentacao',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
const repair=process.argv.includes('--repair-stored-secret');
if(process.argv.slice(3).some(arg=>arg!=='--repair-stored-secret'))throw Error('Opcao desconhecida.');
assertPresentationTenant(tenant);
const settings=new IntegrationHub().settings(id).connectors.erp;
if(!settings?.apiKey||!settings.apiSecret)throw Error('Conector ERP sem credenciais.');
const code=`import os,json,sys
os.chdir('/home/frappe/frappe-bench/sites')
import frappe
from frappe.utils.password import get_decrypted_password,set_encrypted_password
frappe.init(site='frontend')
frappe.connect()
expected=json.load(sys.stdin)
email='cloudworld-integration@local.invalid'
row=frappe.db.get_value('User',email,['enabled','api_key'],as_dict=True)
secret=get_decrypted_password('User',email,'api_secret',raise_exception=False) if row else None
stored=frappe.db.sql("select password from __Auth where doctype='User' and name=%s and fieldname='api_secret' and encrypted=1",email)
repaired=False
if expected.get('_repairUnreadable') and row and row.enabled and row.api_key==expected['apiKey'] and stored and not secret:
 import uuid
 backup='frontend/private/backups/cloudworld-api-secret-'+str(uuid.uuid4())+'.private.json'
 os.makedirs(os.path.dirname(backup),exist_ok=True)
 fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as target: json.dump({'user':email,'ciphertext':stored[0][0]},target)
 set_encrypted_password('User',email,expected['apiSecret'],'api_secret')
 frappe.db.commit()
 secret=get_decrypted_password('User',email,'api_secret',raise_exception=False)
 repaired=secret==expected['apiSecret']
print('CWJSON:'+json.dumps({'userExists':bool(row),'enabled':bool(row and row.enabled),'apiKeyMatches':bool(row and row.api_key==expected['apiKey']),'apiSecretReadable':bool(secret),'apiSecretStored':bool(stored),'apiSecretMatches':bool(secret and secret==expected['apiSecret']),'repairedUnreadableSecret':repaired}))
frappe.destroy()
`;
let output;
try{const cli=containerCommand(['exec','-i',tenant.project+'-erp-backend-1','/home/frappe/frappe-bench/env/bin/python','-c',code]);output=execFileSync(cli.command,cli.args,{env:cli.env,input:JSON.stringify({...settings,_repairUnreadable:repair}),encoding:'utf8',timeout:30000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});}
catch{throw Error('Consulta administrativa ERP falhou; credenciais nao foram impressas.');}
const line=output.split('\n').find(line=>line.startsWith('CWJSON:'));if(!line)throw Error('Resposta de diagnostico inesperada.');
const response=await requestApp((tenant.apiUrls||tenant.urls).erp+'/api/method/frappe.auth.get_logged_user',{headers:{Authorization:'token '+settings.apiKey+':'+settings.apiSecret}});
const result={at:new Date().toISOString(),client:id,...JSON.parse(line.slice(7)),httpStatus:response.status,authenticated:response.status===200&&response.data?.message==='cloudworld-integration@local.invalid',errorType:/^[A-Za-z]+$/.test(response.data?.exc_type||'')?response.data.exc_type:undefined};
writeJSON(path.join(RUNTIME,'reports','erp-credential-consistency.json'),result);console.log(JSON.stringify(result));
if(!result.authenticated)process.exitCode=1;
