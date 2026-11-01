# Oferta padronizada para microempresas

O pacote técnico **microempresa-padrao**, versão `2026-10-31.1`, fornece o mesmo conjunto de ferramentas e os mesmos limites de containers para cada empresa: identidade, atendimento, automação, mídias, arquivos e ERP. Cada empresa recebe projeto, bancos, credenciais, sessões e volumes próprios. A infraestrutura de gestão permanece sob controle do operador.

Não é uma única conta compartilhada entre várias empresas. A uniformidade está no modelo de implantação; os dados e acessos são independentes. Cadastro prepara o ambiente, instalação executa containers e testes validam o funcionamento. Esses estados não devem ser confundidos.

## Cadastro pelo painel

No painel, use **Cadastrar empresa no serviço**. Informe identificador sem espaços e o domínio base. As portas internas são escolhidas automaticamente; não precisa selecionar ferramentas caso a caso. Sem domínio, o cadastro gera um piloto local.

Exemplos equivalentes pelo CLI no D:\VlanWorld:

```powershell
node service.mjs catalog
node service.mjs onboard padaria
node manage.mjs validate padaria
node manage.mjs up padaria
node manage.mjs smoke padaria
```

Para um domínio real controlado pelo operador:

```powershell
node service.mjs onboard padaria seudominio.com
node service.mjs onboard oficina seudominio.com
```

Isso gera `chat.padaria.seudominio.com`, `erp.padaria.seudominio.com`, etc., e os equivalentes da oficina. Não executa mudanças em DNS nem publica automaticamente na Internet.

## Entrada pública única

`runtime\edge` contém um gateway Caddy central que ocupa 80/443 e roteia cada hostname diretamente para a aplicação da empresa correta. Ele participa somente das redes HTTP dos clientes, sem redes de bancos. Os aliases incluem o identificador da empresa para evitar ambiguidade. Os ingress individuais desses clientes ficam opcionais e suas portas de diagnóstico são locais.

Depois que o Docker funcionar, confirme armazenamento no D:, inicie os ambientes cadastrados, configure DNS dos nomes exatos e encaminhe 80/443 no roteador. Execute:

```powershell
.\scripts\Start-Gateway.ps1
```

O script gera rotas, inicia/reconfigura o gateway e recarrega Caddy. As redes de todos os clientes cadastrados para esse gateway precisam existir; inicie-os antes. A cada novo cadastro público, repita o script após criar seu ambiente. Cadastros locais não entram no gateway público.

O gateway usa ACME público. CGNAT, portas bloqueadas, DNS incorreto ou ausência de domínio impedem a emissão. Nenhum domínio foi contratado e nenhum endpoint foi publicado nesta instalação. As seis aplicações recebem rotas; aplique as restrições privadas de administração antes da abertura comercial. O painel 8099 e o WAHA permanecem locais.

## Funcionamento como serviço no Windows

`scripts\Register-Service.ps1` registra `VlanWorld-Control` no Agendador do Windows. O painel inicia na entrada do usuário e tem até três tentativas de reinício em caso de falha. Logs ficam em `runtime\service.log`. Não armazena senha do Windows e não exige autologin.

Isso depende da sessão do usuário e do Docker Desktop. Não é um serviço de boot sem login, nem um servidor com disponibilidade contínua. O Docker precisa ser iniciado e estar funcional; containers ativos usam política `unless-stopped`. Não prometa SLA com base na tarefa de login. Um servidor Linux dedicado permite posteriormente operação independente de sessão gráfica; essa migração não foi executada.

## O que significa servir igualmente

- Mesmas aplicações, versões solicitadas e parâmetros de implantação.
- Mesmo teto de CPU por container, limites de memória por função, limite de processos e rotação de logs.
- Mesmos comandos de operação, backup, atualização e verificação.
- Credenciais novas e isolamento lógico por empresa.

Não significa capacidade ilimitada. CPU/memória são compartilhadas fisicamente; os limites por container não garantem throughput nem isolamento de disco/rede. Não há quotas de usuários, armazenamento ou número de mensagens implementadas. Os 16 GB deste computador ainda não sustentam uma promessa medida para várias empresas completas; é necessário teste de carga e dimensionamento antes de vender capacidade.

## Condições para disponibilizar aos clientes

O piloto foi instalado após ativar o hypervisor e transferir o disco de dados para D:. Passou em 44 checks de SQL, HTTPS e estado dos containers; a autenticação por chave da API WAHA também foi verificada. O primeiro backup foi concluído. As integrações reais, homologação funcional e publicação externa continuam pendentes; a resposta HTTP de uma aplicação não comprova todos os fluxos de negócio.

SSO depende da edição/licença e do domínio; WhatsApp exige pareamento ou Cloud API; Postiz exige contas/API das redes sociais. SMTP, recuperação de acesso, backup externo criptografado e canais de alerta ainda precisam de destino/credenciais. Não há cobrança automática, faturamento ou portal de autoatendimento comercial implementados.

O modelo de licença do n8n permite usos internos e consultoria, mas hospedagem vendida como acesso ao produto pode exigir acordo comercial. Não anuncie esse componente como revenda automaticamente autorizada. WAHA Apps/Plus e recursos SSO também dependem da edição contratada.

Fontes: [licença comunitária do n8n](https://github.com/n8n-io/n8n-docs/blob/main/docs/n8n-community-license/README.md), [Docker Desktop](https://docs.docker.com/subscription-billing/desktop-license/), [WAHA Apps](https://waha.devlike.pro/docs/apps/about/).
