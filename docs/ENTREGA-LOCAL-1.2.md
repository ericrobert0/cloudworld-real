# CloudWorld 1.2 — entrega local

O painel do administrador fica em http://127.0.0.1:8099/ e o portal do cliente em http://127.0.0.1:8100/. Os endereços funcionam neste computador; ainda não constituem uma publicação na internet.

## O que foi acrescentado

- O botão **Entrar com login central** no portal usa o Authentik da empresa informada. A conta inicial `responsavel` do piloto foi vinculada; a senha existente foi preservada.
- Em **Clientes e operação**, as contas indicam se possuem vínculo central. A opção **Exigir login central nesta empresa** bloqueia o acesso por senha local, inclusive sessões locais existentes. Teste uma conta vinculada antes de ativar. Essa opção permanece desligada no piloto.
- Contas suspensas no portal perdem acesso imediatamente. Sessões centrais consultam o Authentik, com cache de até 30 segundos; falhas nessa consulta bloqueiam o acesso. A senha local permanece independente quando o modo central obrigatório está desligado.
- O portal informa quando o ambiente está em manutenção.

As ferramentas podem continuar pedindo seus próprios logins. O botão não configura automaticamente SSO completo em Chatwoot, ERPNext, Nextcloud ou Postiz. Sair do portal também não encerra todas as sessões nas ferramentas.

## Evidências

Foram aprovados 31 testes automatizados, 45 verificações do piloto e seis verificações HTTP do portal. O login central foi exercitado no Authentik real, incluindo rejeição de PKCE incorreto e código repetido.

O laboratório criou outra empresa com as mesmas imagens, bancos e volumes independentes. As 18 verificações revisadas cobrem os sete bancos, as sete APIs, login entre empresas, arquivos, redes e sessões do portal. A primeira tentativa de seis verificações PostgreSQL tinha um erro de método: usava loopback com `trust`. A repetição por TCP passou e os dois registros foram preservados.

A comparação simultânea ocorreu por família de aplicações para respeitar a memória disponível. A empresa temporária foi desligada, sua configuração arquivada e os volumes preservados. Os 28 serviços originais do piloto foram retomados. Isso não certifica capacidade para dois clientes completos simultâneos.

Relatórios sem credenciais estão na pasta `reports` da cópia de trabalho; os registros originais ficam em `D:\VlanWorld\runtime\isolation-lab` e `D:\VlanWorld\runtime\reports`.

## Continuidade

Ainda há trabalho local: validar a abertura e o uso das aplicações após uma restauração completa, concluir permissões e MFA compatíveis, medir estabilidade/carga e preparar o roteiro de entrada de clientes. Para a oferta comercial também faltam servidor definitivo, domínio/HTTPS público, backup externo, destino de alertas e definição dos canais e condições comerciais. Consulte `PREPARACAO-COMERCIAL.md`.
