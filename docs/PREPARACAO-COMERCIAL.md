# CloudWorld: preparação para prestação do serviço

## Estado remoto atual

O Codespaces executa uma empresa de apresentação com portal público e administração privada. A validação mais recente inclui 69 testes de código e 48 verificações de recuperação/isolamento de bancos e arquivos. Consulte [recuperação remota](RECUPERACAO-CODESPACES.md), [entrega e oferta](ENTREGA-E-OFERTA.md) e [levantamento de licenças](LICENCAS-DA-OFERTA.md). As seções de agendamento Windows abaixo continuam específicas ao piloto local; não certificam uma rotina no Codespaces.

O painel distingue cópia local de destino externo de rede e mostra MFA, homologação de duas empresas e hospedagem contínua como pendentes. `node scripts/Check-CommercialReady.mjs apresentacao` gera um relatório e retorna saída 2 quando a oferta ainda está bloqueada.

## O que já é utilizável no piloto

- Painel administrativo privado em http://127.0.0.1:8099.
- Portal de clientes separado em http://127.0.0.1:8100. Não compartilhe a conta admin do painel.
- Contas do portal por empresa, senhas armazenadas como scrypt, sessões com prazo, bloqueio por tentativas, suspensão e redefinição de senha com revogação de sessões.
- O cliente acessa apenas ferramentas liberadas para sua conta, com busca, favoritos locais e orientações. Essa permissão **não substitui** as permissões internas das ferramentas. O portal tem login central com Authentik; SSO dentro de cada ferramenta ainda depende de configuração compatível.
- n8n fica na administração, sem atalho ou permissão de cliente no portal. Não oferecer editor/hosted n8n sem revisar a licença aplicável.
- Captura Chatwoot → API central → ERP e n8n validada com dados fictícios.
- Alertas persistentes após duas observações ruins e registro de recuperação. Manutenção planejada tem supressão e cinco minutos de tolerância na retomada. O envio externo por webhook HTTPS está implementado, desativado até configurar e testar o destino. Nenhum email/WhatsApp externo foi configurado.
- Histórico de operações preservado sem persistir stdout que possa conter segredos.
- Backups com manifesto SHA256 e rotina diária preparada para 03:00 America/Sao_Paulo, dependente de sessão Windows e Docker ativos.
- Exportação/importação criptografada AES-256-GCM. Sem destino externo informado, não há cópia fora deste computador.

## Uso do portal

Em **Clientes e operação**, selecione a empresa e crie o acesso da pessoa. A senha gerada aparece uma única vez. Entregue-a por um canal apropriado, separado de outros dados sensíveis. Suspender ou gerar nova senha encerra as sessões anteriores.
Para o piloto, a credencial inicial fica em `runtime/tenants/piloto/portal-initial.private.json`, na instalação protegida. Não publique esse arquivo nem inclua sua senha em relatórios.
Ao abrir uma ferramenta, o usuário pode precisar do login próprio dela. Cadastre usuários reais, permissões e MFA nas aplicações/Authentik antes da entrega. Criar uma conta no portal não provisiona essas contas automaticamente.

## Backups e recuperação

`scripts/Register-Operations.ps1` registra portal e backup diário no Windows. Não transforma Docker Desktop em servidor independente de login. Se a máquina estiver desligada ou o Docker indisponível, o backup não acontecerá no horário previsto.

Para executar imediatamente, na instalação:

```powershell
node scripts/Run-Backups.mjs --now piloto
node manage.mjs restore-test piloto 'D:\VlanWorld\runtime\backups\piloto\PASTA'
```

O backup pode pausar aplicações por alguns minutos. Nunca rode comandos de remoção de volumes do cliente. O teste `restore-test` valida SQL, integridade e extração de arquivos. O novo ensaio `node scripts/test-functional-recovery.mjs` também abre as aplicações e verifica dados e portal em uma cópia isolada do último backup do piloto. Ele pausa o piloto para respeitar a memória disponível e tenta retomá-lo no encerramento. Consulte [recuperação funcional](RECUPERACAO-FUNCIONAL.md) para requisitos, evidências e limites; ainda é necessária homologação no servidor definitivo.

O destino externo é configurado por `Register-Operations.ps1 -ExternalDirectory CAMINHO`. Um caminho em outro diretório do mesmo disco **não** é uma proteção externa. Use um armazenamento fora do servidor; compartilhamentos e sincronizadores precisam ter disponibilidade e confirmação de replicação verificadas.

A chave de exportação fica em `runtime/backup-key.private.txt`. Guarde uma cópia fora do servidor e separada dos backups. Sem essa chave não há recuperação das cópias criptografadas. O módulo `backup-store.mjs` oferece exportBackup/importBackup; nunca restaure sobre uma pasta existente. Não há retenção com exclusão automática: acompanhar espaço e definir a política antes da operação comercial.

Os backups por cliente não incluem o código da plataforma, a chave mestra de exportação nem configurações administrativas globais. `node scripts/Package-Release.mjs` cria um pacote dos fontes e dependências fixadas com checksum, sem runtime/segredos. Guarde esse pacote e uma cópia protegida das configurações administrativas separadamente. Não entregue as configurações globais aos clientes.

## Notificações externas

Em **Clientes e operação**, configure um webhook HTTPS que aceite JSON com `text` e `incident`; opcionalmente informe um token Bearer. Esse destino é global do operador. Ativar o canal pode encaminhar alertas que já estejam abertos. O botão de teste envia uma mensagem identificada de teste para o destino salvo; confirme o recebimento na ferramenta escolhida.
URL e token ficam privados. Alterar a URL remove o token antigo se um novo não for informado. Respostas de erro do destino não são registradas; há até cinco tentativas com espera crescente. Uma confirmação HTTP não comprova que uma pessoa leu o aviso. Integrações de email, SMS ou mensageiros com outros formatos precisam de um receptor/adaptador compatível.

## Produção Linux — modelos preparados, ainda não implantados

`deploy/linux/` contém serviços systemd, timer de backup e configuração de proxy do portal. São modelos para preparar no servidor definitivo, não evidência de produção homologada.

1. Definir servidor, orçamento, domínio, responsável técnico e destino externo.
2. Preparar Linux, Node compatível e Docker; copiar fontes, instalar dependências fixadas e proteger runtime/segredos.
3. Revisar usuários do sistema, privilégios Docker, firewall e isolamento do processo do portal. Acesso ao grupo/socket Docker equivale a controle elevado do host; o portal não deve recebê-lo.
4. Manter painel administrativo em loopback, acessível por túnel SSH ou VPN. Nunca publicar a porta administrativa.
5. Configurar CW_PORTAL_ORIGIN=https://DOMINIO e CW_PORTAL_DOMAIN no proxy. Manter as rotas de cada aplicação no gateway existente.
6. O proxy encaminha somente chamadas Bearer da API por empresa para a central. Basic administrativo não deve ser publicado. Validar a configuração, DNS, certificados e firewall antes de habilitar acesso externo.
7. Criar e instalar uma empresa de homologação; provisionar credenciais e permissões; testar isolamento entre duas empresas com contas reais de teste.
8. Validar backups externos, recuperação, alertas fora do servidor, carga, reinício e atualização antes de cadastrar clientes pagantes.

O callback host.docker.internal é específico do Docker Desktop. No servidor Linux usar a rota HTTPS autenticada da API ou projetar um canal privado; não abrir a administração para contornar essa diferença.

## Entrega por cliente

Registrar: responsáveis, número de usuários, ferramentas contratadas, espaço e limites de suporte. Configurar domínio, contas individuais, ERP e processos, WhatsApp e redes sociais do próprio cliente. Validar o fluxo real de atendimento e treinar os usuários. Separar recursos de teste dos dados reais.

Antes de WhatsApp comercial, decidir entre a integração não oficial do piloto e a API oficial, considerando requisitos, custos e riscos operacionais. Não enviar mensagens de teste para terceiros sem autorização.

## Oferta inicial sugerida

Começar com um segmento e um cliente piloto assistido. Exemplo: assistência técnica que precisa organizar atendimento, contatos, documentos e acompanhamento.

- Implantação: diagnóstico, configuração, migração combinada e treinamento.
- Mensalidade: hospedagem, manutenção, backups e suporte com limites definidos.
- Adicionais: novas integrações, automações e horas extras.

Calcular preço com infraestrutura, licenças, armazenamento, recuperação, suporte e margem. Não prometer usuários/armazenamento ilimitados, disponibilidade 24x7 ou capacidade ainda não medida.
`node scripts/Inspect-Capacity.mjs` registra CPU/memória dos containers e recursos do host para apoiar o dimensionamento. É uma fotografia do momento, não mede picos nem define quantos clientes cabem no servidor.
Preparar proposta e contrato revisados: escopo, responsabilidades, suporte, manutenção, proteção de dados, cancelamento, exportação e exclusão acordada. Este documento é uma lista de preparação, não um contrato jurídico.

## Critérios que ainda bloqueiam a oferta comercial

Servidor/domínio não definidos, backups externos sem destino, canal externo de alertas ainda sem destino, permissões/SSO por aplicação pendentes, revisão comercial de licenças e contrato, configuração de negócio por cliente e homologação de capacidade/disponibilidade. A aba **Clientes e operação** deixa essas pendências visíveis; testes locais aprovados não eliminam essas etapas.
