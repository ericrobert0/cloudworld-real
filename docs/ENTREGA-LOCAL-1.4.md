# CloudWorld 1.4 — recuperação e operação

## Resultado desta etapa

- Foi criado um backup atualizado do piloto, com os sete bancos, volumes e configuração de login central.
- A restauração ocorreu em volumes e redes exclusivos, preservando o ambiente original e o backup.
- Foram aprovadas 22 verificações de recuperação: SQL dos sete bancos, workflow do n8n, isolamento de saída, sete aplicações, vínculo central no Authentik, contatos Chatwoot, clientes ERP, arquivos Nextcloud e login local do portal com o hash recuperado.
- A cópia foi encerrada e o piloto retomado. Os 28 serviços originais estão ativos.
- Passaram 36 testes automatizados, 45 verificações do piloto após a atualização, seis verificações HTTP do portal e o fluxo real de login central no piloto original.

## Correções encontradas no ensaio

O Postiz tentava consultar o registro npm ao iniciar, apesar de a imagem já incluir o Prisma 6.5 necessário. A inicialização agora usa o CLI local e inicia explicitamente backend, frontend e orchestrator. A correção foi aplicada ao piloto e ao gerador de novos clientes; o Postiz original iniciou novamente e autenticou pela API.

O ensaio também ganhou tratamento do fechamento antecipado do stdin quando o tar termina com sucesso, sonda MariaDB compatível com contas recuperadas e limites de tempo para comandos. Tentativas anteriores permanecem registradas; nenhuma falha foi convertida silenciosamente em aprovação. Os bancos que já tinham sido importados com sucesso foram reutilizados para repetir as verificações das aplicações, preservando o relatório anterior.

## Onde consultar

Em **Clientes e operação**, o painel agora mostra “Aplicações e dados do último backup recuperados”. O item foi conferido como aprovado para o backup testado. Um backup novo exige novo ensaio para aprovar esse mesmo item.

- `RECUPERACAO-FUNCIONAL.md`: execução, evidências, isolamento, retomada e limites.
- `ENTRADA-DE-CLIENTES.md`: roteiro de preparação, treinamento e entrega por empresa.
- `reports/functional-recovery.json`: resultado final sem credenciais na cópia de trabalho.
- `D:\VlanWorld\runtime\functional-recovery\vw-recovery-1793495292673`: evidência original privada. Não compartilhar o diretório inteiro, pois contém configurações recuperadas com segredos.

## Limites preservados

As aplicações restauradas foram verificadas pela rede privada do Docker, através do gateway HTTPS com validação da CA recuperada. As portas dessa rede interna não ficaram acessíveis pelo Windows; não foi certificado acesso público ou pelo navegador ao ambiente temporário. O portal recuperado foi autenticado em loopback no Windows.

O vínculo do Authentik foi recuperado e o login central do piloto original foi retestado. O fluxo OIDC completo na cópia, com mudança de endereço/callback, não foi homologado. Workers de saída e canais reais não foram exercitados; os workflows da cópia ficaram desativados para evitar efeitos externos.

Ainda faltam carga e estabilidade, permissões/MFA por ferramenta e a estrutura externa de produção: servidor, domínio/HTTPS público, backup fora do computador, alertas e canais dos clientes. O ensaio não define prazo garantido de recuperação nem capacidade comercial.
