# Verificação em 31/10/2026

> Estado mais recente: o Postiz foi corrigido e retomado como ferramenta principal; Mixpost permanece como alternativa. Consulte [POSTIZ-CORRIGIDO.md](POSTIZ-CORRIGIDO.md) para os resultados atuais. Os relatos anteriores abaixo sao historicos.


> Atualização: o componente de mídias atual é Mixpost Lite, substituindo Postiz e Temporal. Consulte [MIXPOST.md](MIXPOST.md) para a implantação, testes e limitações atuais. Referências ao Postiz abaixo registram a arquitetura anterior e não configuram o Mixpost.


Estado final: `HypervisorPresent=True`, Docker Engine 29.9.2 Linux funcional com aproximadamente 10 GB de RAM. Disco em `D:\DockerDesktop\disk`, com hash conferido, junction e backup anterior preservado no C:. Todas as imagens foram instaladas. Piloto com 28 containers ativos e tres inicializadores concluidos com exit zero; WireGuard permanece opcional/inativo.

- Smoke final depois do backup: 44 checks aprovados, zero falhas (SQL de sete bancos, seis rotas HTTPS e estados).
- WAHA API: sem chave 401, com chave correta 200; sem parear telefone/enviar mensagens.
- Backup: `runtime/backups/piloto/2026-10-31T12-29-20.171Z`.
- Restauracao: aprovada em `runtime/restore-tests/vw-restore-1793450210766/result.json`; SHA256, importacao SQL e extracao de volumes. No MariaDB temporario, as 1.062 tabelas igualaram a contagem de origem. Todos os containers/volumes do teste foram removidos.
- Testes locais: tres aprovados novamente. Relatorios `reports/smoke-piloto.json`, `reports/restore-piloto.json` e `reports/tests-runtime.txt` na copia de trabalho; logs detalhados e resultados no D:.
- Ajuste aplicado: healthchecks com carencia de 600 segundos e espera de deploy de 1.200 segundos para a primeira migracao no hardware local. Nao reduz os criterios de saude.
- Certificado publico da CA local exportado para `runtime/local-ca.crt`; nao foi instalado no armazenamento de confianca do Windows.

As verificacoes abaixo registram o diagnostico historico anterior a instalacao; nao representam o estado atual do motor. SSO, VPN, pareamento WhatsApp, publicacao externa e testes funcionais de negocio permanecem pendentes.

| Verificação | Resultado |
|---|---|
| Windows | Windows 10 Home 10.0.19045 |
| CPU | Intel i3-10100, 4 cores / 8 threads |
| RAM | 16 GB; aproximadamente 7,7 GB livres antes do Docker |
| D: | Aproximadamente 723 GiB livres |
| Docker CLI / Compose | 29.9.2 / v5.6.1 |
| WSL | Ubuntu instalado, WSL2, parado |
| Node | v24.19.0, D:\download\node.exe |
| Git | D:\download\Git\cmd\git.exe |
| Python | Apenas alias WindowsApps identificado; não exigido pelo projeto |
| Docker Engine | Falhou: HCS_E_HYPERV_NOT_INSTALLED / no virtualization available |
| Firmware | VirtualizationFirmwareEnabled=True reportado pelo Windows |
| Correção administrativa | WSL e VirtualMachinePlatform Enabled; bcdedit /set hypervisorlaunchtype auto concluído |
| Hypervisor ativo nesta sessão | False; requer reinicialização |
| Interface Docker | Captura falhou com window capture timed out; disco não foi movido pela interface |
| Instalação operacional | D:\VlanWorld; ACL restrita ao usuário/SYSTEM/administradores |
| Recursos WSL preparados | 10 GB RAM, 6 processadores, swap 6 GB no D:, aguardando próxima inicialização |
| Compose piloto | Configuração de 32 serviços validada pelo parser Docker Compose; WireGuard é opcional |
| Testes automatizados | 2/2 passaram: arquitetura/isolamento e autenticação/CSRF/Host do painel |
| Scripts PowerShell | 7 scripts passaram no parser do PowerShell |
| Imagens | 15/15 manifestos existem e incluem Linux/amd64; relatório image-manifests.json |
| Painel em execução | HTTP 401 sem autenticação; HTTP 200 autenticado; 1 cliente piloto; Docker indisponível identificado corretamente |

Testes estáticos e do painel são registrados em `reports/`. Não interpretar testes estáticos como homologação dos containers. A validação final deverá acrescentar smoke-report, resultados de restauração e evidências dos testes funcionais do runbook depois que o Docker funcionar.

## Padronização do serviço

- Cadastro uniforme `microempresa-padrao` instalado no D:; piloto adotado sem regenerar credenciais.
- Gateway central preparado para empresas com domínio real, mantendo redes de banco separadas.
- Três testes automatizados passaram, incluindo dois clientes com versões/limites iguais e validação Compose dos ambientes e gateway.
- Tarefa Windows `VlanWorld-Control` registrada para o próximo login; painel reiniciado na versão nova.
- Docker consultado novamente: API retorna erro 500 e `HypervisorPresent=False`. Nenhum teste de containers foi marcado como aprovado.
