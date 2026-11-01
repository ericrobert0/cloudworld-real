# CloudWorld: demonstração na Oracle Always Free

Estado: preparação local. Nenhuma conta, instância ou recurso externo foi criado. Não há implantação na nuvem concluída.

## Primeiro passo: cadastro do proprietário

Use https://www.oracle.com/cloud/free/ e o cadastro Free Tier. Dados pessoais, cartão, senha, verificação de identidade e aceite dos termos devem ser preenchidos pelo proprietário diretamente na Oracle. A Oracle informa que pode haver autorização temporária no cartão para validação de identidade. Não compartilhar cartão, senha nem chave privada no chat.

Os créditos promocionais de US$ 300 por 30 dias são diferentes dos recursos Always Free. A proposta usa apenas Always Free e não inclui upgrade para Pay As You Go.

## Configuração candidata, ainda sujeita à disponibilidade e aos limites da conta

- Uma instância VM.Standard.A1.Flex (ARM64), na região principal da conta.
- Até 2 OCPUs e 12 GB de RAM somados entre as instâncias A1 da conta Free Tier.
- Imagem Ubuntu ARM64 elegível, sem licença adicional paga.
- Volume de inicialização proposto de 100 GB, dentro do limite total de 200 GB gratuitos de boot e block volumes na região principal, descontando os volumes já existentes.
- Confirmar os rótulos Always Free elegíveis e a estimativa de custo para cada recurso; não usar os créditos temporários como prova de gratuidade permanente.
- Sem balanceador pago, banco gerenciado pago ou outro recurso extra nesta fase.
- Regras públicas limitadas ao portal e HTTPS necessários; SSH restrito ao administrador e bancos sem portas públicas. Definir acesso, domínio e certificados antes de abrir o portal.

Não criar a instância automaticamente enquanto não houver conta acessível e revisão da configuração concreta. Se faltar capacidade gratuita, aguardar ou verificar outro domínio de disponibilidade na mesma região; não trocar para um shape pago como alternativa automática.

## Compatibilidade verificada em 01/11/2026

`node scripts/check-oracle-arm.mjs` consultou metadados dos registros públicos, sem baixar imagens ou iniciar containers. Resultado em `reports/oracle-arm-compatibility.json`: 14 das 15 tags do código publicam Linux ARM64.

Publicam ARM64: Authentik, Chatwoot, ERPNext, Nextcloud, Postiz e Temporal, n8n, PostgreSQL/pgvector, MariaDB, Redis, Caddy e WireGuard, nas tags verificadas.

Exceção: `devlikeapro/waha:latest` publica somente Linux AMD64 nesta consulta. A demonstração inicial deve usar atendimento de exemplo/webchat sem prometer WhatsApp via esta imagem. Uma substituição ARM64 precisará de análise e testes próprios; não instalar emulação automaticamente.

Manifesto compatível não significa aplicação testada em ARM. Os digests usados no computador atual precisam ser revistos: não reutilizar um digest específico AMD64 em ARM. Na implantação, fixar imagens ARM64 verificadas e realizar os testes no servidor real.

## Sequência após o cadastro

1. Conferir região, recursos existentes, limites e disponibilidade Always Free na conta.
2. Revisar a instância candidata e o custo antes de criá-la.
3. Preparar Linux, Docker e Node; criar configuração nova de demonstração, com dados fictícios e credenciais próprias. Não copiar os segredos do piloto local.
4. Adaptar o pacote para operar sem o WAHA incompatível e definir o perfil econômico para o servidor. O perfil atual `economia-local` rejeita domínios públicos e não deve ser forçado sem alteração e validação.
5. Implantar gradualmente, medir RAM/CPU e reduzir as aplicações ativas se necessário. Não assumir que todas cabem com estabilidade em 2 CPUs.
6. Configurar HTTPS, autenticação, acesso administrativo privado e testar o portal, as ferramentas selecionadas e os fluxos reais no servidor.
7. Guardar cópia recuperável fora da instância, dentro dos limites e condições escolhidos; snapshot isolado não comprova recuperação.

Instâncias Always Free ociosas podem ser recolhidas pela Oracle. Esta opção é uma candidata para demonstração, sem garantia de capacidade ou disponibilidade para uma apresentação agendada. A instalação no computador permanece separada.

## Referências oficiais

- https://www.oracle.com/cloud/free/
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
