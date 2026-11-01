param([Parameter(Mandatory=$true)][string]$DiskImageDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$resolved=(Resolve-Path -LiteralPath $DiskImageDirectory).Path
if($resolved -notmatch '^D:\\') {throw 'O disco virtual deve estar no D:.'}
$disks=@(Get-ChildItem -LiteralPath $resolved -Recurse -File -Filter *.vhdx)
if(!$disks.Count){throw 'Nenhum disco VHDX encontrado. Configure Docker Desktop > Settings > Resources > Advanced > Disk image location e aplique primeiro.'}
$settings=Get-Content "$env:APPDATA\Docker\settings-store.json" -Raw | ConvertFrom-Json
$matches=@($settings.PSObject.Properties | Where-Object { $_.Value -is [string] -and $_.Value.TrimEnd('\') -eq $resolved.TrimEnd('\') })
$defaultDisk=Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk'
$diskLink=Get-Item -LiteralPath $defaultDisk -Force -ErrorAction SilentlyContinue
$junctionMatches=$diskLink -and $diskLink.LinkType -eq 'Junction' -and @($diskLink.Target | Where-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') -eq $resolved.TrimEnd('\') }).Count -gt 0
if(!$matches.Count -and !$junctionMatches){throw 'O destino nao corresponde a configuracao Docker nem a junction efetiva do disco de dados.'}
& docker info --format '{{.OSType}}'
if($LASTEXITCODE -ne 0){throw 'Docker ainda nao esta funcionando.'}
@{directory=$resolved;disks=@($disks.FullName);checkedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $root 'runtime\docker-storage-confirmed.json') -Encoding utf8
Write-Output 'Armazenamento no D: confirmado. O download de imagens esta liberado.'
