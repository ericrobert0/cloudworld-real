# Demonstração pública da CloudWorld

Endereço: https://cloudworld-demo.decentzebra13.chatgpt.site

A apresentação pública contém um painel administrativo e um portal do cliente com visual azul. O laboratório permite criar empresas fictícias, cadastrar contatos, gerar tarefas automaticamente, concluir/reabrir tarefas, salvar rascunhos e exportar os dados de uma empresa em JSON ou seu resumo em texto.

Os dois painéis compartilham o armazenamento local do mesmo navegador e da mesma origem. Os dados persistem ao recarregar e não são enviados a servidor. Outros navegadores não recebem essas alterações. Isso não é autenticação nem isolamento multiusuário; todos os dados deste laboratório devem ser fictícios. Limpar os dados do site no navegador apaga os exemplos; não há importação do arquivo exportado nesta versão.

A suspensão administrativa bloqueia novas gravações da empresa no laboratório, sem alterar containers reais. O histórico reúne as ações dos dois painéis. A exportação é gerada pelo navegador e não é um backup das aplicações reais.

## Roteiro de apresentação

1. No administrativo, abra **Nova empresa** e cadastre um nome fictício.
2. Em **Empresas**, abra o portal da empresa cadastrada.
3. Em **Atendimento**, cadastre um contato e uma solicitação fictícios.
4. Em **Tarefas**, conclua o acompanhamento criado automaticamente.
5. Em **Conteúdo**, salve um rascunho.
6. Em **Arquivos**, baixe o JSON ou o resumo.
7. Volte ao administrativo para ver **Operações**, suspender e retomar a empresa de exemplo.

## Limites

O laboratório não executa Chatwoot, WAHA, ERPNext, Postiz, n8n ou Nextcloud; não envia WhatsApp, não publica em redes sociais, não processa pagamentos e não possui um backend compartilhado. A implantação local real permanece separada. Para mostrar essas ferramentas reais funcionando remotamente, ainda é necessário um servidor com recursos e acesso configurados.

## Fonte e validação

- Fontes: `presentation/admin.*`, `presentation/client.*`, `presentation/demo-store.js` e `presentation/blue.css`.
- Gerar publicação: `node scripts/Build-HostedDemo.mjs`.
- Verificação do estado e da exportação: `node scripts/check-demo-store.mjs`.
- Conferência no navegador: cadastro de empresa e contato, persistência após recarregar, tarefa, rascunho, seleção de outra empresa, histórico entre painéis e bloqueio de cadastro quando suspensa.
- O servidor temporário de prévia é encerrado após a verificação; nenhum container adicional precisa ser iniciado para o laboratório.
