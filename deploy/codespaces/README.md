# Codespaces — candidato para apresentação real sem cartão

Estado: não implantado. Nenhum Codespace, repositório GitHub ou encaminhamento público de porta foi criado. É necessário login na conta pessoal do proprietário para conferir disponibilidade e quotas antes de criar recursos.

## Por que avaliar

Contas pessoais GitHub Free incluem 120 core-hours e 15 GB-month de armazenamento por ciclo. Os multiplicadores de processamento são 2 para uma máquina de 2 cores e 4 para uma de 4 cores: aproximadamente 60 ou 30 horas ativas, respectivamente, antes dos demais usos. Sem forma de pagamento válida, a documentação informa bloqueio ao acabar a cota. O armazenamento também consome a franquia enquanto o Codespace existe, mesmo parado.

O ambiente remoto pode executar Docker e encaminhar portas HTTPS do projeto. Essa é uma opção para avaliar as aplicações reais em desenvolvimento/apresentação, não uma oferta de produção 24/7. Para por inatividade e está sujeito a exclusão por retenção; backups externos continuam necessários.

## Plano após o login

1. Conferir cota e máquinas disponíveis na conta, sem adicionar cartão, ativar plano pago ou comprar recursos.
2. Criar um repositório privado apenas com o pacote sanitizado de fontes. Não publicar código ou arquivos privados em repositório público.
3. Abrir um único Codespace dentro da franquia e executar `node scripts/Check-Codespaces.mjs` antes de baixar imagens. Ele consulta recursos e Docker, sem instalar nada.
4. Medir o tamanho das imagens e volumes e confrontar o disco disponível e a franquia. Não assumir que todos os serviços cabem.
5. Só depois adaptar URLs, callback da API, cookie/origem do portal e port forwarding ao ambiente remoto. Cada ferramenta precisa de seu próprio endereço HTTPS. Não transportar senhas nem os dados do piloto local; criar contas e dados de apresentação novos.
6. Manter administração, Docker, bancos e WAHA privados. Revisar autenticação antes de publicar portas de aplicações. O encaminhamento público remove a barreira de acesso do GitHub, não substitui o login de cada aplicação.
7. Validar as aplicações e as integrações no ambiente real remoto. Encerrar o Codespace fora das apresentações, acompanhar armazenamento e guardar cópia recuperável.

A checagem de Codespaces não substitui a política de armazenamento de Linux. A adaptação para esse runtime não está implementada nem homologada nesta entrega. Primeiro precisamos observar a máquina realmente disponível na conta.

## Fontes

- https://docs.github.com/en/billing/concepts/product-billing/github-codespaces
- https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
- https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle
