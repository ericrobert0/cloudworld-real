$ErrorActionPreference='Stop'
$source=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk'))
$expected=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk'))
$target='D:\DockerDesktop\disk'
if($source -ne $expected -or $source -notlike '*\Docker\wsl\disk'){throw 'Origem inesperada.'}
if(Get-Process 'com.docker.backend' -ErrorAction SilentlyContinue){throw 'Pare o Docker Desktop primeiro.'}
$item=Get-Item -LiteralPath $source -Force
if($item.LinkType){throw 'A origem ja possui redirecionamento; conferir manualmente.'}
if(Test-Path -LiteralPath $target){throw 'Destino ja existe; nao sobrescrevo discos.'}
$disk=Join-Path $source 'docker_data.vhdx'
if(!(Test-Path -LiteralPath $disk)){throw 'Disco de dados nao encontrado.'}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -LiteralPath $disk -Destination (Join-Path $target 'docker_data.vhdx')
if((Get-FileHash -LiteralPath $disk).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target 'docker_data.vhdx')).Hash){throw 'Copia divergiu; origem preservada.'}
$backup=$source+'.before-vlan'
if(Test-Path -LiteralPath $backup){throw 'Backup anterior ja existe.'}
# Ambos os caminhos foram resolvidos e conferidos dentro da pasta Docker explicitamente identificada.
Rename-Item -LiteralPath $source -NewName 'disk.before-vlan'
New-Item -ItemType Junction -Path $source -Target $target | Select-Object FullName,Target
Write-Output "Disco copiado e verificado no D:. Copia anterior preservada em $backup"
