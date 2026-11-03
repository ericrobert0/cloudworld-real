param([string]$Destination='D:\VlanWorld')
$ErrorActionPreference='Stop'
$source=Split-Path $PSScriptRoot -Parent
if(!(Test-Path -LiteralPath (Join-Path $source 'node_modules\net-snmp'))){throw 'Instale as dependencias com npm ci --ignore-scripts antes de publicar.'}
$dest=[IO.Path]::GetFullPath($Destination)
if($dest -notmatch '^D:\\[^\\]+' -or !(Test-Path -LiteralPath (Join-Path $dest 'runtime\panel-password.txt'))){throw 'Instalacao existente no D: nao encontrada.'}
if([IO.Path]::GetFullPath($source) -eq $dest){throw 'Execute a partir da copia de trabalho.'}
Push-Location $source
try{& node --test --test-concurrency=1 tests/*.test.mjs;if($LASTEXITCODE -ne 0){throw 'Testes falharam; nenhum fonte publicado.'}}finally{Pop-Location}
$password=[IO.File]::ReadAllText((Join-Path $dest 'runtime\panel-password.txt')).Trim()
$headers=@{Authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('admin:'+$password))}
try{$status=Invoke-RestMethod 'http://127.0.0.1:8099/api/status' -Headers $headers -TimeoutSec 5;if($status.busy){throw 'PAINEL_OCUPADO'}}catch{if($_.Exception.Message -match 'PAINEL_OCUPADO'){throw 'Aguarde a operacao atual.'};if((Get-ScheduledTask -TaskName VlanWorld-Control).State -eq 'Running'){throw 'Nao foi possivel consultar o painel ativo; nada alterado.'}}
$filesJson=& node (Join-Path $source 'scripts/List-Distribution.mjs')
if($LASTEXITCODE -ne 0){throw 'Falha ao validar o manifesto de fontes.'}
$files=@($filesJson | ConvertFrom-Json)
$backup=Join-Path $dest ('runtime\deployments\cloudworld-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach($f in $files){$old=Join-Path $dest $f;if(Test-Path -LiteralPath $old){$save=Join-Path $backup $f;New-Item -ItemType Directory -Force (Split-Path $save -Parent)|Out-Null;Copy-Item -LiteralPath $old -Destination $save}}
# Stop processes before replacing their source files. Preserve tenant runtime and volumes.
$portalRunning=(Get-ScheduledTask -TaskName 'CloudWorld-Portal' -ErrorAction SilentlyContinue).State -eq 'Running'
$panelRunning=(Get-ScheduledTask -TaskName 'VlanWorld-Control').State -eq 'Running'
Stop-ScheduledTask -TaskName VlanWorld-Control
if($portalRunning){Stop-ScheduledTask -TaskName CloudWorld-Portal}
try {
    foreach($f in $files){
        $target=Join-Path $dest $f
        New-Item -ItemType Directory -Force (Split-Path $target -Parent)|Out-Null
        Copy-Item -LiteralPath (Join-Path $source $f) -Destination $target -Force
    }
    & npm ci --ignore-scripts --prefix $dest --cache (Join-Path $dest '.npm-cache')
    if($LASTEXITCODE -ne 0){throw 'Falha ao instalar dependencias na atualizacao.'}
}catch{
    # Restore sources that existed before this update. No tenant data is overwritten.
    foreach($f in $files){$saved=Join-Path $backup $f;if(Test-Path -LiteralPath $saved){Copy-Item -LiteralPath $saved -Destination (Join-Path $dest $f) -Force}}
    & npm ci --ignore-scripts --prefix $dest --cache (Join-Path $dest '.npm-cache')
    if($panelRunning){Start-ScheduledTask -TaskName VlanWorld-Control}
    if($portalRunning){Start-ScheduledTask -TaskName CloudWorld-Portal}
    throw
}
Start-ScheduledTask -TaskName VlanWorld-Control
if($portalRunning){Start-ScheduledTask -TaskName CloudWorld-Portal}
$ready=$false
for($i=0;$i -lt 30;$i++){
    try{$page=Invoke-WebRequest 'http://127.0.0.1:8099/' -Headers $headers -UseBasicParsing -TimeoutSec 3;if($page.StatusCode -eq 200 -and $page.Content.Contains('toggle-contact-sync')){$ready=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
}
if(!$ready){throw 'Fontes publicados, mas painel nao respondeu. Consulte runtime\service.log; nao execute os testes reais ainda.'}
Write-Output "CloudWorld publicada. Copia dos fontes anteriores: $backup"
