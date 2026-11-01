// Registry metadata only: does not pull images, start Docker or change tenants.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const images=new Set();
for(const name of ['infra.mjs','postiz.mjs']){
  const source=fs.readFileSync(new URL(name,root),'utf8');
  for(const match of source.matchAll(/['"]((?:[a-z0-9.-]+\/)*[a-z0-9.-]+:[a-zA-Z0-9._-]+)['"]/g)){
    if(/^(postgres|redis|pgvector\/|ghcr\.io\/|chatwoot\/|devlikeapro\/|docker\.n8n\.io\/|nextcloud|mariadb|frappe\/|caddy|lscr\.io\/|temporalio\/)/.test(match[1]))images.add(match[1]);
  }
}
const results=[];
for(const image of images){
  let item={image,status:'unknown',linuxArm64:null};
  try{
    const manifest=JSON.parse(execFileSync('docker',['buildx','imagetools','inspect','--raw',image],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,stdio:['ignore','pipe','pipe']}));
    if(Array.isArray(manifest.manifests)){
      const platforms=manifest.manifests.map(x=>x.platform).filter(x=>x&&x.os!=='unknown');
      item.platforms=platforms.map(x=>`${x.os}/${x.architecture}${x.variant?'/'+x.variant:''}`);
      item.linuxArm64=platforms.some(x=>x.os==='linux'&&x.architecture==='arm64');
      item.status=item.linuxArm64?'arm64-published':'arm64-not-published';
    }else item.note='Single manifest: platform requires config inspection; not assumed compatible.';
  }catch(e){item.error=String(e.stderr||e.message).slice(-800);}
  results.push(item);console.log(`${item.status}: ${image}`);
}
const report={at:new Date().toISOString(),scope:'Requested source image tags; registry metadata only, not runtime validation or immutable-image migration approval.',results};
fs.mkdirSync(new URL('reports/',root),{recursive:true});
fs.writeFileSync(new URL('reports/oracle-arm-compatibility.json',root),JSON.stringify(report,null,2)+'\n');
console.log(`Checked ${results.length} image tags. Report: reports/oracle-arm-compatibility.json`);
