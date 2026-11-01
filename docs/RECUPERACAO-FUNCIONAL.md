# Ensaio de recuperação funcional

O teste `scripts/test-functional-recovery.mjs` usa o último backup completo da empresa local `piloto`. Antes do ensaio, executar `node scripts/Run-Backups.mjs --now piloto` e aguardar a rotina terminar. O backup deve conter `portal-oidc.private.json`; o ensaio de senha local exige que o modo central obrigatório esteja desligado.

O roteiro é específico ao piloto com os contatos, clientes e pastas fictícios já cadastrados pelos testes de integração. Um ambiente vazio requer outros critérios de dados; ausência desses exemplos não prova corrupção do backup.

## O que o ensaio faz

1. Verifica os hashes do manifesto e prepara um projeto Docker de nome único.
2. Valida imagens fixadas por digest e recusa montagens ou privilégios inesperados.
3. Obtém uma trava de manutenção e pausa os serviços ativos do piloto para liberar memória. **O piloto fica indisponível durante o ensaio.**
4. Extrai os arquivos em volumes novos e importa os sete bancos. Não reutiliza volumes ou redes da empresa original.
5. Inicia as aplicações restauradas. As redes são internas, as portas publicadas são somente de loopback e os atalhos da API do host são direcionados ao próprio container. O teste confirma o bloqueio de saída para internet e para a API original.
6. Verifica as sete APIs, contatos recuperados no Chatwoot, clientes no ERP, listagem de arquivos no Nextcloud, presença do workflow no banco do n8n e autenticação no portal com o hash recuperado. TLS utiliza a CA recuperada do volume do gateway, sem desativar validação.
7. Encerra o projeto de teste e tenta retomar exatamente os serviços que estavam ativos no piloto. Somente remove a trava criada pelo próprio processo. Os volumes de teste ficam preservados para inspeção; não há exclusão automática.

Os workflows recuperados do n8n são desativados apenas na cópia, o cron do Postiz fica desligado e os workers de saída/agendadores não são iniciados. Não há envio de WhatsApp, email ou publicação social. O backup original permanece intacto.

O Postiz usa o Prisma 6.5 já incluído na imagem para preparar o banco. O comando padrão da imagem usava `pnpm dlx`, que tentava consultar o registro npm durante a inicialização e impedia a recuperação sem internet. A versão local do CLI e do cliente foram conferidas na própria imagem.

No Docker Desktop, as portas publicadas das redes internas não ficaram acessíveis pelo Windows durante o ensaio. As APIs e a listagem de dados são verificadas por um processo dentro da rede privada, passando pelo gateway HTTPS com validação da CA recuperada. Isso não é uma homologação de acesso público pelo navegador. O teste de login do portal continua usando um servidor HTTP em loopback no Windows.

Para repetir somente as verificações após uma tentativa encerrada com todos os sete bancos importados, é possível usar `node scripts/test-functional-recovery.mjs --reuse CAMINHO-DA-RODADA`. O script exige que o piloto tenha sido retomado e a cópia encerrada, preserva o resultado anterior em `attempt-ID.json`, confere o mesmo backup e reutiliza apenas os registros de importação já aprovados. Os testes de rede, aplicações, dados e portal são executados novamente.

## Evidência e limites

Cada rodada grava `runtime/functional-recovery/vw-recovery-ID/result.json`, sem credenciais. A saída detalhada de comandos com falha permanece em `diagnostic.private.log`, dentro da instalação protegida. A pasta contém também uma configuração recuperada com segredos e deve permanecer privada; não enviar nem publicar o diretório completo.

Em **Clientes e operação**, o item “Aplicações e dados do último backup recuperados” só é aprovado quando a rodada corresponde ao último backup dessa empresa, passa nas verificações, encerra a cópia e retoma o piloto. Um backup novo exige novo ensaio para aprovar esse item.

Este é um ensaio local de recuperação dos dados e aplicações, não uma certificação de continuidade, carga, prazo de recuperação, canais externos ou outro servidor. O login local do portal é exercitado; a configuração OIDC é preservada no backup, mas uma mudança de endereço exige revisar issuer/callback e testar novamente o login central. Os workers e os fluxos externos devem ser homologados no servidor definitivo antes da oferta comercial.

Se houver interrupção abrupta do processo, conferir o relatório, os containers e o processo ativo antes de atuar na trava. Retomar o piloto com os serviços registrados em `originalServices` e encerrar somente o projeto registrado em `project`. Nunca usar remoção de volumes do piloto como procedimento de recuperação.
