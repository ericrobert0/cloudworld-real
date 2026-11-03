# Entrega 1.6.5

## Mudancas

O painel deixa de considerar uma politica habilitada como prova suficiente de agendamento. Uma consulta assincorna verifica systemd no Linux ou o Agendador de Tarefas no Windows, com evidencia recente vinculada a maquina, codigo, runtime, motor e escopo corretos.

O verificador exige rotina diaria ativa, proxima execucao em ate 36 horas e comando da instalacao corrente. Dados antigos ou de outra instalacao permanecem pendentes. A consulta tem limite de tempo, evita sobreposicao e nao expoe argumentos ou variaveis de ambiente dos servicos na API.

Inclui comando Check-BackupSchedule.mjs e modelos de timer de usuario para Podman rootless. Nenhum agendamento foi instalado, ativado ou executado automaticamente.

## Validacao

- 90 testes aprovados; um teste especifico da CLI Docker ignorado no Podman; nenhuma falha.
- Casos simulados: Linux system/user, tarefa Windows diaria, timer desabilitado, comando incorreto, runtime/usuario/motor divergente, ausencia de servico, evidencia expirada e falha de consulta sem vazamento de saida privada.
- Consulta real no host Linux retornou pendente para um servico ausente ou nao correspondente, sem aprovar uma rotina inexistente.
- A versao anterior 1.6.4 ja foi publicada em main e passou na CI do GitHub.

A execucao real no Windows permanece pendente. Verificar um agendamento nao comprova backup concluido, copia externa nem recuperacao funcional; os indicadores continuam separados. Consulte AGENDAMENTO-VERIFICADO.md para os formatos suportados e a preparacao operacional dos timers.
