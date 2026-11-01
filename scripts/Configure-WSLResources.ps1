$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$config=Join-Path $env:USERPROFILE '.wslconfig'
if(Test-Path -LiteralPath $config){throw 'Ja existe .wslconfig. Preserve suas configuracoes e ajuste manualmente memory/processors/swap/swapFile conforme docs/ARQUITETURA.md.'}
$swapPath=(Join-Path $root 'wsl-swap.vhdx').Replace('\','\\')
$content="[wsl2]`nmemory=10GB`nprocessors=6`nswap=6GB`nswapFile=$swapPath`n`n[experimental]`nautoMemoryReclaim=gradual`n"
[IO.File]::WriteAllText($config,$content,[Text.UTF8Encoding]::new($false))
Write-Output 'Recursos WSL preparados: 10 GB RAM, 6 processadores, swap 6 GB no D:. Aplicam-se na proxima inicializacao do WSL.'
