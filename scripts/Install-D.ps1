param([string]$Destination='D:\VlanWorld')
$ErrorActionPreference='Stop'
$source=Split-Path $PSScriptRoot -Parent
$dest=[IO.Path]::GetFullPath($Destination)
if ($dest -notmatch '^D:\\[^\\]+') { throw 'Use uma pasta dentro de D:, nunca a raiz do disco.' }
if(Test-Path (Join-Path $dest 'runtime')) { throw 'Destino ja possui runtime. Atualize os fontes preservando os dados; nao sobrescreva uma instalacao existente.' }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$filesJson=& node (Join-Path $source 'scripts/List-Distribution.mjs')
if($LASTEXITCODE -ne 0){throw 'Falha ao validar o manifesto de fontes.'}
$files=@($filesJson | ConvertFrom-Json)
foreach($name in $files) {
    $target=Join-Path $dest $name
    New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination $target -Force
}

New-Item -ItemType Directory -Force (Join-Path $dest 'runtime') | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $dest /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0) {throw 'Nao foi possivel restringir permissoes da instalacao.'}
Push-Location $dest
try {
    & npm ci --ignore-scripts --cache (Join-Path $dest '.npm-cache')
    if($LASTEXITCODE -ne 0){throw 'Falha ao instalar as dependencias da API/monitoramento.'}
    & node manage.mjs create piloto piloto.localhost 8443
    if($LASTEXITCODE -ne 0){throw 'Falha ao criar piloto.'}
    & node manage.mjs validate piloto
    if($LASTEXITCODE -ne 0){throw 'Falha na validacao Compose.'}
} finally {Pop-Location}
Write-Output "Instalacao preparada em $dest. Nenhum container foi iniciado por este script."
