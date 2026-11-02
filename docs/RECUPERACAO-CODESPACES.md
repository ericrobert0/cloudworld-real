# Recuperação e isolamento no Codespaces

O comando `node scripts/Test-CodespacesRecovery.mjs` usa o último backup completo da empresa `apresentacao`. `--fresh-backup` cria antes um backup consistente, pausando e retomando as aplicações. A parada pode levar minutos; não executar durante uma apresentação.

O ensaio executado em 02/11/2026 aprovou **48 verificações**: ida e volta AES-GCM, sete bancos importados e consultados, credenciais próprias e cruzadas, redes internas distintas e extração de 18 arquivos de volumes. Os recursos Docker temporários foram removidos pelo próprio ensaio. Os volumes originais não foram usados como destino de restauração.

## Como limita o consumo

- Usa somente imagens já instaladas e fixadas por digest, sem baixar novas imagens.
- Mantém no máximo dois bancos temporários por etapa, com 512 MiB e meia CPU por container. A empresa original continua separada e ativa durante a restauração; apenas a criação do backup pausa suas aplicações.
- Confere espaço no workspace e no armazenamento Docker, preservando margem. Não apaga dados originais para liberar espaço.
- Extrai um volume de cada vez, com rede desativada, sistema raiz somente para leitura e recursos limitados. Remove somente o volume temporário com o identificador desta rodada.

Na inicialização de PostgreSQL, a sonda agora aguarda a porta TCP. O servidor temporário de preparação usa socket local e não deve autorizar a importação antes de o servidor definitivo estar pronto. Os geradores e planos de recuperação também receberam esse ajuste. Bancos ativos existentes não foram recriados apenas para alterar a sonda.

A parada de escritores durante novos backups usa até quatro operações em paralelo; inicializações continuam com concorrência limitada. O backup desta validação foi criado antes desse ajuste, com parada sequencial mais demorada.

## Segurança da importação

O importador rejeita empresa/data divergentes do manifesto, arquivos duplicados, arquivos extras ou ausentes, chave incompatível e conteúdo corrompido. Todos os arquivos precisam ser autenticados e conferidos antes de a pasta de destino ser disponibilizada. O destino existente permanece protegido contra sobrescrita.

Os relatórios ficam em `runtime/restore-tests/vw-restore-ID/result.json`. Dados recuperados, SQL, configurações e diagnósticos privados continuam protegidos em runtime. As tentativas que falharam permanecem registradas; a aprovação corresponde à rodada completa, não à soma de etapas de tentativas incompletas.

## Limites

Este ensaio verifica bancos, dados representativos, arquivos, credenciais e redes de cópias temporárias. Não inicia todas as interfaces recuperadas nem homologa duas empresas completas em produção. O item de recuperação funcional das aplicações permanece pendente para o backup remoto atual.

Os backups originais, as cópias criptografadas e os arquivos recuperados desta rodada ainda estão no Codespaces. A criptografia não transforma armazenamento local em cópia externa.

## Pacote para guardar fora do servidor

`node scripts/Prepare-OffsiteExport.mjs` reúne os arquivos criptografados e seu índice em um TAR, calcula SHA256 e grava `runtime/offsite-export/export.json`. A chave deve ser guardada separadamente, em local privado. A transferência pelo navegador integrado não foi concluída/verificada nesta rodada; o pacote permanece privado no Codespaces.

Para concluir pelo navegador comum, abrir o editor privado, localizar `runtime/offsite-export`, clicar com o botão direito no TAR e usar **Baixar**. Guardar também os metadados de exportação e a chave de recuperação, em locais separados. Nunca publicar esses arquivos.

No computador que recebeu a cópia, conferir:

```powershell
Get-FileHash -LiteralPath 'CAMINHO-DO-PACOTE.tar' -Algorithm SHA256
```

O resultado precisa coincidir com `sha256` de `export.json`, e o tamanho com `bytes`. Isso confirma o transporte. A prova completa de recuperação fora do servidor exige também importar a cópia no destino e testar os dados/aplicações. Ainda não há replicação externa automática configurada.
