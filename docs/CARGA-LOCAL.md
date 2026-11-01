# Carga local e observação de estabilidade

Os scripts são restritos ao piloto local e não homologam produção. Na instalação do D, executar um de cada vez:

```powershell
node scripts/test-load-local.mjs
node scripts/test-load-bursts.mjs
```

## Perfis

O primeiro aumenta o teto de trabalhadores de 1 para 3, 6 e 10, com frequência global de 0,5, 1, 2 e 3 ciclos por segundo. Cada ciclo consulta a sessão do portal e uma aplicação. Esse teto **não significa que dez requisições estiveram simultaneamente em execução**; a frequência é limitada. Ao terminar, observa o estado dos containers por mais 60 segundos.

O segundo realiza três rajadas por etapa, com 1, 3, 6 e 10 requisições emitidas em paralelo. Portal e aplicações são testados em grupos separados. O relatório registra o máximo de requisições em voo no cliente de teste. Esse número não representa pessoas ou empresas.

As operações são leituras autenticadas. Há consulta de contatos no Chatwoot, lista curta de clientes no ERP e verificações das APIs de Authentik, Nextcloud, Postiz e WAHA. No n8n é consultada a saúde, sem executar workflows. Não há mensagens, publicações, uploads, vendas ou emissão de documentos. Uma conta existente do portal e as chaves já configuradas nas integrações são utilizadas; o teste não simula identidades distintas nem autenticação SSO em massa.

## Proteções e métricas

- Trava global para impedir dois testes de carga ao mesmo tempo; recusa início durante manutenção ou backup.
- Pré-verificação de 28 serviços ativos, ausência de OOM e memória disponível.
- Consultas contínuas limitadas a três ciclos/s; consultas Postiz espaçadas para respeitar o serviço.
- Interrupção após falhas repetidas, duas amostras com menos de 800 MiB livres no Windows ou mudança de estado/reinício de containers. As rajadas conferem recursos entre etapas e recusam manutenção.
- Sessão de teste encerrada ao terminar. Não são registradas senhas, cookies, tokens ou respostas com dados de clientes.
- Contagem de requisições, falhas e latências p50, p95 e máxima por endpoint. p95 é o tempo abaixo do qual ficaram pelo menos 95% das amostras daquele grupo.
- Amostras de memória livre do host, estados/reinícios e consumo informado pelo Docker durante o perfil contínuo.

Os arquivos são gravados em `runtime/reports/load-local-ID.json` e `load-bursts-ID.json`. O painel **Clientes e operação** mostra “Ensaio local de consultas e rajadas” quando os dois últimos perfis estão completos, sem falhas, recentes e vinculados ao hash da configuração atual. A capacidade comercial continua pendente.

## Interpretação

O resultado descreve somente esse perfil de leitura, os dados do piloto e os recursos observados naquele computador. Não determina número de usuários/clientes, velocidade de tarefas pesadas, pico de gravações, recuperação sob carga ou disponibilidade 24×7. Uma observação de 60 segundos não é teste prolongado de estabilidade. O servidor definitivo precisa de nova homologação com volumes e tarefas representativos do cliente e critérios de aceitação definidos.
