# Consulta de status sem varredura de arquivos

Em 02/11/2026 foi identificado trabalho desnecessário no monitoramento do painel: `docker ps -a --format '{{json .}}'` pode solicitar ao daemon o tamanho dos containers durante o processamento do template. Calcular esse tamanho percorre os arquivos das camadas graváveis. Repetir a consulta a cada 15 segundos pode gerar trabalho pesado que não é necessário para mostrar se um serviço está ativo.

O painel agora envia `--size=false`, filtra projetos Compose e solicita somente ID, nome, estado, descrição de saúde, imagem e o identificador do projeto. Labels arbitrários e comandos de inicialização não são transportados para o painel. A seleção de empresas continua usando o nome exato do projeto.

O teste `tests/docker-status-cli.test.mjs` executa o Docker CLI real contra uma API temporária no loopback, sem usar dados de clientes. Ele reproduziu a solicitação de tamanho pelo template anterior e confirmou que a consulta nova não a envia. Também verifica que labels privados e comandos não aparecem no resultado. Esse teste funciona sem iniciar um daemon Docker.

## Ensaio remoto

Aplicar a mudança com o daemon já sobrecarregado não recuperou aquela execução: ela também encerrou. Depois foi feita uma inicialização controlada com os arquivos corrigidos desde o início, preservando o mesmo armazenamento e sem reinstalar imagens ou apagar volumes.

Na amostra inicial, com 27 containers ativos, `ps` mostrou o processo Docker usando 0,7% da memória e 4,0% de CPU. Na execução anterior, havia atingido 41,7% de memória e 127% de CPU. Essas amostras foram coletadas em momentos diferentes e não são um benchmark controlado. A retomada das aplicações terminou com código zero. A observação prolongada e os testes funcionais ainda devem ser consultados nos relatórios antes de considerar o ambiente estável.

O ensaio iniciado às 15:52 terminou às **16:22:36 de 02/11/2026 (São Paulo)** com os 30 minutos solicitados concluídos, mesma identidade e mesmo processo Docker, sem falha detectada e sem incremento de OOM nos contadores disponíveis. Parte do fim da janela ocorreu durante a manutenção normal para backup, com aplicações parando; esse teste verifica o daemon, não disponibilidade ininterrupta de todas as ferramentas. Na amostra posterior, após 34 minutos, o daemon usava 0,8% da memória e 2,1% de CPU.

Foram aprovados 59 testes de código, 44 verificações dos serviços, sete do portal, 17 do fluxo real e quatro de ciclo de vida. O login foi confirmado pelo navegador integrado. A observação de uma única sessão não aprova operação comercial contínua.

O recebimento de SIGTERM continua registrado como evento real. Esta correção remove uma fonte comprovada de trabalho desnecessário; **não identifica quem enviou os sinais anteriores nem prova disponibilidade futura**. Não foram criados reinícios contínuos nem alterações nas regras de inatividade do Codespaces.

## Fontes primárias

- [Docker CLI: seleção de campos e cálculo opcional de tamanho](https://github.com/docker/cli/blob/master/cli/command/container/list.go).
- [Docker CLI: serialização do contexto dos containers](https://github.com/docker/cli/blob/master/cli/command/formatter/container.go).
- [Discussão no Moby sobre consultas de tamanho e JSON completo](https://github.com/moby/moby/issues/53920).
