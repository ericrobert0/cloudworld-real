# Fila de integracoes e arquivamento

## Estados e capacidade

A fila ativa continua limitada a 10 mil eventos por empresa. Pendentes, falhos e eventos sem fluxo nunca sao arquivados automaticamente. O limite protege o processo de crescimento ilimitado da fila em memoria; ainda existe capacidade finita para trabalho nao concluido.

A partir de 9 mil eventos, novas entradas tentam arquivar ate 500 eventos totalmente entregues, mantendo as mil entregas mais recentes na fila. Ao atingir 10 mil, a tentativa pode arquivar tambem entregas recentes para liberar capacidade. Se a fila continuar cheia com trabalho pendente, falho ou sem fluxo, a API responde HTTP 503. O alerta de capacidade abre apos duas observacoes e resolve quando a fila volta abaixo de 9 mil.

Na aba **Integracoes e API**, os contadores mostram eventos ativos, pendentes, com falha, sem fluxo e arquivados. O botao **Arquivar entregues antigos** processa um lote de ate 500 entregas, mantendo as mil mais recentes. Ele nao apaga o historico. Lotes adicionais podem ser solicitados quando houver mais eventos elegiveis.

## Idempotencia e seguranca

Cada registro arquivado preserva o evento original e sua chave de idempotencia em `integration-archive.private`, dentro do diretorio privado da empresa. O nome do arquivo e o SHA256 da chave; caminhos fornecidos pelo cliente nao sao usados. O diretorio e privado e os arquivos sao gravados com permissoes restritas.

A gravacao publica o registro antes de retira-lo da fila ativa. Uma falha deixa a fila original preservada; repetir o arquivamento reutiliza os registros ja gravados. Um reenvio com a mesma chave e conteudo devolve o ID original, mesmo depois de reiniciar o processo. Mesma chave com outro conteudo devolve HTTP 409. Registros corrompidos falham de modo fechado, sem aceitar silenciosamente uma nova entrega.

O arquivamento nao transforma a entrega em exactly-once: um destino que recebeu uma solicitacao, mas perdeu a resposta, ainda pode receber uma tentativa repetida. Idempotencia no destino continua necessaria.

As rotas de estatistica e arquivamento exigem autenticacao do operador. Tokens de integracao nao recebem essa permissao. Mutacoes exigem origem valida. Durante uma operacao com `.operation.lock`, entradas novas respondem 503 e o arquivamento manual responde 409; o remetente deve repetir depois da manutencao.

## API do operador

- `GET /api/v1/tenants/EMPRESA/events/stats`: contadores da fila, limite e total arquivado, sem payloads ou chaves.
- `POST /api/v1/tenants/EMPRESA/events/archive`: corpo JSON opcionalmente contendo `keepDelivered` (0 a 9000) e `maxEvents` (1 a 500). O corpo deve ser enviado, por exemplo `{}` para os padroes.

O historico arquivado permanece nos arquivos privados e nos backups. Esta entrega nao acrescenta uma tela para navegar nos payloads arquivados nem uma operacao de exclusao desses registros.

## Backup e recuperacao

O backup inclui um arquivo `integration-archive.private.jsonl`, quando ha historico, e agora preserva tambem `images.requested.json`. O arquivo JSONL e produzido em streaming, recebe hash no manifesto e acompanha a exportacao AES-GCM existente. Ele contem dados pessoais e deve receber a mesma protecao dos demais arquivos do backup.

A recuperacao funcional importa esse arquivo para o diretorio privado do clone antes de testar as aplicacoes. O importador verifica empresa, formato, fingerprint, chaves duplicadas e tamanho de registro. So publica o diretorio depois de concluir; nao sobrescreve historico existente. Backups antigos sem arquivo de historico continuam aceitos.

Para uma restauracao operacional feita por outro procedimento, verifique o manifesto e importe o JSONL com `restoreArchiveBundle`, de `integration-archive.mjs`, no runtime restaurado da mesma empresa. Apenas copiar o JSONL sem importa-lo nao ativa a deduplicacao arquivada. Nao reutilize historico de outra empresa.

## Limites conhecidos

Os arquivos arquivados nao expiram nem sao apagados automaticamente. O uso de disco cresce e exige acompanhamento; uma politica de exclusao futura precisa considerar o prazo de idempotencia e a retencao dos dados. O armazenamento ainda usa arquivos locais, com um unico processo operador por runtime. Nao ha suporte a varios escritores independentes ou fila distribuida nesta entrega.
