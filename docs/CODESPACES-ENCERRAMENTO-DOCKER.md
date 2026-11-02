# Encerramento externo do Docker — evidência para investigação

Estado em 02/11/2026: aplicações instaladas e testadas, mas o ambiente remoto ainda não é estável para apresentação sem acompanhamento.

## Evidência capturada

No Codespace `effective-guacamole-5vqqrwwxrq6xfv54x`, um rastreamento iniciado junto com a rotina oficial do Docker registrou:

```text
71128 12:42:07.994348 --- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=0, si_uid=61876} ---
```

O horário do registro é UTC: **09:42:07 de 02/11/2026, horário de São Paulo**. O daemon tinha permanecido ativo por mais de 11 minutos. O sinal ocorreu antes do comando utilizado para encerrar o observador temporário, às 12:42:30 UTC.

O valor `si_pid=0`, acompanhado de `SI_USER`, indica que o remetente não é visível no namespace de processos observado. Isso aponta para uma origem externa ao container de desenvolvimento. **Não identifica qual processo, regra ou componente do host enviou o sinal.** Não foi demonstrado que se trata de uma política específica do GitHub, de cota, de CPU ou de inatividade.

Referência: [documentação Linux sobre namespaces de processos](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html).

O registro integral fica somente em `runtime/docker-start-signals.private.log`. Não inclui corpos de requisições, senhas ou variáveis de ambiente. Os nomes dos processos foram consultados sem argumentos. Nenhuma configuração de suspensão por inatividade foi desativada e nenhum mecanismo de reinício contínuo foi criado.

## Verificações realizadas

- 57 testes de código aprovados após a inclusão do coletor de eventos e do isolamento por projeto.
- Durante uma janela em funcionamento: 44/44 verificações dos serviços, 6/6 do portal e 17/17 do fluxo real Chatwoot → API/fila → ERPNext/n8n.
- Seis endereços públicos responderam HTTP 200/302/307 durante outra janela em funcionamento. Esse teste partiu do Codespace, sem enviar credenciais, e não substitui login em navegador externo.
- A navegação pelo navegador integrado falhou. Não foi confirmada uma apresentação completa pelo navegador.
- Reconstrução normal do Dev Container preservou a identidade Docker, as imagens e os volumes. Não resolveu os encerramentos.
- Inicialização independente do terminal também não resolveu. Essa alteração experimental não foi mantida no iniciador do projeto.
- Concorrência das operações Compose limitada a duas neste Codespace. Isso permitiu concluir verificações, mas não impede o sinal externo.

## Dados e alterações preservados

Os volumes continuam no armazenamento Docker existente. Uma cópia física anterior, feita com containers parados, ocupa aproximadamente 460 MB em `runtime/recovery-before-rebuild`; os arquivos comprimidos e SHA256 foram verificados. A restauração dessa cópia remota ainda não foi testada. Essa cópia permanece dentro do próprio Codespace e não protege contra exclusão do Codespace.

O repositório é privado: `ericrobert0/cloudworld-real`. `runtime/`, credenciais e backups não devem ser incluídos em commits nem anexados integralmente a chamados.

## Pedido sugerido ao suporte ou administrador do host

Investigar qual processo externo enviou SIGTERM ao daemon Docker às 12:42:07 UTC de 02/11/2026, remetente apresentado como UID 61876, e verificar a forma suportada de manter o Docker-in-Docker ativo neste Codespace. O problema se repete enquanto o editor está em uso. Aumentar memória, trocar armazenamento, apagar volumes ou desabilitar a suspensão automática não deve ser tratado como solução comprovada.

Este documento é um rascunho local para investigação. Nenhum chamado ou mensagem foi enviado a terceiros.

## Ensaio em outro host

Em 02/11/2026 foi criado um segundo Codespace, `laughing-barnacle-gxpjggg4j6xhvjvg`, com o mesmo repositório privado e 4 núcleos/16 GB. O original foi preservado e estava parado. Antes de instalar aplicações, um container descartável passou nas três verificações de início, transição `stopping` e parada limpa. Esse teste não consultou o painel e não comprova estabilidade prolongada.

A inspeção inicial encontrou apenas 9,9 GiB livres. Não foi iniciado o download do pacote. Foi solicitada reconstrução completa **somente desse ambiente novo, sem clientes nem volumes de aplicações**, para remover o cache da criação. Não repetir essa operação no ambiente original com dados.

O comando abaixo observa a identidade e disponibilidade do Docker durante 15 minutos e para na primeira falha. Não reinicia o daemon nem altera as regras de suspensão. O relatório é atualizado em `runtime/reports/docker-host-stability.json`. Uma janela aprovada não garante disponibilidade futura.

```sh
node scripts/Test-DockerHostStability.mjs 900
```
