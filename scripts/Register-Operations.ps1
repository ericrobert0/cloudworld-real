param([string]$ExternalDirectory='')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if($root -notmatch '^D:\\'){throw 'Execute na instalacao operacional do D:.'}
$node=(Get-Command node -ErrorAction Stop).Source
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6)
$portalAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Run-Portal.ps1')+'"') -WorkingDirectory $root
if(!(Get-ScheduledTask -TaskName 'CloudWorld-Portal' -ErrorAction SilentlyContinue)){
    Register-ScheduledTask -TaskName 'CloudWorld-Portal' -Description 'Portal separado para clientes CloudWorld; depende da sessao Windows.' -Action $portalAction -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Principal $principal -Settings (New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew) | Out-Null
}
$backupAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'Run-BackupTask.ps1')+'"') -WorkingDirectory $root
$existing=Get-ScheduledTask -TaskName 'CloudWorld-Backup' -ErrorAction SilentlyContinue
if(!$existing){
    Register-ScheduledTask -TaskName 'CloudWorld-Backup' -Description 'Backup diario as 03h, com verificacao SHA256. Depende de sessao Windows e Docker ativo.' -Action $backupAction -Trigger (New-ScheduledTaskTrigger -Daily -At '03:00') -Principal $principal -Settings $settings | Out-Null
}else{if(!$existing.Actions[0].Arguments.Contains($root)){throw 'Tarefa existente pertence a outra instalacao; nada sobrescrito.'};Set-ScheduledTask -TaskName 'CloudWorld-Backup' -Action $backupAction | Out-Null}
$file=Join-Path $root 'runtime\backup-policy.private.json'
$policy=if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Raw | ConvertFrom-Json}else{[pscustomobject]@{}}
$policy | Add-Member -NotePropertyName enabled -NotePropertyValue $true -Force
$policy | Add-Member -NotePropertyName timezone -NotePropertyValue 'America/Sao_Paulo' -Force
$policy | Add-Member -NotePropertyName schedule -NotePropertyValue '03:00' -Force
if($ExternalDirectory){$dest=[IO.Path]::GetFullPath($ExternalDirectory);if($dest.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'Destino externo nao pode ficar na instalacao.'};$policy|Add-Member -NotePropertyName externalDirectory -NotePropertyValue $dest -Force}
[IO.File]::WriteAllText($file,($policy|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Start-ScheduledTask -TaskName 'CloudWorld-Portal'
Get-ScheduledTask -TaskName 'CloudWorld-*' | Select-Object TaskName,State
Write-Output 'Backup diario preparado. Sem destino externo informado, somente o backup local sera executado.'
