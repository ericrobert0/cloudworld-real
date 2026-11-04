$ErrorActionPreference='Stop'
$updater=Join-Path $PSScriptRoot 'Apply-Update.ps1'
$lab=[IO.Path]::GetFullPath('D:\CloudWorld-UpdateLab-'+[guid]::NewGuid().ToString('N'))
if($lab -notmatch '^D:\\CloudWorld-UpdateLab-[a-f0-9]{32}$'){throw 'Caminho de laboratorio invalido'}
$global:CWUpdateLabFiles=@('app.mjs','new-feature.mjs','package.json','package-lock.json')

function node {
    $global:LASTEXITCODE=0
    if($args[0] -ne '--test'){$global:CWUpdateLabFiles | ConvertTo-Json -Compress}
}
function npm {
    $global:CWUpdateLabCalls++
    $global:LASTEXITCODE=if($global:CWUpdateLabScenario -eq 'dependency-failure' -and $global:CWUpdateLabCalls -eq 1){1}else{0}
}
function Get-ScheduledTask { param($TaskName,$ErrorAction) [pscustomobject]@{State=$global:CWUpdateLabTasks[$TaskName]} }
function Stop-ScheduledTask { param($TaskName,$ErrorAction) $global:CWUpdateLabTasks[$TaskName]='Ready' }
function Start-ScheduledTask { param($TaskName) $global:CWUpdateLabTasks[$TaskName]='Running' }
function Invoke-RestMethod { [pscustomobject]@{busy=$false} }
function Invoke-WebRequest {
    if($global:CWUpdateLabScenario -eq 'health-failure'){throw 'Simulated unhealthy panel'}
    [pscustomobject]@{StatusCode=200;Content='toggle-contact-sync'}
}
function Start-Sleep { param($Milliseconds) }
function Assert-Test {param([bool]$Condition,[string]$Message) if(!$Condition){throw $Message}}

try{
    foreach($scenario in @('success','dependency-failure','health-failure','concurrent-update')){
        $global:CWUpdateLabScenario=$scenario
        $global:CWUpdateLabCalls=0
        $global:CWUpdateLabTasks=@{'VlanWorld-Control'='Running';'CloudWorld-Portal'='Running'}
        $base=Join-Path $lab $scenario
        $source=Join-Path $base 'source'
        $destination=Join-Path $base 'installed'
        New-Item -ItemType Directory -Force (Join-Path $source 'scripts'),(Join-Path $source 'node_modules/net-snmp'),(Join-Path $destination 'runtime') | Out-Null
        Copy-Item -LiteralPath $updater -Destination (Join-Path $source 'scripts/Apply-Update.ps1')
        foreach($file in $global:CWUpdateLabFiles){Set-Content -LiteralPath (Join-Path $source $file) -Value 'new'}
        foreach($file in @('app.mjs','package.json','package-lock.json')){Set-Content -LiteralPath (Join-Path $destination $file) -Value 'previous'}
        Set-Content -LiteralPath (Join-Path $destination 'runtime/panel-password.txt') -Value 'lab-only'
        $dataFile=Join-Path $destination 'runtime/customer-data.private.txt'
        Set-Content -LiteralPath $dataFile -Value 'preserved'
        $dataHash=(Get-FileHash -LiteralPath $dataFile).Hash
        if($scenario -eq 'concurrent-update'){Set-Content -LiteralPath (Join-Path $destination 'runtime/.source-update.lock') -Value 'another-publisher'}
        $failed=$false
        try{& (Join-Path $source 'scripts/Apply-Update.ps1') -Destination $destination | Out-Null}catch{$failed=$true;if($scenario -eq 'success'){throw ('Success fixture failed: '+$_.Exception.Message)}}
        Assert-Test ($failed -eq ($scenario -ne 'success')) 'Resultado da publicacao inesperado'
        Assert-Test ((Get-FileHash -LiteralPath $dataFile).Hash -eq $dataHash) 'Dados do cliente foram alterados'
        $expected=if($scenario -eq 'success'){'new'}else{'previous'}
        foreach($file in @('app.mjs','package.json','package-lock.json')){
            Assert-Test ((Get-Content -LiteralPath (Join-Path $destination $file) -Raw).Trim() -eq $expected) 'Fontes nao correspondem ao resultado esperado'
        }
        Assert-Test ((Test-Path -LiteralPath (Join-Path $destination 'new-feature.mjs')) -eq ($scenario -eq 'success')) 'Arquivo novo permaneceu apos rollback'
        Assert-Test (($global:CWUpdateLabTasks.Values | Where-Object {$_ -ne 'Running'}).Count -eq 0) 'Servicos anteriores nao foram retomados'
        Assert-Test ((Test-Path -LiteralPath (Join-Path $destination 'runtime/.source-update.lock')) -eq ($scenario -eq 'concurrent-update')) 'Trava nao preservou a outra publicacao'
        if($scenario -in @('dependency-failure','health-failure')){Assert-Test ($global:CWUpdateLabCalls -eq 2) 'Dependencias anteriores nao foram recuperadas'}
        Write-Output ($scenario+' | OK')
    }
}finally{
    $resolved=[IO.Path]::GetFullPath($lab)
    if($resolved -notmatch '^D:\\CloudWorld-UpdateLab-[a-f0-9]{32}$'){throw 'Limpeza fora do laboratorio recusada'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
