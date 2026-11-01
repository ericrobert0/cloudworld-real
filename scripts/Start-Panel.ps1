$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$node=(Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force (Join-Path $root 'runtime') | Out-Null
Start-Process -FilePath $node -ArgumentList ('"'+(Join-Path $root 'panel.mjs')+'"') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'runtime\panel.stdout.log') -RedirectStandardError (Join-Path $root 'runtime\panel.stderr.log')
Write-Output 'Painel: http://127.0.0.1:8099 (usuario admin; senha em runtime\panel-password.txt)'
