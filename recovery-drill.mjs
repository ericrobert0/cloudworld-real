import crypto from 'node:crypto';
export function databaseDrillPlan(service,{project}={}){
  if(!/^vw-restore-[a-z0-9-]{8,70}$/.test(project||'')||!/@sha256:[a-f0-9]{64}$/.test(service?.image||''))throw Error('Ensaio exige projeto exclusivo e imagem fixa');
  const pg=!!service.environment?.POSTGRES_DB;
  if(!pg&&!service.environment?.MARIADB_ROOT_PASSWORD)throw Error('Banco nao suportado');
  const password=crypto.randomBytes(32).toString('hex');
  const user=pg?service.environment.POSTGRES_USER:'root',database=pg?service.environment.POSTGRES_DB:null;
  if(pg&&(!/^[a-zA-Z0-9_]{1,63}$/.test(user)||!/^[a-zA-Z0-9_]{1,63}$/.test(database)))throw Error('Identificador de banco invalido');
  const make=(peer)=>({image:service.image,restart:'no',mem_limit:'512m',cpus:0.5,pids_limit:128,security_opt:['no-new-privileges:true'],
    environment:pg?{POSTGRES_USER:peer?user:'cw_restore_admin',POSTGRES_PASSWORD:peer?password:crypto.randomBytes(32).toString('hex'),POSTGRES_DB:peer?database:'cw_restore_maintenance'}:{MARIADB_ROOT_PASSWORD:peer?password:service.environment.MARIADB_ROOT_PASSWORD},
    volumes:[`data-${peer?'b':'a'}:${pg?'/var/lib/postgresql/data':'/var/lib/mysql'}`],networks:[peer?'b':'a'],
    healthcheck:{test:['CMD-SHELL',pg?`pg_isready -h 127.0.0.1 -U ${peer?user:'cw_restore_admin'} -d ${peer?database:'cw_restore_maintenance'}`:'MYSQL_PWD="$$MARIADB_ROOT_PASSWORD" mariadb --protocol=tcp -h127.0.0.1 -uroot -Nse "SELECT 1" >/dev/null'],interval:'2s',timeout:'3s',retries:80,start_period:'10s'}});
  return {pg,user,database,password,compose:{name:project,services:{a:make(false),b:make(true)},networks:{a:{internal:true},b:{internal:true}},volumes:{'data-a':{},'data-b':{}}}};
}
