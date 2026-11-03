# Verificacao de backups agendados — 1.6.5

O painel agora consulta o agendador real do sistema operacional. Habilitar apenas `backup-policy.private.json` nao aprova mais a rotina. A consulta e somente leitura: nao instala, ativa, desativa ou executa tarefas e nao inicia um backup.

## O que e verificado

- Linux: timer `cloudworld-backup.timer` carregado, habilitado e ativo, calendario diario, servico correto, usuario, diretorio de trabalho e comando desta instalacao. A proxima execucao precisa ocorrer nas proximas 36 horas.
- Windows: tarefa `CloudWorld-Backup` habilitada, pronta ou em execucao, gatilho diario ativo, diretorio e script desta instalacao e proxima execucao valida.
- A politica de backup precisa estar habilitada. Evidencias de outra maquina, outro codigo/runtime ou com mais de cinco minutos nao aprovam o item.
- Codespaces continua pendente, mesmo com um agendador aparente, pois o ambiente pode suspender.

O painel coleta evidencias em segundo plano, no maximo uma vez por minuto, com limite de tempo por consulta. Os dados publicos mostram estado, momento da verificacao e proxima execucao; argumentos e variaveis de ambiente dos servicos nao sao expostos.

Para verificar manualmente:

```bash
node scripts/Check-BackupSchedule.mjs
```

Saida 0 significa agendador verificado; saida 2 significa pendente. O comando salva a evidencia privada em `runtime/backup-schedule-status.json`.

## Linux com Podman rootless

Modelos em `deploy/linux/user` usam o socket Podman do usuario. Antes de instalar um modelo, adapte `WorkingDirectory` e `ExecStart` para os caminhos reais de sua instalacao e do Node. A configuracao `runtime/container-engine.json` precisa pertencer a esse mesmo runtime.

Use `systemdScope: "user"` em `runtime/backup-policy.private.json`, mantendo `enabled: true` somente quando a rotina tiver sido preparada. Alternativamente, defina `CW_BACKUP_SYSTEMD_SCOPE=user` no ambiente do painel e do verificador. O escopo padrao e `system` para preservar os modelos Linux anteriores.

A instalacao e ativacao dos timers e uma etapa operacional separada. Para operar sem sessao aberta, o administrador precisa revisar a persistencia do gerenciador do usuario e do socket, alem dos caminhos e permissoes. Nenhum timer foi instalado ou ativado automaticamente por esta entrega.

## Restricoes

O verificador falha de modo fechado quando nao consegue interpretar uma configuracao personalizada. Servicos com wrappers, argumentos extras de Node, caminhos com espacos ou arquivos EnvironmentFile exigem adaptacao e validacao especificas. Os modelos fornecidos usam o formato suportado. No Windows, o verificador espera o script Run-BackupTask.ps1 usado pelo instalador.

A consulta de um timer ativo nao comprova backup bem-sucedido, copia fora do host ou recuperacao. Esses itens continuam separados. Backups desta plataforma pausam escritores durante a captura; planeje a janela antes de ativar a rotina. Testes de Windows nesta entrega usam respostas simuladas; execucao real deve ser homologada no sistema de destino.
