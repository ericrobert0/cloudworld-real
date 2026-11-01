$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if($root -notmatch '^D:\\'){throw 'Registre a instalacao operacional do D:.'}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Run-Service.ps1')+'"') -WorkingDirectory $root
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
if(Get-ScheduledTask -TaskName 'VlanWorld-Control' -ErrorAction SilentlyContinue){throw 'Tarefa VlanWorld-Control ja existe; nao foi sobrescrita.'}
Register-ScheduledTask -TaskName 'VlanWorld-Control' -Description 'Painel administrativo local CloudWorld; inicia na entrada do usuario e reinicia em caso de falha.' -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Select-Object TaskName,State
Write-Output 'Registrado para o proximo login. Nao e um servico de boot independente da sessao Windows.'
