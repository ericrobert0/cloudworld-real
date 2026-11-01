export function addMixpost(compose,{id,url,secrets}){
  const username=`mixpost_${id.replaceAll('-','_')}`;
  compose.networks['mixpost-data']={};
  for(const name of ['mixpost-db','mixpost-redis','mixpost-storage','mixpost-logs'])compose.volumes[name]={};
  const base={restart:'unless-stopped',cpus:1,pids_limit:512,logging:{driver:'json-file',options:{'max-size':'10m','max-file':'3'}}};
  const health=test=>({test:['CMD-SHELL',test],interval:'15s',timeout:'10s',start_period:'600s',retries:20});
  compose.services['mixpost-db']={...base,image:'mariadb:11.8',networks:['mixpost-data'],mem_limit:'512m',environment:{MARIADB_DATABASE:username,MARIADB_USER:username,MARIADB_PASSWORD:secrets.mixpost,MARIADB_ROOT_PASSWORD:secrets.mixpostRoot},volumes:['mixpost-db:/var/lib/mysql'],healthcheck:health('healthcheck.sh --connect --innodb_initialized')};
  compose.services['mixpost-redis']={...base,image:'redis:7.2-alpine',networks:['mixpost-data'],mem_limit:'256m',command:['redis-server','--appendonly','yes'],volumes:['mixpost-redis:/data'],healthcheck:health('redis-cli ping | grep -q PONG')};
  compose.services.mixpost={...base,image:'inovector/mixpost:v2.6.0',networks:['mixpost-data','proxy'],mem_limit:'1024m',environment:{APP_NAME:'CloudWorld Midias',APP_ENV:'production',APP_KEY:'base64:'+Buffer.from(secrets.mixpostKey,'hex').toString('base64'),APP_DEBUG:'false',APP_DOMAIN:new URL(url).host,APP_URL:url,DB_CONNECTION:'mysql',DB_HOST:'mixpost-db',DB_PORT:'3306',DB_DATABASE:username,DB_USERNAME:username,DB_PASSWORD:secrets.mixpost,REDIS_HOST:'mixpost-redis',REDIS_PORT:'6379',QUEUE_CONNECTION:'redis',SESSION_SECURE_COOKIE:'true',TZ:'America/Sao_Paulo'},volumes:['./mixpost-start.sh:/usr/local/bin/start.sh:ro','mixpost-storage:/var/www/html/storage/app','mixpost-logs:/var/www/html/storage/logs'],depends_on:{'mixpost-db':{condition:'service_healthy'},'mixpost-redis':{condition:'service_healthy'}},healthcheck:health('curl -fsS http://127.0.0.1/mixpost/login > /dev/null')};
}
