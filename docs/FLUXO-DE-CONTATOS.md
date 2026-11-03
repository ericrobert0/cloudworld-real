# Fluxo local de contatos — 1.6.6

## Resultado

Novos contatos do Chatwoot podem gerar um cliente no ERPNext e chegar ao n8n. O workflow gerenciado do n8n exige chave de cabecalho e devolve uma confirmacao com a empresa e o ID do evento. Essa confirmacao precisa corresponder a entrega antes de ela ser marcada como concluida.

O workflow fornecido somente recebe e confirma o evento. Nao envia mensagens, publica conteudo, chama APIs externas ou implementa uma rotina financeira. Rotinas de negocio adicionais devem ser desenhadas e testadas separadamente.

## Preparar o piloto

Com o painel e as aplicacoes em execucao:

```bash
node scripts/Prepare-ContactFlow.mjs piloto
node scripts/Test-ContactFlow.mjs piloto
```

Esses comandos estao restritos a empresas locais. O preparo:

1. Preserva proprietarios n8n existentes. Se o n8n ainda estiver no primeiro acesso, prepara a conta inicial e guarda a senha em `runtime/tenants/piloto/n8n-admin.private.json`.
2. Prepara somente grupos e territorios genericos no ERP, sem configurar empresa fiscal, moeda ou contabilidade.
3. Provisiona contas tecnicas e conectores somente para Chatwoot, ERP e n8n. A opcao `--apps=chat,erp,n8n` tambem esta disponivel no provisionador existente.
4. Importa o workflow e sua credencial com IDs proprios, sem sobrescrever um ID existente que nao tenha plano gerenciado. As credenciais de retomada ficam em arquivo privado.
5. Reinicia somente o n8n dessa empresa quando necessario para ativar o workflow publicado.
6. Ativa as duas rotas gerenciadas e inicializa a captura. A primeira leitura estabelece a base de contatos existentes; ela nao importa retroativamente todos os contatos antigos.

O preparo usa a trava de manutencao da empresa e salva a configuracao anterior em arquivo privado. Repetir o preparo nao redefine senhas nem regenera credenciais configuradas. Fluxos de contato desconhecidos, IDs conflitantes ou rotas gerenciadas desativadas interrompem o preparo para revisao.

## Ensaio real

O ensaio verifica a versao publicada do workflow antes de criar dados. Se o grafo tiver sido alterado, estiver desativado ou contiver outros nodes/conexoes, o teste e interrompido antes de criar contatos. Essa protecao evita usar um webhook gerenciado que tenha recebido efeitos externos inesperados.

Um contato identificado com prefixo `CW-FLOW-` e email `example.invalid` e criado no Chatwoot. O ensaio verifica a entrega ao ERP e n8n, a reutilizacao do cliente do ERP, a repeticao da mesma chave de evento sem novas tentativas de entrega, a rejeicao de uma chave incorreta no webhook e a revogacao da chave temporaria da API.

O relatorio sem credenciais fica em `runtime/reports/contact-flow-live.json`. Os registros de teste permanecem identificados nas aplicacoes para auditoria; nao sao apagados automaticamente.

## Credencial ERP

Foi reproduzido no piloto um segredo da conta tecnica que estava armazenado, mas ilegivel para o ERP. O diagnostico existente agora usa o adaptador Docker/Podman. A recuperacao so regrava o segredo se a conta tecnica fixa estiver ativa, a API key coincidir, existir ciphertext anterior e a descriptografia falhar. A mesma credencial privada e reutilizada; o valor criptografado anterior e preservado em backup privado no site. Outros usuarios ou chaves divergentes nao sao redefinidos.

## Compatibilidade e limites

Webhooks n8n personalizados continuam aceitando suas respostas anteriores. A confirmacao estrita e ativada por `requireAck: true` somente no conector gerenciado; a API valida o tipo booleano dessa opcao. Resposta de outra empresa ou outro evento nao aprova a entrega e invalida a evidencia anterior do webhook.

O teste nao valida callbacks do n8n para o host, WhatsApp, redes sociais, SSO, SMTP ou capacidade comercial. Nao configura os conectores Authentik, Nextcloud, Postiz ou WAHA. A entrega continua sendo at-least-once: efeitos de negocio em destinos externos precisam de idempotencia propria.

As senhas inicial n8n e o plano privado do workflow acompanham o backup da empresa a partir desta versao. Ainda e necessario testar a recuperacao completa em outro host e revisar os privilegios das contas tecnicas antes da oferta comercial.
