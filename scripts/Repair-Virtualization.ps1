#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '..\reports\virtualization-repair.txt'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
Start-Transcript -Path $log -Append
try {
    foreach ($feature in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
        $state = Get-WindowsOptionalFeature -Online -FeatureName $feature
        if ($state.State -ne 'Enabled') {
            Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
        }
        Get-WindowsOptionalFeature -Online -FeatureName $feature | Select-Object FeatureName,State
    }
    & bcdedit.exe /set hypervisorlaunchtype auto
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar a inicializacao do hypervisor.' }
    Get-CimInstance Win32_ComputerSystem | Select-Object HypervisorPresent
    Write-Output 'Configuracao concluida. Reinicie manualmente o Windows antes de tentar iniciar Docker.'
} finally { Stop-Transcript }
