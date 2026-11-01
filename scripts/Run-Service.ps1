$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$node=(Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force (Join-Path $root 'runtime') | Out-Null
$desktop=Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
if(!(Get-Process 'com.docker.backend' -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $desktop)){
    Start-Process -FilePath $desktop -WindowStyle Hidden
}
# O painel exige a sessao do usuario; Docker Desktop tambem depende dela.
& $node (Join-Path $root 'panel.mjs') 2>&1 | Out-File (Join-Path $root 'runtime\service.log') -Append -Encoding utf8
exit $LASTEXITCODE
