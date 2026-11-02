# Codespaces — candidato para apresentação real sem cartão

Estado do host original em 02/11/2026: seis aplicações reais instaladas e contas próprias configuradas. Passaram 57 testes de código e, durante janelas em funcionamento, 44 verificações dos serviços, seis do portal e 17 da integração. As seis portas autorizadas foram publicadas nessa ocasião; após uma parada completa, conferir novamente os encaminhamentos. Operação e editor n8n devem permanecer privados. O Docker continua recebendo encerramentos externos, portanto a apresentação ainda não é estável. Um segundo host está em avaliação, sem substituir o original. Consulte `docs/CODESPACES-ENCERRAMENTO-DOCKER.md` e `docs/CODESPACES-ACESSO.md`.

A conta disponibilizou somente máquinas de 2 ou 4 núcleos, ambas com 32 GB de disco. A máquina selecionada tem 4 núcleos, 15,6 GiB de RAM utilizável e inicialmente 18,8 GiB livres. Docker e Compose funcionam, mas a checagem de armazenamento não passou. As 14 imagens únicas usadas pelo piloto local somam aproximadamente 25,2 GiB de tamanhos virtuais, antes de considerar compartilhamento de camadas, volumes e margem de operação. Essa soma não equivale a uma medição de ocupação remota, mas impede presumir que o pacote completo caiba.

Foi adicionada uma configuração Dev Container com a imagem oficial Node 24 e Docker-in-Docker. Encaminhamento automático de portas desabilitado. A reconstrução sem cache, feita antes de existirem aplicações ou volumes, recuperou 27,7 GiB livres. O engine vazio foi configurado com overlay2. Depois da instalação das seis aplicações, a medição mostrou 9,3 GiB livres. Os bancos, redes e credenciais foram criados novos; os dados e senhas do piloto local não foram transportados.

O adaptador limita este Codespace a uma empresa de apresentação e mantém os bancos privados. WAHA fica em perfil opcional, aguardando vínculo com um número e nova conferência de recursos. WireGuard depende de UDP, que não é disponibilizado pelo encaminhamento web do Codespaces; a administração usa a proteção privada do GitHub.

## Por que avaliar

Contas pessoais GitHub Free incluem 120 core-hours e 15 GB-month de armazenamento por ciclo. Os multiplicadores de processamento são 2 para uma máquina de 2 cores e 4 para uma de 4 cores: aproximadamente 60 ou 30 horas ativas, respectivamente, antes dos demais usos. Sem forma de pagamento válida, a documentação informa bloqueio ao acabar a cota. O armazenamento também consome a franquia enquanto o Codespace existe, mesmo parado.

O ambiente remoto pode executar Docker e encaminhar portas HTTPS do projeto. Essa é uma opção para avaliar as aplicações reais em desenvolvimento/apresentação, não uma oferta de produção 24/7. Para por inatividade e está sujeito a exclusão por retenção; backups externos continuam necessários.

## Plano após o login

1. Conferir cota e máquinas disponíveis na conta, sem adicionar cartão, ativar plano pago ou comprar recursos.
2. Criar um repositório privado apenas com o pacote sanitizado de fontes. Não publicar código ou arquivos privados em repositório público.
3. Abrir um único Codespace dentro da franquia e executar `node scripts/Check-Codespaces.mjs` antes de baixar imagens. Ele consulta recursos e Docker, sem instalar nada.
4. Medir o tamanho das imagens e volumes e confrontar o disco disponível e a franquia. Não assumir que todos os serviços cabem.
5. Só depois adaptar URLs, callback da API, cookie/origem do portal e port forwarding ao ambiente remoto. Cada ferramenta precisa de seu próprio endereço HTTPS. Não transportar senhas nem os dados do piloto local; criar contas e dados de apresentação novos.
6. Manter administração, Docker, bancos e WAHA privados. Revisar autenticação antes de publicar portas de aplicações. O encaminhamento público remove a barreira de acesso do GitHub, não substitui o login de cada aplicação.
7. Validar as aplicações e as integrações no ambiente real remoto. Encerrar o Codespace fora das apresentações, acompanhar armazenamento e guardar cópia recuperável.

A checagem de Codespaces não substitui a política de armazenamento de Linux nativo. Existe um marcador próprio vinculado ao nome do Codespace, identidade Docker e diretório de dados; a instalação ocorre em sequência e interrompe novos downloads quando não há margem de disco. Isso não aprova capacidade comercial.

## Operação deste ambiente

Preparação inicial, apenas em um Codespace novo:

```sh
npm test
node scripts/Prepare-Codespaces.mjs apresentacao
node manage.mjs validate apresentacao
node manage.mjs up apresentacao
```

Não repetir a preparação para sobrescrever um cliente existente. Configurações e credenciais ficam em `runtime/`, fora do Git. Depois de instalar, não usar Full Rebuild sem backup recuperável: essa operação pode limpar os volumes Docker. A limpeza inicial foi realizada com o engine vazio.

Ao abrir o ambiente com a configuração Dev Container aplicada, o postStart inicia os dois painéis e o callback privado. Para iniciar manualmente de forma idempotente:

```sh
node scripts/Start-CodespacesPanels.mjs
```

Preparar contas novas e integrações no ambiente de apresentação:

```sh
node scripts/Bootstrap-CodespacesAccounts.mjs apresentacao
node scripts/bootstrap-erp-integration.mjs apresentacao
node scripts/provision-integrations.mjs apresentacao
```

A publicação do workflow por CLI pede reiniciar somente o n8n antes do teste de entrega. Os arquivos `*-admin.private.json` e `portal-initial.private.json` contêm os acessos novos; não publicá-los nem incluí-los em commit. O bootstrap não redefine automaticamente contas existentes.

Verificações reais:

```sh
node manage.mjs smoke apresentacao
node scripts/Test-CodespacesPortal.mjs apresentacao
node scripts/test-platform-live.mjs apresentacao
node scripts/Configure-CodespacesMonitoring.mjs apresentacao
node scripts/Test-DockerLifecycle.mjs
node scripts/Test-DockerHostStability.mjs 900
```

O último teste cria registros identificados como teste nas aplicações reais, verifica a entrega Chatwoot → API/fila → ERPNext/n8n e revoga a chave temporária. Não envia WhatsApp nem publica em redes sociais. Os testes internos não substituem a verificação separada do HTTPS encaminhado pelo GitHub.

Portas: operação 8099, portal da empresa 8100, Authentik 18001, Chatwoot 18002, n8n 18003, Postiz 18004, Nextcloud 18005 e ERPNext 18006. Usar encaminhamento privado inicialmente. O endereço é `https://NOME-DO-CODESPACE-PORTA.app.github.dev`. Login próprio de cada aplicação permanece obrigatório; SSO nas demais ferramentas e contas sociais exigem configuração específica.

## Fontes

- https://docs.github.com/en/billing/concepts/product-billing/github-codespaces
- https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
- https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle


As operações Compose neste Codespace usam no máximo duas chamadas simultâneas ao engine, conforme o mecanismo oficial COMPOSE_PARALLEL_LIMIT: https://docs.docker.com/compose/how-tos/environment-variables/envvars/ . Isso reduz concorrência, mas não resolve sinais externos de encerramento.

