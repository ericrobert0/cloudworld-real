# Isolamento do processo público do portal

O portal do Codespaces usa uma identidade Linux própria (UID/GID 61001), separada do operador que controla o Docker. A separação não adiciona containers nem instala pacotes. O piloto Windows em D: permanece com sua execução anterior.

Atualização de 02/11: o processo também recebeu namespaces próprios de PID e montagem de /proc, ocultando os processos do operador e dos containers. A validação ampliada passou em 24 verificações; dois reinícios controlados preservaram as sessões e encerraram corretamente o processo anterior. O supervisor encaminha os sinais ao grupo exclusivo criado para o portal.

## Permissões e dados

- O portal não recebe variáveis GitHub/GH, grupos suplementares, capabilities Linux ou permissão para obter novos privilégios. A heap JavaScript tem limite de 128 MiB; isso não é um limite rígido de memória total.
- A pasta runtime, o diretório Git e a pasta pessoal do operador ficam privados. Código, dependências e diretórios do projeto deixam de permitir escrita por outros usuários. O portal não pode alterar o código executado pela administração.
- O operador publica em `.portal-service/config` somente usuários do portal com hashes, URLs, estado de manutenção e configuração OIDC. O portal pode ler essa projeção, mas não alterá-la. Credenciais dos bancos, senha administrativa e tokens das integrações não são copiados.
- A configuração OIDC inclui o segredo do cliente OAuth quando configurado: ele é necessário ao login do portal. Isso não concede acesso administrativo ao Authentik.
- A revalidação de uma identidade central passa por um socket Unix privado. Esse intermediário aceita somente a verificação de um usuário já vinculado; não devolve dados de usuários nem credenciais, não aceita URLs e não executa ações nas aplicações.
- As sessões ficam em `.portal-service/sessions/<empresa>`, graváveis somente pela identidade do portal. Os arquivos dessa pasta permanecem fora do Git.

As alterações administrativas chegam à projeção aproximadamente a cada segundo. Configuração ausente, inválida ou com mais de 15 segundos bloqueia o acesso. A revalidação central mantém o cache anterior de até 30 segundos.

## Migração, reinício e backup

Na primeira inicialização, as sessões existentes são copiadas para o novo armazenamento. As contas, os hashes e as senhas permanecem iguais. A cópia antiga de sessões é esvaziada para não reaparecer em backups; reinicializações seguintes preservam o armazenamento novo.

O backup normal continua contendo as contas e a configuração OIDC originais em runtime. Sessões ativas são temporárias e não fazem parte da recuperação: uma restauração em outro ambiente exige novo login. Nunca recuperar sessões antigas de backups anteriores. Não apagar `.portal-service/sessions` durante atualizações normais.

`node scripts/Start-CodespacesPanels.mjs` prepara as permissões antes de iniciar os serviços. Se os painéis já estiverem ativos, o comando preserva os processos existentes; uma atualização de código exige reinício controlado do supervisor. O preparo requer o sudo não interativo já fornecido pelo Codespaces e bloqueia a inicialização quando isso não está disponível.

As cópias anteriores do código desta migração ficam em `runtime/source-before-portal-isolation`, sem segredos novos. Um retorno à versão anterior também retorna ao modelo de processo menos isolado; nesse caso manter as portas privadas até revisar as permissões. Não recolocar sessões antigas.

## Verificações

Aplicado no Codespace atual em 02/11/2026. Passaram 64 testes de código, 20 verificações de identidade, sete do portal, 14 de HTTPS e cinco de reinício. O reinício preservou a sessão e as contas, não reiniciou o Docker e permitiu revogar a sessão por logout. O relatório consolidado sanitizado está em `reports/portal-isolation-live.json` no repositório remoto.

`node scripts/Test-PortalIdentity.mjs` testa o acesso real sob a identidade restrita e também inspeciona o processo público em execução. Verifica a recusa do socket Docker, arquivos de credenciais e ambiente do supervisor, além de código/configuração somente para leitura e sessões graváveis. O relatório sanitizado fica em `runtime/reports/portal-identity.json`.

Executar também:

```sh
npm test
node scripts/Test-CodespacesPortal.mjs apresentacao
node scripts/Test-CodespacesPublic.mjs
```

Isso é separação de identidade e permissões no mesmo host Linux, não uma máquina virtual ou sandbox completa. O host, kernel e rede continuam compartilhados. O Codespaces continua limitado a uma empresa de apresentação; produção com clientes diferentes exige ambientes e políticas próprios, MFA, backup externo, auditoria e hospedagem apropriada.

Referências: [setpriv](https://man7.org/linux/man-pages/man1/setpriv.1.html) e [unshare](https://man7.org/linux/man-pages/man1/unshare.1.html), do util-linux.
