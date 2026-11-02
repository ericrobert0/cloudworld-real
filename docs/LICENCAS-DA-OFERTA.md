# Licenças e escopo da oferta

Levantamento inicial em 02/11/2026, usando fontes oficiais. Não equivale a autorização comercial de todos os componentes ou da arquitetura inteira. Preservar avisos dos autores e registrar as versões/imagens efetivamente entregues.

| Componente | Evidência consultada | Decisão para a oferta |
|---|---|---|
| Chatwoot 4.19.1 | [LICENSE da versão](https://github.com/chatwoot/chatwoot/blob/v4.19.1/LICENSE): MIT fora das partes com restrições próprias; enterprise e terceiros separados | Oferecer somente funcionalidades cobertas pela edição utilizada; não prometer recursos enterprise sem licença |
| ERPNext 16.53.0 | [license.txt da versão](https://github.com/frappe/erpnext/blob/v16.53.0/license.txt): GPLv3 | Preservar avisos e atender obrigações de distribuição/modificações quando aplicáveis |
| Postiz 2.25.3 | [LICENSE da versão](https://github.com/gitroomhq/postiz-app/blob/v2.25.3/LICENSE): AGPLv3 | Avaliar as obrigações de disponibilização do código correspondente, especialmente se houver modificações acessadas pela rede |
| n8n 2.45.7 | [LICENSE.md da versão](https://github.com/n8n-io/n8n/blob/n8n@2.45.7/LICENSE.md): Sustainable Use License, com partes enterprise separadas | Manter criação e edição de fluxos com o operador; avaliar o uso efetivo conforme a orientação abaixo |
| WAHA Core | [LICENSE do ramo Core](https://github.com/devlikeapro/waha/blob/core/LICENSE): Apache-2.0 | Confirmar a versão/edição entregue. A licença do software não autoriza o uso de WhatsApp nem elimina exigências e riscos do provedor |

O [FAQ oficial do n8n, atualizado em outubro de 2026](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) diferencia automações criadas e operadas pela própria organização, entregando resultados a clientes, de hospedagem como serviço ou criação/configuração de fluxos por clientes externos. Essa configuração externa pode ocorrer também por interface própria, API, MCP ou agente; ocultar o editor não resolve esse caso. O FAQ informa que o suporte não confirma por esse canal a permissão de um caso específico.

Assim, o modelo inicial do CloudWorld deve entregar automações fixas e administradas pelo operador, sem disponibilizar construtor ou edição de fluxos aos clientes. Isso orienta o desenho da oferta; não constitui aprovação automática de cada funcionalidade ou contrato. Qualquer ampliação exige nova revisão antes da venda. Nenhum pedido ou mensagem foi enviado aos fornecedores.

Antes da primeira entrega, completar o inventário das imagens e dependências: Authentik, Nextcloud, PostgreSQL/pgvector, MariaDB, Redis, Temporal, Caddy, Bootstrap, pacotes Node e componentes transitivos. Conferir licenças do artefato exato e eventuais módulos enterprise, avisos, mudanças e obrigações de redistribuição. Os itens ainda não conferidos permanecem pendentes; não classificá-los como aprovados por serem instaláveis gratuitamente.

Os conectores de redes sociais e WhatsApp também dependem dos termos, permissões e contas do titular. A marca CloudWorld identifica a plataforma e o serviço, preservando a identificação e os direitos das ferramentas integradas.
