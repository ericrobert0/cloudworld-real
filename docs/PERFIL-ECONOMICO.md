# Perfil econômico local — CloudWorld 1.6

O perfil reduz concorrência de processos e tarefas do piloto para preservar RAM. Todas as ferramentas permanecem disponíveis. Não cria novos containers de laboratório, não instala novas dependências e não executa testes de carga ou restauração.

## Ajustes

| Serviço | Configuração econômica |
| --- | --- |
| Authentik web | 1 processo com 4 threads; a imagem usava 2 processos com 4 threads |
| Chatwoot web | Modo de processo único (`WEB_CONCURRENCY=0`), mínimo de 1 e máximo de 3 threads |
| Chatwoot worker | Até 3 tarefas normais simultâneas, com pool correspondente; preserva 2 internas do Sidekiq Alive |
| Testes automatizados da plataforma | Um arquivo de testes por vez (`--test-concurrency=1`) |

Os parâmetros de Puma, Sidekiq, pool de banco e valores padrão do Authentik foram conferidos no código das imagens instaladas. O worker do Authentik já usava um processo com duas threads e foi preservado. Postiz, n8n, bancos, volumes, credenciais e limites máximos de memória não foram reduzidos. O teto `mem_limit` não representa RAM permanentemente reservada; cortar esses tetos de forma arbitrária pode causar encerramentos por falta de memória.

Novas empresas de teste com domínio `.localhost` recebem o perfil econômico. É possível optar pelo padrão com `createTenant(..., {resourceProfile:'padrao'})` na API interna do gerador. Domínios reais continuam no perfil padrão e precisam de dimensionamento próprio.

## Aplicação e evidência

Na instalação operacional: `node scripts/Apply-EconomyProfile.mjs`. O script usa trava de manutenção, preserva a configuração anterior em uma pasta protegida de `runtime/deployments/economy-ID` e ajusta somente Authentik web, Chatwoot web e seu worker, um por vez. Não reinicia os bancos nem executa migrações de inicialização. Pode haver indisponibilidade breve do login/atendimento durante a troca desses containers.

A verificação exige APIs respondendo e registro do Sidekiq atual com concorrência total igual a cinco: três tarefas normais mais duas internas de monitoramento do Sidekiq Alive. Essa soma foi conferida no código da versão instalada. A primeira tentativa usou três como total e foi revertida automaticamente; sua evidência permanece preservada. Em caso de falha, o script tenta restaurar a configuração e retomar os três serviços. O resultado registra se a reversão conseguiu terminar. O diretório de implantação contém uma configuração com segredos: não compartilhar esse diretório inteiro.

São coletadas três amostras antes e três depois, somando o uso de memória informado pelo Docker e comparando as medianas. Isso é uma observação pontual, sem carga equivalente homologada; cache, tempo desde a inicialização e outros aplicativos podem alterar o resultado. A memória livre do Windows também é registrada, mas não equivale à soma dos containers. O WSL já tinha recuperação gradual de memória; seus limites não foram alterados e não houve desligamento global do WSL.

O estado informativo aparece em **Clientes e operação → Perfil de recursos**. Os testes de carga anteriores ficam como pendentes após a mudança do Compose; não são reaprovados sem nova execução. Esta etapa usa apenas verificações leves para respeitar a preferência por economia de RAM.

## Limites

Menor concorrência pode aumentar a espera quando várias pessoas ou tarefas usam a aplicação ao mesmo tempo. Não habilitar esse perfil como promessa comercial de capacidade. Reavaliar as filas e o desempenho no servidor definitivo. SSO, MFA, isolamento e validação de certificados continuam com as mesmas proteções.

Referências: [configuração do Authentik](https://docs.goauthentik.io/install-config/configuration/), [variáveis do Chatwoot](https://github.com/chatwoot/chatwoot/blob/develop/.env.example), [restrições de recursos do Docker](https://docs.docker.com/engine/containers/resource_constraints/).
