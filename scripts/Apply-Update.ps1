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
$files=@('package.json','package-lock.json','infra.mjs','integration.mjs','monitoring.mjs','operations.mjs','portal.mjs','backup-store.mjs','api.mjs','postiz.mjs','mixpost.mjs','host-policy.mjs','manage.mjs','panel.mjs','service.mjs','README.md','public/index.html','public/panel.js','public/panel.css','public/portal.html','public/portal.js','public/portal.css','scripts/Install-D.ps1','scripts/test-postiz.mjs','scripts/provision-integrations.mjs','scripts/test-platform-live.mjs','scripts/Register-Operations.ps1','scripts/Run-Portal.ps1','scripts/Run-Backups.mjs','scripts/Create-Pilot-Portal.mjs','docs/INTEGRACAO-CENTRAL.md','docs/PREPARACAO-COMERCIAL.md')
$files+=@('notifications.mjs','scripts/test-portal-live.mjs','scripts/test-backup-export.mjs','scripts/Package-Release.mjs','scripts/Inspect-Capacity.mjs','scripts/Run-BackupTask.ps1')
$files+=@('oidc.mjs','scripts/configure-portal-sso.mjs','scripts/test-sso-live.mjs')
$files+=@('scripts/run-isolation-lab.mjs','docs/SSO-E-ISOLAMENTO.md')
$files+=@('database-isolation.mjs','scripts/test-database-isolation.mjs')
$files+=@('scripts/review-isolation-result.mjs','docs/ENTREGA-LOCAL-1.2.md')
$files+=@('docs/PORTAL-DA-EMPRESA.md')
$files+=@('recovery.mjs','scripts/test-functional-recovery.mjs','scripts/check-recovered-apps.mjs','docs/RECUPERACAO-FUNCIONAL.md')
$files+=@('docs/ENTRADA-DE-CLIENTES.md')
$files+=@('scripts/Apply-PostizOffline.mjs')
$files+=@('docs/ENTREGA-LOCAL-1.4.md')
$files+=@('load-test.mjs','scripts/test-load-local.mjs','scripts/test-load-bursts.mjs','docs/CARGA-LOCAL.md')
$files+=@('docs/ENTREGA-LOCAL-1.5.md')
$files+=@('resource-profile.mjs','scripts/Apply-EconomyProfile.mjs','docs/PERFIL-ECONOMICO.md')
$files+=@('docs/ENTREGA-LOCAL-1.6.md')
$files+=@('scripts/Check-LinuxHost.mjs','docs/ENTREGA-REAL-1.6.1.md')
$files+=@('docs/ATENDIMENTO-INTEGRADO.md')
$files+=@(Get-ChildItem -LiteralPath (Join-Path $source 'tests') -Filter '*.mjs' -File | ForEach-Object {'tests/'+$_.Name})
$backup=Join-Path $dest ('runtime\deployments\cloudworld-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach($f in $files){$old=Join-Path $dest $f;if(Test-Path -LiteralPath $old){$save=Join-Path $backup $f;New-Item -ItemType Directory -Force (Split-Path $save -Parent)|Out-Null;Copy-Item -LiteralPath $old -Destination $save}}
# Keep runtime, Compose projects, volumes and passwords in their current locations.
foreach($f in $files){Copy-Item -LiteralPath (Join-Path $source $f) -Destination (Join-Path $dest $f) -Force}
Copy-Item -LiteralPath (Join-Path $source 'node_modules') -Destination $dest -Recurse -Force
Stop-ScheduledTask -TaskName VlanWorld-Control
Start-ScheduledTask -TaskName VlanWorld-Control
if(Get-ScheduledTask -TaskName 'CloudWorld-Portal' -ErrorAction SilentlyContinue){Stop-ScheduledTask -TaskName 'CloudWorld-Portal';Start-ScheduledTask -TaskName 'CloudWorld-Portal'}
$ready=$false
for($i=0;$i -lt 30;$i++){
    try{$page=Invoke-WebRequest 'http://127.0.0.1:8099/' -Headers $headers -UseBasicParsing -TimeoutSec 3;if($page.StatusCode -eq 200 -and $page.Content.Contains('toggle-contact-sync')){$ready=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
}
if(!$ready){throw 'Fontes publicados, mas painel nao respondeu. Consulte runtime\service.log; nao execute os testes reais ainda.'}
Write-Output "CloudWorld publicada. Copia dos fontes anteriores: $backup"
