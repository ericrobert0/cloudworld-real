# Segurança da publicação para apresentação

Em 02/11/2026, o proprietário autorizou publicar seis acessos no Codespace `laughing-barnacle-gxpjggg4j6xhvjvg`, solicitando proteção contra ataques e vazamentos. Foram verificados os controles abaixo. Eles reduzem riscos; não constituem garantia de ausência de ataques, pentest ou homologação comercial.

## Controles aplicados e verificados

- Portal, Authentik, Chatwoot, Postiz, Nextcloud e ERPNext acessíveis por HTTPS. Painel administrativo 8099 e editor n8n 18003 privados no GitHub. Bancos e socket Docker não foram publicados.
- Senhas geradas distintas e fortes nos arquivos de configuração. Aplicações exigem autenticação para consultar dados; chamadas anônimas às rotas verificadas retornaram 401/403.
- Cadastro público do ERPNext desativado; Chatwoot com `ENABLE_ACCOUNT_SIGNUP=false`; Postiz recusando novas inscrições; aplicativo de cadastro aberto ausente no Nextcloud.
- Proteção contra tentativas do Nextcloud ativada. O portal possui limites de tentativas e de verificações de senha simultâneas, hash scrypt, sessão com prazo e revogação.
- Portal com CSP, bloqueio de enquadramento, cookies HttpOnly/Secure/SameSite e validação de origem. O alias HTTPS do encaminhamento só é aceito com host local configurado, conexão loopback e `Sec-Fetch-Site: same-origin`. Cabeçalhos de origem encaminhada não concedem confiança.
- Proxy das ferramentas com HSTS, proteção de tipo de conteúdo e enquadramento. A normalização de Origin para os aplicativos exige host localhost, porta/origem exatas e metadado same-origin; origens externas não são reescritas.
- Containers verificados sem modo privilegiado, rede/PID do host ou montagem do socket Docker; bancos sem portas publicadas. Cada aplicação mantém banco e credenciais próprios.
- Backups consistentes com gravadores parados e retomada verificada. Integridade e exportação AES-256-GCM aprovadas para 38 arquivos.

Resultado: 18/18 verificações locais de controles e 14/14 verificações HTTPS sem credenciais. Relatórios: `runtime/reports/security-before-publication.json` e `runtime/reports/codespaces-public-http.json`. As verificações não imprimem senhas, cookies nem corpos das respostas protegidas.

O portal passou a executar como UID/GID 61001, sem acesso ao socket Docker, arquivos privados do operador ou variáveis GitHub. Contas e configuração chegam por uma projeção somente para leitura; as sessões têm armazenamento separado. Passaram 64 testes de código, 20 verificações de identidade, sete do portal e 14 de HTTPS após a mudança.

## Limites antes de receber clientes reais

- Cadastrar e exigir MFA para administradores e identidades compatíveis; o cadastro do segundo fator deve ser realizado pelo responsável.
- A identidade do processo público foi separada do operador no Codespaces e passou em 20 verificações reais. Consulte [o isolamento do portal](PORTAL-IDENTIDADE-ISOLADA.md). O host e a rede continuam compartilhados; produção com clientes diferentes exige ambientes e políticas próprios.
- Guardar uma cópia recuperável fora do Codespace e manter a chave de exportação separada. A cópia criptografada atual permanece no mesmo host; sua restauração ainda não foi testada.
- Fazer revisão de segurança independente, acompanhamento de vulnerabilidades/atualizações, proteção contra abuso e definição de disponibilidade, retenção e resposta a incidentes. Os controles básicos verificados não equivalem a uma auditoria dessas áreas.
- Respeitar cota, suspensão e retenção do Codespaces. Este ambiente serve para apresentação com aplicações reais, não para prometer operação comercial contínua.

Depois de restaurar o backup, manter as portas privadas e executar `node scripts/Harden-Codespaces.mjs apresentacao`, os testes de aplicação/portal e as verificações HTTPS antes de nova publicação. O backup anterior às últimas configurações de segurança não deve ser tratado como autorização automática para reabrir portas.

Referências: [cabeçalhos do Caddy](https://caddyserver.com/docs/caddyfile/directives/header), [encaminhamento de portas do Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace).
