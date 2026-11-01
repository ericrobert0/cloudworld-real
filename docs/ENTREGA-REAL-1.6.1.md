# CloudWorld 1.6.1 — retomada do ambiente real

## Estado

O ambiente real continua instalado em `D:\VlanWorld`. O site público no Sites é uma apresentação e não foi convertido em hospedagem das aplicações. Não há servidor externo contratado, criado ou conectado. A conta Google Cloud permanece bloqueada por pré-pagamento; esta entrega não altera faturamento, contas ou políticas do provedor.

## Validação executada

Em 01/11/2026, os 28 containers do piloto estavam em execução. Os testes reais confirmaram APIs de Authentik, Chatwoot, ERPNext, Nextcloud, Postiz, n8n e WAHA; criação de contato fictício no Chatwoot; entrega via API central ao ERP e ao n8n; idempotência no ERP e rejeição de credencial incorreta no webhook. Não foram enviadas mensagens WhatsApp nem publicadas redes sociais.

O portal passou nas seis verificações HTTP de login, sessão, origem, permissões, ausência de administração e logout. Os relatórios detalhados ficam na instalação em `runtime/reports/platform-live-test.json` e `runtime/reports/portal-live-test.json`. Os contatos de teste criados nas ferramentas são fictícios e ficam identificados como testes.

## Mudanças

- O tema azul também foi aplicado ao portal real, além do painel administrativo que já usava azul.
- O gerenciador deixa de exigir uma confirmação de disco D: em servidores Linux. Windows mantém a confirmação anterior; Linux exige uma confirmação própria vinculada ao ID do Docker e ao diretório de dados. Um marcador de outro host não é aceito.
- `scripts/Check-LinuxHost.mjs` verifica Node, Docker Engine/Compose, memória, CPUs e espaço no diretório Docker sem instalar ou iniciar nada. Só grava a confirmação com `--confirm-storage`, após os requisitos mínimos passarem.
- Mínimos de pré-verificação: Node 22, 2 CPUs, aproximadamente 8 GB de RAM e 40 GiB livres no volume Docker. São requisitos de entrada para ensaio, não capacidade comercial homologada. Recomenda-se reservar mais memória e testar a carga real.

Os testes de unidade passaram: 49 verificações, incluindo cinco cenários da política de armazenamento. Os controles de memória, volumes e credenciais existentes permanecem sob a configuração do piloto.

## Apresentar agora usando as aplicações reais

1. Com este computador ligado e Docker ativo, abra o portal em http://127.0.0.1:8100 e o administrativo em http://127.0.0.1:8099.
2. Faça login com as contas existentes. As credenciais privadas não devem ser copiadas para o site público.
3. Abra Chatwoot, ERPNext, Nextcloud ou Postiz pelos atalhos e use somente dados de apresentação. O fluxo local Chatwoot → ERP/n8n já foi exercitado por API real.
4. Logins próprios das ferramentas e conexões de WhatsApp/redes sociais dependem da configuração específica; não desabilitar autenticação para demonstrar.

Esta opção depende do computador ligado. Para acesso independente dele, precisa existir uma máquina remota.

## Preparação no futuro servidor Linux

Depois de definir conta, servidor e acesso, copiar somente o pacote de fontes e instalar dependências fixadas. Não copiar o runtime do piloto com suas senhas.

No servidor, executar primeiro `node scripts/Check-LinuxHost.mjs`. Revisar o resultado e então usar `node scripts/Check-LinuxHost.mjs --confirm-storage` se o armazenamento estiver correto. Ambos os comandos precisam de acesso ao Docker; a consulta do volume Docker também precisa de permissão no diretório de dados.

Essa etapa não instala o ambiente completo. Ainda devem ser configurados: dependências Linux, usuários e privilégios distintos para operador/portal, DNS, HTTPS, contas das aplicações, integração de retorno do n8n adequada ao Linux, proteção do administrativo, backup externo e validação no servidor. Os arquivos em `deploy/linux` são modelos e não comprovam implantação.

## Dependência externa

O usuário informou ainda não ter servidor nem conta AWS. Nenhum recurso em nuvem será criado assumindo créditos disponíveis. Uma nova oferta de teste só pode ser usada depois de conferir elegibilidade, verificação de pagamento, saldo, validade e custos dos recursos na conta. Não prometer gratuidade permanente nem fazer upgrade para conta paga sem autorização.
