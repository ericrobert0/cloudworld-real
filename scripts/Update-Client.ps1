param([string]$Client='piloto',[Parameter(Mandatory=$true)][string]$Service,[Parameter(Mandatory=$true)][string]$Image)
$ErrorActionPreference='Stop'
if($Client -notmatch '^[a-z][a-z0-9-]{1,30}$'){throw 'Cliente invalido'}
$root=Split-Path $PSScriptRoot -Parent
& node (Join-Path $root 'manage.mjs') update $Client $Service $Image
if($LASTEXITCODE -ne 0){throw 'Atualizacao falhou. Consulte o registro e o backup; trocar a imagem anterior nao desfaz migracoes.'}
