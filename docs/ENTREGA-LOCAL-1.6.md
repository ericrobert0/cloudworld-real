# CloudWorld 1.6 — preferência por economia de RAM

Foi aplicado um perfil de concorrência menor no piloto, mantendo todas as ferramentas. Authentik web passou a um processo; Chatwoot web usa até três threads e o worker usa três tarefas normais, preservando duas internas de monitoramento. Somente três containers foram recriados, sequencialmente. Bancos, imagens, volumes, senhas, limites máximos de memória e configurações do WSL foram preservados.

## Observação de consumo

| Medida | Soma do uso informado pelos containers |
| --- | ---: |
| Mediana das três amostras anteriores | aproximadamente 4.559 MiB |
| Mediana das três amostras posteriores | aproximadamente 4.345 MiB |
| Diferença observada | aproximadamente 214 MiB a menos |

Não é uma promessa de economia fixa nem a quantidade exata liberada no Windows. São amostras pontuais; cache, aquecimento e outros processos influenciam o uso. O maior consumidor individual, Postiz, foi mantido disponível com seus limites anteriores.

## Entrega

- Perfil informativo em **Clientes e operação → Perfil de recursos**, sem transformar a economia em critério de aprovação comercial.
- Perfil econômico por padrão para novas empresas de teste em `.localhost`; domínios reais permanecem no perfil padrão para dimensionamento próprio.
- Testes automatizados executados um arquivo por vez para diminuir o pico de RAM do processo de validação.
- Script de aplicação com configuração anterior protegida e reversão automática em caso de falha.
- Metadados do perfil incluídos na lista das próximas cópias de backup.

A primeira tentativa foi revertida porque a validação tratava o total do Sidekiq como apenas três. A versão instalada inclui duas tarefas internas do Sidekiq Alive; a checagem foi corrigida e confirmou cinco no worker atual. O relatório da tentativa revertida permanece preservado.

Não foram criados novos ambientes de laboratório nem repetidos testes de carga/restauração. Os resultados de carga da versão anterior não reaprovam automaticamente a configuração nova. A validação desta etapa é leve e não homologa capacidade comercial.

Passaram 44 testes automatizados em execução sequencial, as verificações leves das sete APIs, seis verificações HTTP do portal e o fluxo real de login central com rejeição de PKCE incorreto/replay. Os 28 serviços estão ativos e a trava de manutenção foi encerrada.

Ver [PERFIL-ECONOMICO.md](PERFIL-ECONOMICO.md) para opções, limites e referências. Os resultados sem credenciais ficam em `reports/economy-profile.json`; a configuração anterior permanece na instalação protegida do D.
