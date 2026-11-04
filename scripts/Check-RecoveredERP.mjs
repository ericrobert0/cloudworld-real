import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {containerCommand} from '../container-runtime.mjs';

const work=path.resolve(process.argv[2]||'');
const project=path.basename(work);
if(!/^vw-recovery-\d+$/.test(project))throw Error('Informe a pasta do ensaio de recuperação.');
const dir=path.join(work,'runtime','tenants','piloto');
const tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(tenant.project!==project)throw Error('Projeto da cópia não corresponde ao ensaio.');
const settings=JSON.parse(fs.readFileSync(path.join(dir,'integrations.private.json'))).connectors.erp;
const code=`
import json,os,sys,urllib.request,urllib.error
expected=json.load(sys.stdin)
result={}
os.chdir('/home/frappe/frappe-bench/sites')
import frappe
try:
 frappe.init(site='frontend')
 frappe.connect()
 from frappe.utils.password import get_decrypted_password
 email='cloudworld-integration@local.invalid'
 row=frappe.db.get_value('User',email,['enabled','api_key'],as_dict=True)
 result['accountExists']=bool(row)
 result['accountEnabled']=bool(row and row.enabled)
 result['apiKeyMatches']=bool(row and row.api_key==expected['apiKey'])
 result['customersPresent']=frappe.db.count('Customer')>0
 try:
  secret=get_decrypted_password('User',email,'api_secret',raise_exception=False)
  result['apiSecretReadable']=bool(secret)
  result['apiSecretMatches']=bool(secret and secret==expected['apiSecret'])
 except Exception as error:
  result['secretErrorType']=type(error).__name__
except Exception as error:
 result['databaseErrorType']=type(error).__name__
finally:
 frappe.destroy()
for name,target,host in [('backend','http://127.0.0.1:8000','frontend'),('frontend','http://erp:8080',expected['httpHost'])]:
 request=urllib.request.Request(target+'/api/method/frappe.auth.get_logged_user',headers={'Host':host,'Authorization':'token '+expected['apiKey']+':'+expected['apiSecret']})
 try:
  with urllib.request.urlopen(request,timeout=10) as response:
   result[name+'HttpStatus']=response.status
 except urllib.error.HTTPError as error:
  result[name+'HttpStatus']=error.code
  try:
   result[name+'HttpErrorType']=json.load(error).get('exc_type')
  except Exception:
   result[name+'HttpErrorType']='unknown'
 except Exception as error:
  result[name+'TransportErrorType']=type(error).__name__
print('CWJSON:'+json.dumps(result))
`;
const cli=containerCommand(['exec','-i',project+'-erp-backend-1','/home/frappe/frappe-bench/env/bin/python','-c',code]);
let output;
try{
  output=execFileSync(cli.command,cli.args,{env:cli.env,input:JSON.stringify({...settings,httpHost:new URL(tenant.urls.erp).host}),encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});
}catch{
  throw Error('Diagnóstico ERP indisponível. Confira a cópia e o container de backend.');
}
const line=output.split('\n').find(line=>line.startsWith('CWJSON:'));
if(!line)throw Error('Diagnóstico sem resposta estruturada.');
const report=JSON.parse(line.slice(7));
console.log(JSON.stringify(report));
if(!report.apiSecretMatches||!report.apiKeyMatches||!report.customersPresent||report.backendHttpStatus!==200||report.frontendHttpStatus!==200)process.exitCode=1;
