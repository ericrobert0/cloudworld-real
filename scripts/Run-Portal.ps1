$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$config=Join-Path $root 'runtime\portal-config.json'
if(Test-Path -LiteralPath $config){$c=Get-Content $config -Raw|ConvertFrom-Json;if($c.origin){$env:CW_PORTAL_ORIGIN=$c.origin};if($c.port){$env:CW_PORTAL_PORT=[string]$c.port}}
& node (Join-Path $root 'portal.mjs') 2>&1 | Out-File (Join-Path $root 'runtime\portal.log') -Append -Encoding utf8
exit $LASTEXITCODE
