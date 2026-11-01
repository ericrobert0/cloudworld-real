$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
& node (Join-Path $PSScriptRoot 'Run-Backups.mjs') 2>&1 | Out-File (Join-Path $root 'runtime\backup-scheduler.log') -Append -Encoding utf8
exit $LASTEXITCODE
