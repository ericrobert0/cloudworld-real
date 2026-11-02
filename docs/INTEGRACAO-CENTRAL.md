# CloudWorld: API central e monitoramento

A central de integracao roda no processo do painel local, em `127.0.0.1:8099`.
Nao expoe bancos, nao monta o socket Docker nas aplicacoes e nao substitui o SSO.
Os nomes internos `D:\VlanWorld`, `vw-*` e a tarefa Windows permanecem para preservar instalacoes e dados.

## Uso no painel

1. Em **Integracoes e API**, selecione uma empresa, informe credenciais de API de cada aplicacao e habilite a conexao.
2. Use **Testar conexao**. Configurada significa que os campos foram preenchidos; autenticada exige uma resposta valida da API.
3. Cadastre fluxos: evento, destino e operacao. O payload precisa conter os campos da operacao escolhida.
4. Crie uma chave para a origem dos eventos. Ela aparece uma vez e pode ser revogada. O token so funciona na empresa onde foi criado.
5. Consulte as entregas. Falhas temporarias recebem ate cinco tentativas com espera crescente. Falhas permanentes exigem revisao e reenvio manual.

**Monitoramento** separa respostas HTTP, alvos de rede, autenticacao das APIs e estados dos containers. O ciclo aguarda 15 segundos entre verificacoes; uma rodada pode durar mais conforme numero de clientes e timeouts.
Estagios Docker/OCI: created, starting (healthcheck), running, restarting, paused, removing, stopped ou failed. O estado stopping agora e derivado de eventos reais de encerramento do runtime e aparece como Parando. A transicao expira em 120 segundos ou e removida quando a parada/inicializacao e confirmada; uma desconexao da coleta tambem invalida essa transicao. O historico mantem no maximo 100 eventos nesta sessao, sem labels arbitrarios ou segredos. A separacao usa o projeto Compose exato, inclusive para empresas com nomes parecidos. OCI aqui significa containers Open Container Initiative, nao uma integracao com Oracle Cloud.

O painel usa um unico leitor de eventos com limite de entrada e reconexao com espera progressiva. Isso reconecta a observacao, sem reiniciar o daemon Docker. Consulte [eventos do Docker](https://docs.docker.com/reference/cli/docker/system/events/). O ensaio `node scripts/Test-DockerLifecycle.mjs` usa um container descartavel de 32 MB, sem rede, volumes ou privilegios; a execucao real precisa de Docker disponivel. No Codespaces, `node scripts/Configure-CodespacesMonitoring.mjs apresentacao` configura PING local, DNS e TCP dos paineis e testa ARP do gateway sem inventar equipamentos SNMP externos.

## API v1

Base por empresa: `/api/v1/tenants/EMPRESA`.
Autenticacao de integracoes: `Authorization: Bearer CHAVE`.
Operador: autenticacao Basic existente; mutacoes tambem exigem `Origin: http://127.0.0.1:8099`.
As chaves criadas na tela podem enviar/consultar eventos. Somente o operador administra conexoes, chaves, rotas e monitoramento.
No Docker Desktop, containers usam `http://host.docker.internal:8099/api/v1/tenants/EMPRESA/...` com chave Bearer. Esse Host somente permite a API por empresa com token; painel e acesso Basic continuam bloqueados por esse nome. O listener permanece em loopback e nao se publica uma porta externa adicional.

| Metodo e rota | Finalidade / escopo |
| --- | --- |
| GET /integrations | Conectores e rotas sem segredos; connectors:read |
| PUT /integrations | Configurar conectores/rotas; operador |
| POST /keys | Gerar token, nome e scopes; operador |
| DELETE /keys/ID | Revogar token; operador |
| POST /events | Receber evento normalizado; events:write |
| GET /events | Ultimos 100 eventos, sem payload; events:read |
| POST /sources/chat/scan | Consultar contatos agora; operador |
| POST /events/ID/retry | Reprocessar entregas que falharam; operador |
| POST /webhooks/chat | Normalizar contact_created/message_created do Chatwoot; events:write |
| POST /webhooks/waha | Normalizar message recebido; events:write |
| POST /connectors/APP/OPERACAO | Chamada especifica, JSON; escopo APP:OPERACAO |
| GET /monitoring | Ultimo ciclo; operador |
| PUT /monitoring | Substituir lista de alvos; operador |

Exemplo de evento: `POST /events`, `Content-Type: application/json`, `Idempotency-Key: contato-123`:

```json
{"type":"contact.created","payload":{"name":"Cliente Exemplo","email":"cliente@example.com"}}
```

Eventos aceitos: contact.created, message.received, sale.created, file.created, social.published. Os tres ultimos exigem que a origem publique explicitamente o evento; nao existe captura automatica de todas as alteracoes nos bancos.
Webhooks nativos precisam ser cadastrados na aplicacao origem, com cabecalho Authorization. Mensagens de saida sao rejeitadas para evitar loops. WAHA usa `payload.id`; Chatwoot usa o ID do contato/mensagem.

Como alternativa aos webhooks, habilite **Capturar novos contatos do Chatwoot**. A primeira consulta registra a base existente sem importar contatos antigos. As consultas seguintes percorrem a API paginada e publicam contact.created para contatos novos resolvidos pelo Chatwoot (com identificador, email ou telefone). O limite e 100 paginas/1.500 contatos; acima disso, a captura informa erro e precisa ser substituida por webhooks. Alteracoes e exclusoes de contatos nao sao sincronizadas por esta captura. PUT /integrations aceita `{"sources":{"chatContacts":true}}`.

## Conectores implementados

| App | Credenciais | Operacoes |
| --- | --- | --- |
| Authentik | token com permissoes minimas | check, users.list |
| Chatwoot | token da conta + accountId | check, contacts.list (page), contacts.create (name, email/phone opcionais) |
| ERPNext | apiKey + apiSecret de usuario de integracao | check, customers.upsert (name; customerGroup/territory opcionais conforme defaults do ERP) |
| Nextcloud | username + senha de aplicativo | check, folders.create (folder: um nome de pasta) |
| Postiz | chave Public API da organizacao | check, integrations.list |
| n8n | webhookPath + token Header Auth | check, events.send |
| WAHA | token API local | check, messages.send (chatId no formato numero@c.us e text) |

O webhook n8n deve estar publicado em `/webhook/CAMINHO`, com Header Auth `X-CloudWorld-Key` igual ao token configurado. O teste de saude nao valida essa chave; uma entrega bem-sucedida valida o webhook por uma hora, vinculada a configuracao usada. Apos esse periodo precisa haver nova entrega para renovar essa confirmacao.
As APIs de leitura do Authentik/Postiz estao conectadas pela central, mas isso nao configura SSO nem conecta perfis sociais automaticamente.
ERP preserva o nome recebido em customer_name e registra um marcador CloudWorld em customer_details para reconhecer reenvios da mesma origem/ID. Uma revisao do modelo de cadastros e necessaria antes de migrar clientes existentes. O n8n recebe o envelope id, tenant, type e payload.

## Rede e SNMP

PUT /monitoring recebe `{"targets":[...]}`. Tipos:

```json
{"targets":[
  {"id":"dns-publico","type":"dns","host":"example.com"},
  {"id":"vps","type":"ping","host":"192.0.2.10"},
  {"id":"https-vps","type":"tcp","host":"192.0.2.10","port":443},
  {"id":"vizinho","type":"arping","host":"192.168.1.10"},
  {"id":"roteador","type":"snmp","host":"192.168.1.1","user":"monitor","authKey":"SUBSTITUA","privKey":"SUBSTITUA"}
]}
```

SNMP usa biblioteca net-snmp, v3 authPriv SHA/AES, somente leitura de sysUpTime. Exige agente SNMPv3 habilitado no destino; nenhum agente e instalado automaticamente em outros equipamentos.
PING usa a ferramenta do sistema; no Windows consulta IPv4 e exige uma resposta echo com TTL, pois uma mensagem de destino inacessivel pode retornar codigo zero. ARPING requer binario `arping` e acesso a mesma rede Ethernet em Linux; no Windows fica **indisponivel**, nao um falso resultado positivo. Nomes `.localhost` sao locais e nao validam DNS publico. Nao configure os enderecos de exemplo como alvos reais.

## Persistencia, isolamento e limites

Configuracao, chaves (somente hash), fila e alvos ficam em arquivos privados por cliente, incluidos nos backups. Escritas usam substituicao atomica. A fila sobrevive a reinicio, possui limite de 10 mil eventos por cliente e exibe no maximo os 100 mais recentes. Cada payload pode ter ate 32 KB. Requisicoes JSON ate 64 KB, respostas de conectores ate 1 MB. Chaves limitadas a 120 requisicoes/minuto por processo.
Fila usa um unico worker no painel. Nao execute dois paineis apontando ao mesmo runtime. Para varias replicas, migrar a fila para PostgreSQL/Redis e locks transacionais.
Entrega **pelo menos uma vez**: queda depois da escrita no destino e antes da confirmacao local pode repetir efeitos. ERP tenta reconhecer o ID; demais destinos precisam deduplicar pelo X-CloudWorld-Event-Id ou id recebido no n8n. Nao e transacao distribuida nem garantia de exatamente uma vez.
Durante manutencao com .operation.lock o worker nao inicia novas entregas; uma entrega ja em curso pode terminar. Nao restaure filas antigas automaticamente sobre producao sem revisar efeitos ja realizados.
Certificados HTTPS continuam validados. Para *.localhost usa a CA local exportada e SNI; nao desliga TLS. Credenciais nao entram nos logs nem nas respostas de erro dos conectores. Segredos ficam protegidos pela ACL da instalacao, e nao criptografados individualmente; backups devem receber protecao externa.

## Validacao e publicacao

`npm ci --ignore-scripts` instala dependencias fixadas. `node --test tests/*.test.mjs` verifica isolamento, permissoes, persistencia, reenvios, HTTP, adaptadores e sondas com destinos controlados.
`scripts/Apply-Update.ps1` publica fontes na instalacao existente, preserva uma copia dos fontes anteriores e reinicia somente o painel. Containers e volumes nao sao recriados.
Testes com adaptadores simulados comprovam o contrato do codigo, nao a autenticacao de instalacoes reais. Mensagens e publicacoes externas nao sao enviadas por estes testes.

`scripts/provision-integrations.mjs EMPRESA` prepara credenciais no piloto local. Authentik recebe conta de servico e papel de leitura de usuarios; Chatwoot recebe agente dedicado; ERP recebe usuario com papel Sales User; Nextcloud recebe usuario separado para seus proprios arquivos. WAHA e Postiz usam as chaves das respectivas instancias/organizacoes. n8n recebe credencial Header Auth e um workflow receptor publicado; uma reinicializacao do n8n pode ser necessaria depois da importacao por CLI. Isso nao configura SSO, perfis sociais, pareamento WhatsApp ou os processos comerciais dentro do ERP.
Se o ERP ainda nao tem grupo de clientes/territorio, `scripts/bootstrap-erp-integration.mjs EMPRESA` cria somente arvores genericas para essa integracao. Nao cadastra empresa fiscal, moeda, plano de contas ou impostos.
`scripts/test-platform-live.mjs EMPRESA` testa APIs reais e o caminho Chatwoot → captura central → ERP e n8n. Cria registros explicitamente ficticios no piloto e uma pasta de teste no Nextcloud, testa a rejeicao de chave incorreta e revoga a chave temporaria ao terminar. Relatorio em `runtime/reports/platform-live-test.json`. Os registros de teste sao preservados para conferencia.

Referencias oficiais: [Frappe REST](https://docs.frappe.io/framework/user/en/api/rest), [Chatwoot](https://developers.chatwoot.com/api-reference/contacts/create-contact), [WAHA](https://waha.devlike.pro/docs/how-to/security/), [n8n Header Auth](https://docs.n8n.io/integrations/builtin/credentials/webhook/), [Nextcloud WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html), [Authentik](https://api.goauthentik.io/authentication/), [Postiz](https://postiz.com/blog/direct-postiz-integration-oauth-api), [net-snmp](https://www.npmjs.com/package/net-snmp).
