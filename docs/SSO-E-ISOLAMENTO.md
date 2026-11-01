# Login central e validação entre empresas

## Portal com Authentik

O portal agora suporta OpenID Connect por empresa. O fluxo usa Authorization Code, PKCE S256, state, nonce e assinatura do ID Token. A biblioteca openid-client faz a validação do emissor, destinatário, assinatura e validade; nenhuma dessas verificações é desativada.

O vínculo é explícito: a conta local do portal registra o emissor e o UUID imutável do usuário no Authentik. Claims adicionais identificam a empresa e o usuário do portal. Não há associação automática só por nome ou email.

- **Entrar com login central** usa o Authentik da empresa informada.
- O login local continua funcionando durante a transição; `requireSso` permanece falso no piloto. Em **Clientes e operação**, o administrador pode exigir login central depois de testar uma conta vinculada. Esse modo bloqueia também as sessões locais existentes; contas sem vínculo não conseguem entrar.
- Suspender a conta no portal ou redefinir sua senha local revoga as sessões locais existentes.
- **Sair do portal** encerra a sessão do portal. Não encerra automaticamente a sessão do Authentik ou de outras aplicações.
- Sessões emitidas pelo login central revalidam o usuário no Authentik ao consultar o portal, com cache de até 30 segundos. Conta suspensa ou desvinculada encerra a sessão; indisponibilidade do diretório bloqueia a consulta. Para bloqueio imediato, suspenda também a conta do portal. O acesso por senha local continua independente enquanto o modo central obrigatório estiver desativado. Logout global ainda não foi implementado.
- O fluxo está implementado no portal; Chatwoot, ERPNext, Nextcloud e Postiz ainda podem pedir seus próprios logins. MFA e SSO nessas aplicações precisam de configuração compatível com cada produto.

Transações de login expiram em cinco minutos e são de uso único, vinculadas a um cookie HttpOnly/SameSite=Lax. Depois da autorização, a sessão do portal usa HttpOnly/SameSite=Strict e Secure quando a origem pública é HTTPS. Tokens OIDC não ficam no navegador nem são guardados na sessão; só os identificadores necessários ao vínculo.

## Configuração local

`node scripts/configure-portal-sso.mjs EMPRESA` configura o provedor assinado, os claims e a conta inicial da empresa no Authentik local. O script se restringe ao piloto local e à conta inicial registrada em portal-initial.private.json. Contas adicionais precisam de vínculo explícito antes de usarem esse login.

O cliente OAuth, seu segredo e o callback ficam em `portal-oidc.private.json`, incluído nos backups por empresa. O segredo não aparece na interface nem nos relatórios. A configuração é idempotente e não redefine a senha de uma identidade já vinculada. Usuários existentes sem vínculo não são reaproveitados automaticamente.

Os certificados locais são verificados com a CA correspondente a cada empresa; não se utiliza rejectUnauthorized=false neste fluxo. Não foi instalada uma nova raiz de confiança no Windows. No navegador, a CA local precisa ser reconhecida para usar os endereços de teste; em produção, usar domínio e HTTPS válidos.

## Testes de login

`node scripts/test-sso-live.mjs piloto` executa autenticação real por senha no executor do Authentik, segue a autorização, usa os endpoints HTTP do portal e valida a sessão. Também verifica rejeição de código repetido e de PKCE incorreto. Credenciais, códigos e tokens não são gravados nos relatórios.

Com duas empresas: `node scripts/test-sso-live.mjs EMPRESA-A EMPRESA-B`. O teste tenta trocar um código emitido por A no fluxo de B e exige a rejeição antes de confirmar os logins legítimos. `--direct` limita o teste à implementação OIDC sem passar pelo servidor HTTP do portal; o padrão testa os endpoints reais.

Os testes automatizados usam um emissor controlado e verificam assinatura estrangeira, audiência, emissor, validade, nonce, vínculo, expiração e navegador diferente. Isso complementa o teste real; não substitui uma auditoria independente.

## Laboratório de duas empresas completas

`scripts/run-isolation-lab.mjs` prepara uma segunda empresa com bancos, senhas, volumes e CA próprios, usando as mesmas imagens fixadas do piloto. O computador não tem folga para manter duas cópias completas em uso contínuo; a comparação simultânea acontece por família de aplicações.

Durante o laboratório, ferramentas do piloto podem ficar pausadas. O script usa travas de manutenção, registra as etapas e tenta retomar exatamente os serviços originalmente ativos no finally. Ao concluir, desliga o projeto temporário sem apagar volumes e arquiva sua configuração fora da lista de empresas ativas. Rodadas futuras recebem identificadores novos para evitar reutilizar volumes antigos com senhas diferentes.

Verificações previstas:

- autenticação própria e senha estrangeira recusada em PostgreSQL e MariaDB;
- sete APIs com credenciais próprias e recusa das credenciais da outra empresa;
- SSO com emissores separados, PKCE, código cruzado e replay;
- arquivos de teste de uma empresa inexistentes na outra;
- alcance do próprio banco e bloqueio de acesso ao banco da outra rede, a partir do container da aplicação;
- contas do portal com mesmo nome, senhas diferentes e rejeição de sessão com empresa adulterada.

Resultado: `runtime/isolation-lab/result.json`; diagnóstico detalhado em arquivo privado no mesmo diretório. Os testes usam dados fictícios e não enviam mensagens de WhatsApp ou publicações sociais.

Na primeira rodada, seis verificações PostgreSQL usaram loopback, onde a imagem permite `trust`; esse método não verifica senha. Os sete bancos foram repetidos pelo IP de rede Docker, confirmando senha própria e rejeição da estrangeira. A tentativa original permanece em `result.json`; `database-checks.json` contém a repetição e `result.reviewed.json` combina as evidências sem ocultar a correção. O script de laboratório já utiliza o método TCP correto nas rodadas futuras.

Não interpretar um resultado aprovado como homologação de dois clientes completos simultâneos, capacidade comercial, SSO de todas as ferramentas ou auditoria de intrusão. Ainda há trabalho de permissões, MFA, recuperação funcional e carga no servidor definitivo.

Referências: [provedor OAuth2 do Authentik](https://docs.goauthentik.io/add-secure-apps/providers/oauth2), [openid-client](https://github.com/panva/openid-client), [validações do grant](https://github.com/panva/openid-client/blob/main/docs/interfaces/AuthorizationCodeGrantChecks.md).
