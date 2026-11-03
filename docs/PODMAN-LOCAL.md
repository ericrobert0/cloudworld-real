# Piloto local com Podman

A partir da versao 1.6.3, Linux pode usar Podman rootless com **Docker Compose v2** conectado ao socket Unix do usuario. O comando `podman-compose` nao substitui esse provedor: os scripts precisam de `--project-directory`, `wait` e das respostas JSON do Compose v2.

## Preparacao

Instale Node.js >=22, npm, Podman, curl e Docker Compose v2 pelas fontes oficiais ou pacotes da sua distribuicao. O executavel Compose pode ser `docker-compose` no PATH ou um arquivo local. Nao e necessario instalar Docker Engine.

```bash
npm ci --ignore-scripts
systemctl --user start podman.socket
node scripts/Configure-Podman.mjs --compose-bin /caminho/para/docker-compose
node scripts/Check-LinuxHost.mjs --confirm-storage
node service.mjs onboard piloto
node manage.mjs validate piloto
node manage.mjs up piloto
node manage.mjs smoke piloto
```

Se `docker-compose` ja estiver no PATH, omita `--compose-bin`. A configuracao verifica a versao do Compose e o socket antes de salvar `runtime/container-engine.json`. Ela nao abre portas, altera o armazenamento do Podman ou instala programas. O socket precisa continuar acessivel ao usuario que executa o painel e os comandos. Sockets TCP nao sao aceitos por este adaptador.

Use `node manage.mjs resume piloto` para retomar sem baixar novas imagens e `node manage.mjs suspend piloto` para parar somente essa empresa. Nao remover volumes para reiniciar.

Ambientes novos gerados em modo Podman recebem nomes completos de imagens e rotulagem SELinux nos bind mounts. Volumes nomeados e segredos permanecem exclusivos da empresa. Um ambiente existente criado para Docker exige revisao do Compose antes de migrar; configurar Podman nao migra dados ou volumes automaticamente. A origem das imagens nao e substituida silenciosamente quando um registro falha.

## Painel e primeiro acesso

```bash
npm run panel
# Em outro terminal:
node portal.mjs
# Depois que o painel iniciar:
node scripts/Create-Pilot-Portal.mjs piloto
```

- Painel: http://127.0.0.1:8099/login, usuario `admin`, senha em `runtime/panel-password.txt`.
- Portal: http://127.0.0.1:8100, acesso inicial no arquivo privado da empresa.
- Aplicacoes: enderecos em `runtime/tenants/piloto/tenant.json`.

O formulario do painel substitui a janela HTTP Basic para navegadores. Sessao em cookie HttpOnly/SameSite=Strict, com Secure em HTTPS, dura ate oito horas e e invalidada ao reiniciar o painel ou usar Sair. Basic Auth continua disponivel para os scripts locais existentes. Senhas nao sao retornadas pela pagina de login.

O HTTPS local usa a CA do Caddy; o navegador pode pedir confianca no certificado. Nunca compartilhar a chave privada dessa CA. Nao ha publicacao externa nem inicializacao automatica apos reboot neste procedimento.

## Escopo e limites

O suporte foi validado no piloto Linux com Podman 5.8.9 e Compose 2.39.4. Os testes de SQL/HTTPS/estado nao homologam carga, SSO entre ferramentas, VPN, recuperacao completa ou integracoes externas. WireGuard continua opcional; scripts auxiliares que chamam Docker diretamente ainda precisam de adaptacao especifica. Conferir o runtime selecionado antes de executar ensaios de recuperacao.

Os testes de codigo usam `npm test`. Em hosts cujo comando `docker` e um alias do Podman, configure `PODMAN_COMPOSE_PROVIDER` com o executavel Compose v2 e `DOCKER_HOST` com o socket Unix para os testes legados. O teste de daemon simulado exclusivo do Docker e ignorado nesse ambiente.
