# Entrega 1.6.6

O fluxo local Chatwoot → ERPNext + n8n foi preparado e validado em aplicacoes reais. O workflow n8n fornecido apenas confirma o recebimento; nao executa efeitos externos. Preparacao e ensaio agora tem comandos proprios, com selecao de conectores, preservacao de contas existentes e verificacao do workflow publicado.

## Validacao

- 95 testes de codigo aprovados, um teste especifico do Docker ignorado no Podman e nenhuma falha.
- Dez verificacoes reais do fluxo aprovadas, incluindo criacao de contato, entrega, reutilizacao de cliente ERP, reenvio idempotente e rejeicao de chave incorreta.
- Chave temporaria do ensaio revogada e sua rejeicao confirmada.
- Preparo repetido com os mesmos hashes dos arquivos de configuracao e credenciais; nenhuma rotacao ou substituicao.
- Segredo ilegivel da conta tecnica ERP diagnosticado e recuperado com o valor anterior preservado; autenticacao voltou a responder HTTP 200.

A conta inicial do n8n foi preparada no piloto e sua senha permanece em arquivo privado. As rotas e a captura estao ativas para novos contatos. Contatos identificados de teste foram preservados para auditoria. Nao houve pareamento WhatsApp, mensagens externas ou publicacoes sociais.

Consulte FLUXO-DE-CONTATOS.md para os comandos, efeitos do preparo, limites e recuperacao.
