# Entrega 1.6.3

## Mudancas

- Adaptador local para Docker ou Podman, com verificacao de armazenamento preservada.
- Configurador Podman verifica Compose v2 e socket Unix antes de salvar a selecao.
- Geracao de ambientes Podman qualifica imagens e rotula bind mounts para SELinux. Nao migra dados de ambientes Docker existentes.
- Painel com formulario de login, cookie HttpOnly, CSRF, limite de tentativas, expiracao de oito horas e logout. Basic Auth mantido para os scripts existentes.
- Indicadores reconhecem Podman e o inicializador concluido do Temporal. Uma empresa saudavel nao aparece parcialmente ativa por esse inicializador.
- Manifesto unico alimenta instalador Windows, atualizador e arquivo de distribuicao. Arquivos privados, runtime, dependencias e symlinks ficam fora do pacote.
- Atualizador Windows interrompe os processos antes de copiar fontes, instala dependencias pelo lockfile e tenta recuperar os fontes anteriores em caso de falha de copia/instalacao. Nao e uma atualizacao atomica de dados nem reverte migracoes das aplicacoes.
- GitHub Actions configurado para Node 22 e 24, com acoes fixadas por commit e artefato de fontes.

## Validacao local em 03/11/2026

- Node 22.16.0, Podman 5.8.9 e Compose 2.39.4.
- 76 testes aprovados, um teste especifico do Docker ignorado em Podman, nenhuma falha.
- Novo cadastro Podman criado em runtime temporario e validado pelo Compose sem iniciar containers.
- Piloto existente: 45 verificacoes reais de SQL, HTTPS e estado dos containers aprovadas.
- Pacote de fontes verificado quanto a dependencias relativas ausentes e dados privados.

O Windows nao foi executado nesta validacao. A matriz Node 24 depende da execucao da CI. VPN, carga comercial, SSO de todas as ferramentas, publicacoes externas e recuperacao completa continuam fora da homologacao desta entrega. Scripts auxiliares legados ainda podem exigir Docker diretamente; use o guia Podman para o fluxo suportado.
