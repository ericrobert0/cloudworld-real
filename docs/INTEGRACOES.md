# SSO, atendimento, VPN e endpoints públicos

> Estado mais recente: o Postiz foi corrigido e retomado como ferramenta principal; Mixpost permanece como alternativa. Consulte [POSTIZ-CORRIGIDO.md](POSTIZ-CORRIGIDO.md) para os resultados atuais. Os relatos anteriores abaixo sao historicos.


> Atualização: o componente de mídias atual é Mixpost Lite, substituindo Postiz e Temporal. Consulte [MIXPOST.md](MIXPOST.md) para a implantação, testes e limitações atuais. Referências ao Postiz abaixo registram a arquitetura anterior e não configuram o Mixpost.


## SSO

Authentik está preparado como provedor de identidade. As integrações não são ativadas automaticamente: dependem de domínio resolvível tanto no navegador quanto nos containers, CA confiável, cadastro de aplicações/provedores e, em certos produtos, licença comercial.

| Aplicação | Caminho de integração |
|---|---|
| Nextcloud | Instalar `user_oidc` pelo `occ` e cadastrar provider no Authentik; configurar discovery URL e callback mostrado pelo app |
| ERPNext/Frappe | Social Login Key / OpenID Connect; verificar mapeamento de email e provisionamento de usuários |
| Postiz | Generic OAuth, variáveis `POSTIZ_GENERIC_OAUTH`, `POSTIZ_OAUTH_*`, client ID/secret; conferir comportamento com registro desabilitado |
| Chatwoot | Verificar SAML/SSO na edição/licença instalada; não presumir disponibilidade Community |
| n8n | SSO SAML/OIDC depende da edição/plano; login local permanece até validar licença e integração |
| WAHA | API key e dashboard privado; não foi declarado suporte nativo OIDC |

No Authentik, crie grupo por cliente, aplicação/provider por produto e políticas que permitam somente o grupo correspondente. Não basta esconder um link do portal. Use clients confidenciais e redirect URIs exatas, sem curingas. Autorizações administrativas dentro das aplicações continuam separadas.

`.localhost` resolve no próprio computador: dentro de um container, apontaria para ele mesmo. Para SSO real, use domínio de homologação/produção com split DNS e certificado confiável. Não habilite bypass global de validação TLS para fazê-lo funcionar. Proteção por proxy Authentik pode adicionar uma barreira, mas não transforma login local em SSO nativo; também pode bloquear webhooks se aplicada indiscriminadamente.

## Chatwoot + WAHA

WAHA Core foi incluído com API key, dashboard autenticado e persistência das sessões. Nenhuma sessão WhatsApp foi pareada: exige ler QR code no telefone autorizado. Não foram criados tokens de terceiros nem enviadas mensagens.

A integração oficial via **WAHA Apps → Chatwoot** deve ser conferida conforme a edição. Recursos Apps podem exigir WAHA Plus/licença. Esta base não afirma que a imagem Core contém a integração paga. Se usar Plus, configure imagem/licença obtidas pelo titular e fixe o digest.

Para o App nativo: criar inbox e usuário técnico no Chatwoot; obter account ID, inbox ID e token; configurar URL interna `http://chat:3000`, API token e webhook específico no WAHA. Confirmar na documentação da versão a necessidade de Redis dedicado para Apps, habilitando os serviços exigidos antes da ativação. A rede atual mantém WAHA separado do Chatwoot; adicione somente uma rede de integração daquele cliente após escolher esse caminho.

Alternativa sem App pago: workflows bidirecionais no n8n. WAHA → webhook n8n → API Chatwoot para contato/conversa/mensagem; Chatwoot webhook de mensagem de saída → n8n → API WAHA `sendText`. Tratar eventos próprios para evitar loop, chave de deduplicação por message ID, mídia, retries, rate limits e reconexões. Os workflows de negócio não foram implementados sem essa decisão, account ID/token e sessão pareada. A rede n8n já alcança WAHA e Chatwoot.

WAHA usa acesso não oficial ao WhatsApp: pode desconectar, mudar comportamento ou resultar em restrição/bloqueio do número. Para operação crítica, prefira o canal oficial WhatsApp Cloud API do Chatwoot. Isso exige conta Meta, número habilitado, verificação e políticas/templates da plataforma; não é fornecido apenas pela instalação Docker.

## Publicação

O piloto liga ingress e WAHA ao loopback. Para publicar, crie outro cliente com domínio real e porta 443, depois configure DNS, firewall e roteador. Caddy passa a usar ACME com desafios em 80/443. Não exponha o painel 8099, WAHA, Redis ou bancos.

```powershell
node manage.mjs create empresa cliente.seudominio.com 443
```

DNS precisa apontar `auth`, `chat`, `n8n`, `postiz`, `cloud` e `erp` sob o domínio do cliente. Só um ingress pode ocupar 80/443 no mesmo IP. Para várias empresas, use o cadastro padronizado com domínio base e `scripts\Start-Gateway.ps1`, conforme [SERVICO.md](SERVICO.md). Esse fluxo gera o gateway frontal por hostname sem unir redes de bancos; o cadastro técnico antigo continua disponível para instâncias independentes.

NAT/CGNAT pode impedir entrada. Certificados e webhooks externos dependem de endpoint acessível e DNS real; uma VPN administrativa não resolve callbacks públicos. n8n precisa de `WEBHOOK_URL` correto e os webhooks devem validar assinatura/segredo conforme a origem. Cadastro de apps nas redes sociais do Postiz exige IDs/secrets e URLs de callback aprovadas pelos respectivos provedores.

Defina quais serviços são privados. O gerador para domínio real publica as seis rotas HTTP do cliente; antes de produção, limite ERP/arquivos/admin por firewall/VPN e políticas de autenticação. Deixe públicos somente atendimento, callbacks e webhooks necessários. Esse filtro depende da rede/endereços ainda não informados.

## WireGuard

Profile `vpn` fornece container LinuxServer com `NET_ADMIN`, volume de chaves e porta UDP separada. Não usa `SYS_MODULE` nem monta módulos do Windows: o kernel Linux da VM precisa já suportar WireGuard. A compatibilidade com esta instalação Docker Desktop ainda não foi testada.

`scripts\Configure-VPN.ps1` exige endpoint, CIDR da LAN e DNS. Ele recusa `.localhost`, configura split tunnel e inicia somente WireGuard. Um container VPN isoladamente não muda as regras de acesso do Windows: configure resolução dos nomes privados para o IP LAN correto, alcance da LAN via NAT do Docker e firewall permitindo acesso administrativo apenas das redes autorizadas. Encaminhe a porta UDP do roteador e teste externamente.

Validar: handshake (`wg show`), resolução DNS, acesso administrativo pela VPN, bloqueio sem VPN, alcance externo dos webhooks, isolamento entre clientes e acesso após reiniciar o host. Não distribuir arquivos de peer ou QR codes em chats públicos. Se o kernel/roteamento do Docker Desktop impedir a implantação, use WireGuard nativo ou VM Linux dedicada; não marque a VPN como operacional com base apenas em container `running`.

## Fontes oficiais consultadas

- [Authentik Compose](https://docs.goauthentik.io/install-config/install/docker-compose)
- [Chatwoot Compose de referência](https://github.com/chatwoot/chatwoot/blob/develop/docker-compose.production.yaml)
- [ERPNext/Frappe Docker](https://github.com/frappe/frappe_docker)
- [Postiz Compose](https://github.com/gitroomhq/postiz-docker-compose)
- [n8n Docker](https://docs.n8n.io/hosting/installation/docker/)
- [Nextcloud OIDC](https://docs.nextcloud.com/server/stable/admin_manual/configuration_user/user_auth_oidc.html)
- [WAHA Apps](https://waha.devlike.pro/docs/apps/about/)
- [WAHA Chatwoot](https://waha.devlike.pro/docs/apps/chatwoot/)
- [WireGuard LinuxServer](https://docs.linuxserver.io/images/docker-wireguard/)
- [Docker WSL e disco virtual](https://docs.docker.com/desktop/features/wsl/)

Antes de comercializar hospedagem por cliente, conferir licenças dos produtos, especialmente n8n/SSO e WAHA Apps. Nenhuma compra ou assinatura foi realizada.
