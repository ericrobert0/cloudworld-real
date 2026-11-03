# Entrega 1.6.4

## Problema resolvido

A fila acumulava eventos entregues ate bloquear novas entradas no limite de 10 mil registros. O arquivamento retira entregas concluidas da fila ativa preservando o evento e a chave de idempotencia em armazenamento privado por empresa. Novas entradas proximas do limite tentam liberar capacidade; trabalho nao concluido nunca e removido.

## Comportamento e operacao

- Painel mostra contadores e permite arquivar entregas antigas.
- API do operador oferece estatisticas e arquivamento em lotes limitados.
- Reenvios de eventos arquivados continuam retornando o ID original; conteudo divergente gera conflito.
- Falha parcial de gravacao preserva a fila original e permite repetir a operacao.
- Alerta de capacidade abre apos duas observacoes acima do limiar e resolve quando a fila diminui.
- Backups incluem o historico em JSONL e o arquivo de imagens solicitadas.
- Recuperacao do historico verifica empresa, integridade, duplicatas e formato antes de publicar o diretorio.

## Validacao

Em Linux/Podman, passaram 84 testes de codigo, com um teste especifico da CLI Docker ignorado e nenhuma falha. Os cenarios novos incluem 10 mil eventos, deduplicacao apos reinicio, entrega em andamento, falha de disco simulada, backup/exportacao AES-GCM e restauracao, arquivos adulterados e permissoes HTTP.

O ensaio de backup desta entrega usa dados temporarios; nao houve parada das aplicacoes reais para produzir um novo backup. A recuperacao funcional completa das aplicacoes em outro host continua pendente de homologacao.

Arquivos arquivados nao expiram automaticamente e continuam consumindo disco. O runtime ainda pressupoe um unico processo operador; nao e uma fila distribuida nem garante exactly-once nos destinos. Consulte FILA-E-ARQUIVAMENTO.md antes de definir retencao ou restauracao operacional.
