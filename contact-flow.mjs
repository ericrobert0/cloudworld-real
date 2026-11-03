export const contactFlow={workflowId:'cloudworldContactReceiverV2',credentialId:'cloudworldContactHeaderV2',webhookPath:'cloudworld-contact-events'};
export function contactWorkflow(){
  return {
    id:contactFlow.workflowId,name:'CloudWorld - Confirmar recebimento de contatos',active:false,
    nodes:[
      {id:'cw-contact-webhook',name:'Receber contato',type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],webhookId:contactFlow.webhookPath,
        parameters:{httpMethod:'POST',path:contactFlow.webhookPath,authentication:'headerAuth',responseMode:'responseNode',options:{}},
        credentials:{httpHeaderAuth:{id:contactFlow.credentialId,name:'CloudWorld contact receiver'}}},
      {id:'cw-contact-ack',name:'Confirmar processamento',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.4,position:[260,0],
        parameters:{respondWith:'json',responseBody:'={{ {accepted: true, tenant: $json.body.tenant, eventId: $json.body.id} }}',options:{responseCode:200}}}
    ],connections:{'Receber contato':{main:[[{node:'Confirmar processamento',type:'main',index:0}]]}},
    settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none'}
  };
}
export function contactRoutes(existing){
  const required=[{id:'cloudworld-contact-erp',event:'contact.created',app:'erp',operation:'customers.upsert',enabled:true},
    {id:'cloudworld-contact-n8n',event:'contact.created',app:'n8n',operation:'events.send',enabled:true}];
  for(const route of existing){
    const managed=required.find(r=>r.id===route.id);
    if(managed&&JSON.stringify(route)!==JSON.stringify(managed)){
      if(route.event!==managed.event||route.app!==managed.app||route.operation!==managed.operation||route.enabled!==true)throw Error('Fluxo gerenciado alterado ou desativado; revise antes de continuar');
    }
    if(route.enabled&&route.event==='contact.created'&&!managed)throw Error('Ha outro fluxo ativo de contatos; revise os efeitos antes de executar o ensaio');
  }
  const merged=[...existing,...required.filter(wanted=>!existing.some(route=>route.id===wanted.id))];
  if(merged.length>20)throw Error('Limite de rotas atingido; revise antes de preparar o fluxo');
  return merged;
}

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function assertManagedContactWorkflow(published){
  const expected=contactWorkflow();
  if(published?.id!==contactFlow.workflowId||published.active!==true||typeof published.activeVersionId!=='string'||!published.activeVersionId
    ||JSON.stringify(canonical(published.nodes))!==JSON.stringify(canonical(expected.nodes))
    ||JSON.stringify(canonical(published.connections))!==JSON.stringify(canonical(expected.connections)))throw Error('Workflow publicado foi alterado ou nao esta ativo; ensaio interrompido antes de criar contatos');
}
