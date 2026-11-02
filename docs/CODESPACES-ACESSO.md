# CloudWorld — acesso ao ambiente real

**Pendência atual:** o Docker está recebendo encerramentos externos. As aplicações passaram em testes durante janelas ativas, mas ainda não há estabilidade para uma apresentação completa. Consulte [a evidência e o diagnóstico](CODESPACES-ENCERRAMENTO-DOCKER.md).

Este ambiente executa aplicações reais em um servidor remoto do GitHub Codespaces. O computador pessoal não hospeda essas aplicações. O proprietário precisa abrir/retomar o Codespace antes da apresentação; os visitantes não conseguem retomá-lo por conta própria. A franquia gratuita e a suspensão por inatividade continuam valendo.

## Dois acessos diferentes

- **Operador:** [painel administrativo](https://effective-guacamole-5vqqrwwxrq6xfv54x-8099.app.github.dev/). Permanece privado, com a proteção do GitHub e autenticação própria do painel.
- **Empresa:** [portal do cliente](https://effective-guacamole-5vqqrwwxrq6xfv54x-8100.app.github.dev/). A porta pública mantém a autenticação própria do CloudWorld. A empresa deste ambiente se chama `apresentacao`.

O portal permite abrir Atendimento, Gestão, Arquivos e Mídias sociais. Ele não concede ao cliente acesso ao Docker, às chaves da integração ou à administração de outras empresas. Cada ferramenta ainda tem seu próprio login; o SSO precisa ser configurado e validado separadamente.

## Ferramentas

| Ferramenta | Endereço | Uso |
|---|---|---|
| Chatwoot | [Atendimento](https://effective-guacamole-5vqqrwwxrq6xfv54x-18002.app.github.dev/) | Contatos e conversas com clientes |
| ERPNext | [Gestão](https://effective-guacamole-5vqqrwwxrq6xfv54x-18006.app.github.dev/) | Cadastro e gestão do negócio; fiscal e contabilidade dependem de configuração própria |
| Nextcloud | [Arquivos](https://effective-guacamole-5vqqrwwxrq6xfv54x-18005.app.github.dev/) | Guardar e compartilhar arquivos com permissões |
| Postiz | [Mídias sociais](https://effective-guacamole-5vqqrwwxrq6xfv54x-18004.app.github.dev/) | Planejamento de publicações; conectar contas sociais exige configuração externa |
| Authentik | [Identidade](https://effective-guacamole-5vqqrwwxrq6xfv54x-18001.app.github.dev/) | Administração de identidades e integrações SSO compatíveis |
| n8n | [Editor privado](https://effective-guacamole-5vqqrwwxrq6xfv54x-18003.app.github.dev/) | Automações administradas pelo operador |

WAHA ainda aguarda configuração e vínculo de um número. WireGuard não é oferecido pelo encaminhamento TCP deste Codespace. Nenhum teste publica conteúdo em redes sociais ou envia mensagens pelo WhatsApp.

## Onde consultar os acessos

No [editor privado](https://effective-guacamole-5vqqrwwxrq6xfv54x.github.dev/), use `Ctrl+P` para abrir o arquivo desejado. Os caminhos são relativos à raiz do repositório remoto:

- Portal: `runtime/tenants/apresentacao/portal-initial.private.json`.
- Painel administrativo: usuário `admin`, senha em `runtime/panel-password.txt`.
- Chatwoot: `runtime/tenants/apresentacao/chat-admin.private.json`.
- Postiz: `runtime/tenants/apresentacao/postiz-admin.private.json`.
- n8n: `runtime/tenants/apresentacao/n8n-admin.private.json`.
- Authentik, ERPNext e Nextcloud: respectivos campos `authAdmin`, `erpAdmin` e `cloudAdmin` em `runtime/tenants/apresentacao/secrets.json`.

Esses arquivos são privados e ficam fora do Git. Não compartilhar telas que mostrem senhas. Para terceiros, preparar contas com permissões apropriadas; não entregar o usuário administrador das ferramentas.

## Preparar uma apresentação

1. Retomar o Codespace pelo editor privado.
2. Executar `node scripts/Start-CodespacesPanels.mjs` e `node manage.mjs resume apresentacao` no terminal remoto.
3. Conferir `node manage.mjs smoke apresentacao`, `node scripts/Test-CodespacesPortal.mjs apresentacao`, `node scripts/test-platform-live.mjs apresentacao` e `node scripts/Test-CodespacesPublic.mjs`.
4. Abrir o portal em um navegador comum. A validação HTTP não substitui conferir login e operação no navegador usado na apresentação.
5. Ao terminar, suspender o Codespace pelo GitHub para economizar a cota. A cópia de recuperação interna não substitui um backup externo nem impede exclusão por retenção.

Os testes do fluxo criam contatos identificados como teste no Chatwoot e ERPNext, verificam a fila da API e o recebimento pelo n8n. Não demonstram homologação fiscal, integração com todas as redes sociais ou capacidade comercial para vários clientes.
