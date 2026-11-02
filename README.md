# CloudWorld — plataforma de serviços por empresa

**Apresentação remota real:** seis aplicações instaladas e 57 testes de código aprovados. O monitoramento inclui PING, DNS, TCP, ARP e eventos dos containers, separados por empresa. Nos dois hosts avaliados do Codespaces, encerramentos do Docker ainda impedem estabilidade contínua. Consulte `docs/CODESPACES-ENCERRAMENTO-DOCKER.md`, `docs/CODESPACES-ACESSO.md` e `deploy/codespaces/README.md` para os resultados e limitações. A plataforma ainda está em homologação; este ambiente não equivale a hospedagem comercial permanente.

**Login central:** o portal suporta Authentik/OIDC com PKCE, vínculo explícito de empresa/usuário e validação assinada. O acesso local permanece disponível na transição. Veja [SSO e laboratório de isolamento](docs/SSO-E-ISOLAMENTO.md) para o escopo exato e as limitações; isso não configura SSO automaticamente nas demais aplicações.

**Preparação comercial:** portal separado de clientes na porta 8100, contas por empresa, alertas persistentes, histórico de operações e backup diário com exportação criptografada. A aba **Clientes e operação** apresenta os acessos e os itens ainda pendentes para produção. Veja [o guia de preparação](docs/PREPARACAO-COMERCIAL.md). Domínio, hospedagem e armazenamento externo ainda dependem de definição; o portal não substitui SSO ou permissões das aplicações.

**API central e monitoramento:** o painel possui abas **Integrações e API** e **Monitoramento**, com conexões separadas por empresa, chaves revogáveis, fluxos de eventos, fila persistente com reenvios, verificações HTTP/rede e estados dos containers. Consulte [o guia da API](docs/INTEGRACAO-CENTRAL.md) para configurar credenciais, webhooks e alvos de monitoramento. A presença de um conector não significa que sua credencial ou o fluxo já foi validado no ambiente real.

**Estado atual: Postiz corrigido e em execução.** A causa do encerramento do backend foi reproduzida e corrigida. Foram aprovados oito testes funcionais do Postiz e 45 checks gerais do piloto; Mixpost foi retirado do painel e seus dados foram preservados. Acesse **Mídias sociais → Postiz** no painel. Credenciais e diagnóstico em [docs/POSTIZ-CORRIGIDO.md](docs/POSTIZ-CORRIGIDO.md). Os conectores Instagram/TikTok estão disponíveis, mas contas e publicações externas ainda precisam ser configuradas e testadas.

**Validação anterior à substituição do Postiz (histórico).** Docker Engine Linux funcional, imagens instaladas e bancos preparados. O teste final passou em **44 de 44 verificações**, após backup e retomada. A restauração em ambiente isolado passou na conferência SHA256, importação dos sete bancos e extração dos volumes; o ambiente temporário foi removido. O disco de dados está em `D:\DockerDesktop\disk`, com junction na pasta original e cópia anterior preservada. SSO entre aplicações, VPN, WhatsApp pareado e publicação externa continuam pendentes; não confundir o piloto operacional com produção comercial homologada.

O computador possui Windows 10 Home, Intel i3-10100 (4 núcleos/8 threads), 16 GB de RAM e aproximadamente 723 GiB livres em D:. Docker Desktop, Compose, WSL2/Ubuntu, Git e Node já estavam instalados. Nenhum pacote global adicional é necessário para o painel.

## Onde está a instalação

- Fontes de trabalho: `C:\Users\Pc\Documents\ChatGPT\Vlan World`.
- Instalação operacional: `D:\VlanWorld`.
- Clientes/configurações/segredos: `D:\VlanWorld\runtime\tenants\<cliente>`.
- Backups: `D:\VlanWorld\runtime\backups\<cliente>\<data>`.
- Senha do painel: `D:\VlanWorld\runtime\panel-password.txt`.
- Dados dos containers: volumes nomeados dentro do disco virtual do Docker. **A pasta do projeto no D: não move esses volumes automaticamente.**

## Continuar depois da reinicialização

1. Ao entrar no Windows, a tarefa `VlanWorld-Control` inicia o painel e solicita a abertura do Docker se ele estiver parado. Confirme `docker info` sem erros.
2. O armazenamento ja esta em `D:\DockerDesktop\disk`, por junction verificada. Nao refaca a migracao nem use factory reset. O disco anterior foi preservado em `%LOCALAPPDATA%\Docker\wsl\disk.before-vlan`.
3. Em PowerShell, execute a partir de `D:\VlanWorld`:

```powershell
.\scripts\Confirm-DockerStorage.ps1 -DiskImageDirectory 'D:\DockerDesktop\disk'
node manage.mjs validate piloto
node manage.mjs up piloto
node manage.mjs smoke piloto
.\scripts\Start-Panel.ps1
```

Se o Docker mostrar uma subpasta diferente para o disco, use exatamente essa pasta em `Confirm-DockerStorage.ps1`. A verificação exige que ela apareça nas configurações do Docker e contenha um VHDX. Não crie manualmente o arquivo de confirmação.

Se o erro de virtualização continuar após reiniciar: confirme Intel VT-x na BIOS/UEFI e o estado do hypervisor. A correção pode ser repetida executando `scripts\Repair-Virtualization.ps1` como administrador; ela não reinicia o computador.

O comando `up` baixa as imagens, fixa os respectivos digests em `images.lock.json`, inicia os bancos, executa as migrações de Chatwoot e ERPNext e inicia os serviços. Os digests só existirão após download bem-sucedido. As imagens opcionais do WireGuard ficam fora desse processo.

## Painel e primeiro acesso

Painel: **http://127.0.0.1:8099**, usuário `admin`, senha no arquivo privado indicado acima. Ele permite criar configurações de clientes, instalar/iniciar, atualizar aplicações com backup prévio, suspender, retomar, consultar estado, fazer backup e executar smoke tests. O registro mostra o resultado real das operações; criar configuração não significa provisionar o cliente.

| Aplicação | URL do piloto | Primeiro acesso |
|---|---|---|
| Authentik | https://auth.piloto.localhost:8443 | `akadmin`; senha `authAdmin` em `secrets.json` |
| Chatwoot | https://chat.piloto.localhost:8443 | Criar conta pelo comando abaixo |
| n8n | https://n8n.piloto.localhost:8443 | Criar proprietário no assistente inicial |
| Postiz | https://postiz.piloto.localhost:8443/auth/login | `admin@piloto.localhost`; senha em `postiz-admin.private.json` |
| Nextcloud | https://cloud.piloto.localhost:8443 | `admin`; senha `cloudAdmin` |
| ERPNext | https://erp.piloto.localhost:8443 | `Administrator`; senha `erpAdmin` |
| WAHA privado | http://127.0.0.1:8445 | `admin`; senha `wahaDashboard`; API key `waha` |

```powershell
node manage.mjs chat-admin piloto seu-email@seu-dominio.com
```

O comando salva a senha em `chat-admin.private.json` e não a imprime. Guarde os arquivos de segredos em cofre; não publique nem faça commit deles. A instalação no D: restringe a pasta ao usuário atual, SYSTEM e administradores.

HTTPS local usa uma CA própria do Caddy: o navegador não confiará nela inicialmente. Após o Caddy iniciar, exporte o certificado público e importe-o manualmente como autoridade confiável no Windows. Não importe a chave privada. Isso não fornece um certificado público nem torna `.localhost` acessível de outros computadores. Os testes locais usam `curl --insecure` exclusivamente nesse modo.

## Documentação detalhada

- [Mixpost Lite: histórico e dados preservados](docs/MIXPOST.md)
- [Serviço padronizado para microempresas](docs/SERVICO.md)
- [Arquitetura e isolamento](docs/ARQUITETURA.md)
- [Operação, testes e restauração](docs/OPERACAO.md)
- [SSO, WhatsApp e publicação externa](docs/INTEGRACOES.md)
- [Resultado da verificação deste computador](docs/VALIDACAO.md)

Esta entrega é uma base para homologação. Não há garantia de ausência de erros: inicialização real e testes ponta a ponta dependem do reinício, do Docker funcional, dos acessos externos e das contas das aplicações.

