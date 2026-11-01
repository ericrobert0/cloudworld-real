# CloudWorld 1.5 — perfil local de leitura

Foram registrados dois ensaios separados, sem envio de mensagens, publicações, uploads, vendas ou execução de workflows:

| Perfil | Leituras registradas | Falhas |
| --- | ---: | ---: |
| Consultas contínuas, com frequência limitada | 720 | 0 |
| Rajadas paralelas de portal e aplicações | 120 | 0 |
| Total medido pelos perfis | 840 | 0 |

As rajadas chegaram a dez requisições em voo no cliente de teste. Uma conta existente do portal e as chaves das integrações foram utilizadas; isso não representa dez pessoas ou dez empresas.

No perfil contínuo, a menor memória livre observada no Windows foi 1.914 MiB. O p95 da consulta de sessão do portal foi de aproximadamente 22 ms nas etapas medidas. Não houve reinício/OOM ou perda de saúde dos 28 serviços observados. Houve uma observação adicional de 60 segundos após a carga contínua; isso não constitui teste prolongado de estabilidade.

## Mudança no painel

Em **Clientes e operação**, o item “Ensaio local de consultas e rajadas” indica a conclusão dos dois perfis e a quantidade de leituras. A aprovação desse item exige resultados recentes e vinculados ao hash da configuração atual. O item de capacidade comercial permanece pendente.

## Evidências

- `reports/load-continuous.json`: consultas contínuas e amostras de recursos.
- `reports/load-continuous.raw.json`: relatório original preservado. Nesta primeira execução, o hash da configuração foi anexado após conferir que sua data de modificação era anterior ao início do teste; essa associação está explicitada no relatório. As próximas execuções capturam o hash antes do início.
- `reports/load-bursts.json`: rajadas, latências, erros e máximo em voo.
- `CARGA-LOCAL.md`: execução, proteções e interpretação.

Os relatórios não incluem senhas, cookies, tokens ou conteúdo das respostas com dados de negócio. Não são contadas como carga medida as consultas de monitoramento, pré-verificação, login e logout.

## O que ainda falta

Este perfil inicial não define capacidade comercial. Permanecem pendentes tarefas representativas de gravação/arquivos/automações, múltiplas identidades/SSO, teste prolongado de estabilidade e repetição no servidor definitivo. Também continuam pendentes permissões/MFA por ferramenta, infraestrutura pública, backup externo e canais de alertas/clientes conforme `PREPARACAO-COMERCIAL.md`.
