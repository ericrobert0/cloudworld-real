# CloudWorld: demonstração no Google Cloud

Estado: proposta local, sem servidor criado e sem publicação. A Oracle foi substituída como candidata; nenhuma mudança foi aplicada à instalação existente.

## Ativar o teste

O proprietário deve entrar em https://cloud.google.com/free e escolher o teste gratuito. Deve preencher seus próprios dados de pagamento, identidade e aceite dos termos diretamente no Google. Não enviar cartão, senhas ou chaves privadas no chat.

A oferta consultada em 01/11/2026 fornece US$ 300 por até 90 dias a usuários elegíveis. Isso é crédito temporário, não uma VPS permanente gratuita. O teste termina ao acabar o saldo ou o prazo. Sem upgrade para conta paga, os recursos do teste são interrompidos. Se a conta já for paga ou não for elegível, não provisionar supondo custo zero.

## Configuração candidata

`demo-plan.json` registra uma VM x86-64 com 4 vCPUs, 16 GiB de memória e disco de 80 GiB, na região candidata us-central1. A arquitetura é a mesma das imagens do piloto Windows/WSL e permite avaliar o WAHA atual, cuja tag não publica ARM64. Compatibilidade de arquitetura não equivale a implantação ou teste em Linux remoto.

O custo completo, incluindo disco, IP, tráfego e eventuais backups, deve ser calculado na conta e comparado ao saldo antes de criar o servidor. Não há garantia de que os créditos sustentem essa configuração por todos os 90 dias. A região é provisória e pode mudar conforme quotas, custo e latência.

Não usar a pequena VM permanente do Free Tier como substituição automática: ela não representa capacidade suficiente para o conjunto atual de ferramentas.

## Sequência após verificar o crédito

1. Escolher projeto exclusivo da demonstração e conferir estado Free Trial, saldo, vencimento e quotas. A criação/ativação de APIs deve ser feita apenas no projeto escolhido.
2. Revisar custo e preparar alertas. Alertas de orçamento não bloqueiam gastos automaticamente.
3. Criar uma VM e configurar administração restrita, sem expor bancos nem o painel do operador.
4. Instalar dependências Linux e aplicar os modelos em `deploy/linux`, adaptados ao servidor; não copiar o runtime local inteiro, senhas ou backups reais.
5. Criar somente uma empresa fictícia com credenciais novas. Implantar gradualmente, começando pelo portal e serviços selecionados, medindo memória e tempo de resposta.
6. Definir endereço público, HTTPS e autenticação antes de abrir as ferramentas. Contas de redes sociais e WhatsApp exigem conexão e autorização específicas.
7. Testar aplicações, permissões, isolamento, backup e recuperação no servidor real. O perfil `economia-local` não pode ser aplicado diretamente a domínio público sem adaptação validada.
8. Programar o período da demonstração e revisar consumo. Desligar a VM reduz computação, mas discos e IPs reservados podem continuar consumindo créditos; não excluir dados sem cópia recuperável e autorização.

Não ativar upgrade pago, licenças comerciais ou serviços fora do crédito sem nova autorização.

## Referências oficiais

- Cadastro: https://cloud.google.com/free
- Regras, elegibilidade e fim do teste: https://docs.cloud.google.com/free/docs/free-cloud-features
- Preços de computação: https://cloud.google.com/products/compute/pricing
- Calculadora: https://cloud.google.com/products/calculator
