$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if(!(Test-Path (Join-Path $root 'runtime\docker-storage-confirmed.json'))){throw 'Confirme primeiro o disco Docker no D:.'}
& node (Join-Path $root 'service.mjs') edge
if($LASTEXITCODE -ne 0){throw 'Falha ao gerar a entrada central.'}
$dir=Join-Path $root 'runtime\edge'
& docker compose --project-directory $dir -f (Join-Path $dir 'compose.json') config --quiet
if($LASTEXITCODE -ne 0){throw 'Compose da entrada central invalido.'}
& docker compose --project-directory $dir -f (Join-Path $dir 'compose.json') up -d --wait --wait-timeout 180
if($LASTEXITCODE -ne 0){throw 'Gateway falhou. Inicie os clientes cadastrados e confira redes, DNS e portas 80/443.'}
& docker compose --project-directory $dir -f (Join-Path $dir 'compose.json') exec -T gateway caddy reload --config /etc/caddy/Caddyfile
if($LASTEXITCODE -ne 0){throw 'Falha ao recarregar rotas.'}
