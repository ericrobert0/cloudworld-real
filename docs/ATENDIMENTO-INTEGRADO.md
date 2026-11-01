# Atendimento integrado — operação real

Disponível no painel administrativo real, em http://127.0.0.1:8099/#contacts, após login do operador. Esta área não faz parte do site público de apresentação.

1. Selecione a empresa. O painel consulta a primeira página de contatos pela API autenticada do Chatwoot.
2. Informe nome e, opcionalmente, email. Ao cadastrar, o registro é criado na instância real do Chatwoot daquela empresa. Nenhuma mensagem WhatsApp é enviada.
3. Se a captura de contatos estiver ativa, o painel consulta a origem antes e depois do cadastro. Os fluxos configurados recebem o evento pela fila real da CloudWorld.
4. O acompanhamento consulta o evento relacionado ao ID exato desse contato. Exibe pendência, entrega, ausência de fluxo ou falha conforme a fila. Não apresenta sucesso antes da resposta do destino.
5. O acompanhamento automático dura até aproximadamente 45 segundos enquanto a área e a empresa continuam selecionadas. Use **Atualizar entrega** depois desse prazo. A fila do servidor continua independente da página.

As configurações existentes de conectores e fluxos não são ativadas ou substituídas por esse formulário. Com captura desativada, o contato permanece apenas no Chatwoot. Sem destino ativo, não há entrega a ERP/n8n.

Se houver erro de rede depois de enviar o cadastro, confira o Chatwoot antes de repetir: a operação pode ter sido aceita. O painel evita envios simultâneos e fornece um identificador de requisição; isso não garante processamento exatamente uma vez em falhas entre redes ou navegadores.

## API de acompanhamento

`GET /api/v1/tenants/{empresa}/contacts/{id-numerico}/delivery` é exclusivo do operador. Retorna o estado da captura e o resumo do evento desse contato, sem devolver o payload com dados pessoais ou credenciais. IDs de outras empresas não consultam a fila da empresa original. As permissões e os controles de origem das operações existentes continuam em vigor.

## Validação da versão 1.6.2

- 49 testes de unidade e HTTP passaram, incluindo autorização, consulta por empresa e omissão do email no resumo do evento.
- Na instalação real, as 18 verificações de integração passaram novamente: criação no Chatwoot, evento do ID exato consultado pela nova rota, entrega ao ERPNext e n8n, idempotência do ERP e rejeição de chave incorreta.
- A atualização reiniciou somente o processo do painel, sem reiniciar containers.
- A interface foi validada quanto a sintaxe e elementos no HTML servido. A abertura automatizada no navegador integrado encontrou uma limitação ao responder ao desafio Basic Auth; o fluxo visual completo deve ser conferido no navegador usual após o login do operador.

## Hospedagem

O usuário confirmou custo zero, ausência de cartão e necessidade de funcionar com o computador desligado. AWS/Google com requisitos de pagamento e o computador local como servidor não atendem a essas condições atualmente. Não foi criado nenhum recurso nesses provedores.

GitHub Codespaces é apenas uma alternativa em avaliação para apresentações reais, não uma hospedagem comercial homologada: conta pessoal Free inclui 120 core-hours e 15 GB-month de armazenamento. Isso corresponde a até 60 horas em máquina de 2 núcleos ou 30 horas em 4 núcleos, antes de descontar outros usos. Sem forma de pagamento, o uso é bloqueado ao esgotar a cota. A quantidade de armazenamento deste conjunto de aplicações também precisa ser medida. O ambiente para por inatividade e pode ser excluído pela política de retenção. Não há garantia de que caiba na conta, quota ou máquina ainda não disponíveis.

Fontes oficiais:

- https://docs.github.com/en/billing/concepts/product-billing/github-codespaces
- https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
- https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle
