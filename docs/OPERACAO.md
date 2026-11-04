# Operação e recuperação

## Comandos no D:\VlanWorld

```powershell
node manage.mjs list
node manage.mjs create empresa empresa.localhost 8453
node manage.mjs validate empresa
node manage.mjs up empresa
node manage.mjs status empresa
node manage.mjs smoke empresa
node manage.mjs suspend empresa
node manage.mjs resume empresa
node manage.mjs backup empresa
node manage.mjs restore-test empresa 'D:\VlanWorld\runtime\backups\empresa\PASTA-DO-BACKUP'
```

Use portas com pelo menos quatro números de intervalo; dez facilita a operação. Não reutilize domínios entre clientes. `suspend` para os containers e preserva volumes. `resume` usa as imagens/digests existentes e pode repetir as migrações idempotentes dos inicializadores. Não use `down --volumes` no projeto de um cliente.

## Testes incluídos

`npm test` verifica separação de projetos/segredos, redes dos bancos, ausência de portas de banco, dependências e entradas perigosas. Os testes do painel verificam autenticação, bloqueio de DNS rebinding, CSRF e JavaScript da página. `validate` usa o parser real do Docker Compose, sem precisar do daemon.

`smoke` testa `SELECT 1` nos seis PostgreSQL e no MariaDB, resposta HTTPS 2xx/3xx das seis aplicações e estado de todos os containers esperados. Inicializadores devem terminar com exit code zero. Containers opcionais de VPN são excluídos desse teste. O resultado fica em `smoke-report.json`.

Isso não comprova SSO, envio WhatsApp, postagem em redes sociais, processamento das filas, upload/download nem recuperação funcional completa. Depois da partida, executar e registrar:

1. Entrar e sair de cada aplicação; alterar senhas iniciais; configurar SMTP e recuperação.
2. ERPNext: criar empresa de teste, item e lançamento; verificar worker e scheduler.
3. Nextcloud: enviar/baixar arquivo e verificar cron; conferir hash do arquivo recuperado.
4. n8n: executar workflow simples com Webhook + Respond to Webhook e confirmar registro no banco.
5. Postiz: agendar publicação de teste com conta de homologação e confirmar execução no Temporal.
6. Atendimento: uma mensagem recebida e uma respondida, sem duplicidade, com mídia e reconexão.
7. SSO: testar usuário permitido/negado e logout; verificar que callbacks e APIs continuam acessíveis.
8. Isolamento: de uma aplicação do cliente A, a rede Docker não deve resolver nem alcançar containers do cliente B. Testar com duas instâncias reais antes de produção.
9. Backup, `restore-test`, recuperação em ambiente de homologação e novo login/upload/workflow. Medir RTO/RPO.

## Backup

O backup faz uma parada temporária dos serviços que escrevem dados, mantendo bancos ativos. Exporta SQL completo, compacta os volumes de aplicação/Redis/certificados, copia configurações e segredos e grava manifesto SHA256 somente ao concluir. Depois tenta retomar os serviços que estavam ativos. Interrompe atendimento durante a janela; agende conforme a operação. Um backup sem `manifest.json` é incompleto.

Os arquivos são gravados com streams binários do Node, evitando corrupção de arquivos tar por redirecionamento de PowerShell. Volumes de bancos não são copiados a quente; a recuperação usa os dumps SQL. `restore-test` valida hashes, importa SQL em um projeto temporário independente, consulta os bancos e extrai os arquivos em volumes temporários; remove somente os recursos desse projeto de teste. Não substitui o teste funcional das aplicações restauradas.

Os backups locais contêm credenciais, cookies/sessões, dados pessoais e chaves de criptografia em texto/arquivos recuperáveis. A pasta tem ACL restrita, mas isso não é criptografia. Antes de uso real: configurar repositório externo criptografado (por exemplo Restic), retenção, alertas e teste periódico. Não foi criado agendamento silencioso nem cópia para nuvem sem destino informado.

Restauração de produção é deliberadamente uma operação de manutenção: suspenda o cliente, preserve os volumes atuais, restaure o backup em um projeto separado, valide funcionalmente e só então faça o corte de domínio. O painel não oferece um botão que sobrescreva dados reais. Não execute os comandos de limpeza do projeto de teste contra o projeto de produção.

## Atualização

A publicação dos fontes no Windows usa `scripts/Apply-Update.ps1`. Uma trava exclusiva impede duas publicações simultâneas. Se a instalação das dependências falhar ou o painel atualizado não responder, o script recupera os fontes anteriores, remove os arquivos acrescentados pela tentativa e reinstala as dependências anteriores. Se a recuperação das dependências também falhar, o script informa a pasta de backup e mantém os serviços parados para reparo. Os dados das empresas ficam fora da lista de fontes publicada.

O ensaio `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-SourceUpdate.ps1` verifica a cópia e a recuperação de arquivos em uma pasta descartável no D:. As chamadas de tarefas agendadas, rede e npm são simuladas nesse ensaio. A pasta do teste é removida ao final.

Versões solicitadas ficam em `images.requested.json`; após download, `compose.json` usa digest e `images.lock.json` registra o conjunto. Não atualize automaticamente `latest`. WAHA/WireGuard ainda usam tags móveis antes da primeira ativação e devem ser fixados por digest quando validados.

O painel e `scripts\Update-Client.ps1` fazem backup, salvam Compose anterior, baixam a versão explícita, fixam digest, atualizam juntos os serviços que usavam a mesma imagem e executam smoke. Exemplo de sintaxe (escolha uma versão real homologada):

```powershell
.\scripts\Update-Client.ps1 -Client empresa -Service n8n -Image 'docker.n8n.io/n8nio/n8n:VERSAO-HOMOLOGADA'
```

ERPNext, Authentik, Chatwoot e Nextcloud têm múltiplos processos: atualize **todos** os serviços da mesma aplicação juntos, incluindo inicializadores e cron. Teste primeiro em clone restaurado. Mudança de major do PostgreSQL/MariaDB exige exportação/importação ou ferramenta própria, nunca apenas trocar a tag mantendo o diretório. Reverter a imagem não reverte migrações; use restauração validada.

O painel não agenda atualizações. A coordenação dos processos está implementada, mas as migrações de cada versão precisam ser homologadas no hardware antes da aplicação em produção.

## Diagnóstico

```powershell
docker info
docker stats --no-stream
docker compose --project-directory .\runtime\tenants\piloto -f .\runtime\tenants\piloto\compose.json ps -a
docker compose --project-directory .\runtime\tenants\piloto -f .\runtime\tenants\piloto\compose.json logs --tail 100
```

Não publique logs sem revisar dados pessoais/segredos. Um `.operation.lock` impede duas operações CLI no mesmo cliente. Após uma queda, remova-o somente depois de conferir que nenhuma operação daquele cliente continua em execução. O painel mantém seu registro em memória, perdido ao reiniciar; logs do processo ficam em `runtime\panel.*.log`.
