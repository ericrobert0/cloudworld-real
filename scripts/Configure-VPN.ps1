param(
    [string]$Client='piloto',
    [Parameter(Mandatory=$true)][string]$Endpoint,
    [Parameter(Mandatory=$true)][string]$PrivateLanCidr,
    [Parameter(Mandatory=$true)][string]$DnsServer
)
$ErrorActionPreference='Stop'
if($Client -notmatch '^[a-z][a-z0-9-]{1,30}$'){throw 'Cliente invalido'}
if($Endpoint -notmatch '^[a-z0-9.-]+$'){throw 'Endpoint invalido'}
if($PrivateLanCidr -notmatch '^\d{1,3}(\.\d{1,3}){3}/\d{1,2}$'){throw 'CIDR invalido'}
if($DnsServer -notmatch '^\d{1,3}(\.\d{1,3}){3}$'){throw 'DNS invalido'}
$root=Split-Path $PSScriptRoot -Parent
$dir=Join-Path $root "runtime\tenants\$Client"
$tenant=Get-Content (Join-Path $dir 'tenant.json') -Raw | ConvertFrom-Json
if($tenant.local){throw 'VPN remota exige dominio real/privado resolvido por split DNS. .localhost so funciona no computador local.'}
$composePath=Join-Path $dir 'compose.json'
$compose=Get-Content $composePath -Raw | ConvertFrom-Json
$wg=$compose.services.wireguard
$wg.environment.SERVERURL=$Endpoint
$wg.environment.SERVERPORT=[string]($tenant.port+3)
$wg.environment.ALLOWEDIPS="10.13.13.0/24,$PrivateLanCidr"
$wg.environment.PEERDNS=$DnsServer
[IO.File]::WriteAllText($composePath,($compose | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
& docker compose --project-directory $dir -f $composePath --profile vpn up -d wireguard
if($LASTEXITCODE -ne 0){throw 'Falha na VPN; confira suporte WireGuard no kernel do Docker Desktop e logs.'}
Write-Output 'VPN iniciada; teste handshake externo, rotas e DNS antes de considerar o acesso protegido.'
