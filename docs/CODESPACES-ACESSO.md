# CloudWorld — acesso ao ambiente real

**Última retomada:** 44 verificações internas, sete do portal e 17 das integrações passaram após a inicialização. Os seis encaminhamentos de apresentação precisaram ser recriados e estão privados. Os links abaixo exigem acesso pelo GitHub; a referência à publicação pública descreve uma sessão anterior.

**Ambiente em validação:** a consulta pesada do painel foi corrigida, as seis aplicações retomaram e o login real do portal foi confirmado pelo navegador. Passaram 69 testes de código e o fluxo Chatwoot → API/fila → ERPNext/n8n. O endereço atual usa o Codespace `laughing-barnacle-gxpjggg4j6xhvjvg`. Consulte [a correção da consulta](DOCKER-CONSULTA-LEVE.md) e os relatórios para o resultado da observação prolongada.

**Histórico de 02/11 às 15:31 (São Paulo):** antes da correção da consulta, o segundo host também encerrou o Docker. Essa falha permanece documentada em [encerramento do Docker](CODESPACES-ENCERRAMENTO-DOCKER.md). O host original `effective-guacamole-5vqqrwwxrq6xfv54x` foi preservado e permanece separado. A validação atual não equivale a disponibilidade comercial permanente.

Este ambiente executa aplicações reais em um servidor remoto do GitHub Codespaces. O computador pessoal não hospeda essas aplicações. O proprietário precisa abrir/retomar o Codespace antes da apresentação; os visitantes não conseguem retomá-lo por conta própria. A franquia gratuita e a suspensão por inatividade continuam valendo.

O último backup remoto passou em 48 verificações de recuperação e isolamento de bancos/arquivos. Consulte [o procedimento e seus limites](RECUPERACAO-CODESPACES.md). Isso não comprova cópia externa nem recuperação das interfaces em outro servidor.

## Dois acessos diferentes

- **Operador:** [painel administrativo](https://laughing-barnacle-gxpjggg4j6xhvjvg-8099.app.github.dev/). Permanece privado, com a proteção do GitHub e autenticação própria do painel.
- **Empresa:** [portal do cliente](https://laughing-barnacle-gxpjggg4j6xhvjvg-8100.app.github.dev/). Público, com login próprio obrigatório. A empresa deste ambiente se chama `apresentacao`.

O portal permite abrir Atendimento, Gestão, Arquivos e Mídias sociais. Ele não concede ao cliente acesso ao Docker, às chaves da integração ou à administração de outras empresas. Cada ferramenta ainda tem seu próprio login; o SSO precisa ser configurado e validado separadamente.

O portal, Authentik, Chatwoot, Postiz, Nextcloud e ERPNext foram publicados com autorização do proprietário. Operador (8099), editor n8n (18003), bancos, Docker e WAHA permanecem privados. Passaram 18 verificações básicas de proteção e 14 verificações HTTPS sem credenciais, incluindo recusa de dados privados. Veja [os controles e limites de segurança](SEGURANCA-DA-PUBLICACAO.md).

O processo público do portal também passou em 24 verificações de identidade e permissões: ele não pode acessar o Docker, as credenciais ou o ambiente do operador. Detalhes em [isolamento do portal](PORTAL-IDENTIDADE-ISOLADA.md).

## Ferramentas

| Ferramenta | Endereço | Uso |
|---|---|---|
| Chatwoot | [Atendimento](https://laughing-barnacle-gxpjggg4j6xhvjvg-18002.app.github.dev/) | Contatos e conversas com clientes |
| ERPNext | [Gestão](https://laughing-barnacle-gxpjggg4j6xhvjvg-18006.app.github.dev/) | Cadastro e gestão do negócio; fiscal e contabilidade dependem de configuração própria |
| Nextcloud | [Arquivos](https://laughing-barnacle-gxpjggg4j6xhvjvg-18005.app.github.dev/) | Guardar e compartilhar arquivos com permissões |
| Postiz | [Mídias sociais](https://laughing-barnacle-gxpjggg4j6xhvjvg-18004.app.github.dev/) | Planejamento de publicações; conectar contas sociais exige configuração externa |
| Authentik | [Identidade](https://laughing-barnacle-gxpjggg4j6xhvjvg-18001.app.github.dev/) | Administração de identidades e integrações SSO compatíveis |
| n8n | [Editor privado](https://laughing-barnacle-gxpjggg4j6xhvjvg-18003.app.github.dev/) | Automações administradas pelo operador |

WAHA ainda aguarda configuração e vínculo de um número. WireGuard não é oferecido pelo encaminhamento TCP deste Codespace. Nenhum teste publica conteúdo em redes sociais ou envia mensagens pelo WhatsApp.

## Onde consultar os acessos

No [editor privado](https://laughing-barnacle-gxpjggg4j6xhvjvg.github.dev/), use `Ctrl+P` para abrir o arquivo desejado. Os caminhos são relativos à raiz do repositório remoto:

- Portal: `runtime/tenants/apresentacao/portal-initial.private.json`.
- Painel administrativo: usuário `admin`, senha em `runtime/panel-password.txt`.
- Chatwoot: `runtime/tenants/apresentacao/chat-admin.private.json`.
- Postiz: `runtime/tenants/apresentacao/postiz-admin.private.json`.
- n8n: `runtime/tenants/apresentacao/n8n-admin.private.json`.
- Authentik, ERPNext e Nextcloud: respectivos campos `authAdmin`, `erpAdmin` e `cloudAdmin` em `runtime/tenants/apresentacao/secrets.json`.

Esses arquivos são privados e ficam fora do Git. Não compartilhar telas que mostrem senhas. Para terceiros, preparar contas com permissões apropriadas; não entregar o usuário administrador das ferramentas.

## Preparar uma apresentação

No terminal remoto, execute `node scripts/Check-PresentationReady.mjs --resume` para retomar e verificar o ambiente. Sem `--resume`, o comando apenas verifica o ambiente ativo. Use `--live-integration` quando quiser repetir o fluxo com registros fictícios nas aplicações. O relatório `runtime/reports/presentation-readiness.json` separa a saúde interna do acesso de convidados. A saída 2 indica pendências. O comando mantém a visibilidade das portas.

1. Retomar o Codespace pelo editor privado.
2. Executar `node scripts/Start-CodespacesPanels.mjs` e `node manage.mjs resume apresentacao` no terminal remoto.
3. Conferir `node manage.mjs smoke apresentacao` e `node scripts/Test-CodespacesPortal.mjs apresentacao`. Se o gateway interno retornar 502 logo após retomar, aguardar a inicialização e repetir o smoke. Se persistir, conferir a aplicação indicada em `runtime/tenants/apresentacao/smoke-report.json` antes de reiniciar ou reinstalar.
4. Executar `node scripts/test-platform-live.mjs apresentacao` e `node scripts/Test-CodespacesPublic.mjs`. O primeiro testa as integrações pelo ambiente interno. Se os endereços externos retornarem 404 e o ambiente interno estiver saudável, conferir se as seis portas de apresentação ainda estão encaminhadas na aba **Portas**. Manter 8099 e 18003 privados e repetir a verificação HTTPS antes de compartilhar o portal.
5. Abrir o portal em um navegador comum. A validação HTTP não substitui conferir login e operação no navegador usado na apresentação.
6. Ao terminar, suspender o Codespace pelo GitHub para economizar a cota. A cópia de recuperação interna não substitui um backup externo nem impede exclusão por retenção.

Os testes do fluxo criam contatos identificados como teste no Chatwoot e ERPNext, verificam a fila da API e o recebimento pelo n8n. Não demonstram homologação fiscal, integração com todas as redes sociais ou capacidade comercial para vários clientes.
