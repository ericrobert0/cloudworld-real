# Postiz corrigido — 31/10/2026

## Acesso

- URL: https://postiz.piloto.localhost:8443/auth/login
- Usuario inicial local: `admin@piloto.localhost`.
- Senha: `D:\VlanWorld\runtime\tenants\piloto\postiz-admin.private.json`.
- Atalho principal do painel: **Midias sociais → Postiz**.
- Mixpost foi retirado do painel e seus containers foram removidos. Bancos, arquivos e credenciais foram preservados para recuperacao.

## Diagnostico confirmado

A falha original foi reproduzida em um projeto separado (`vw-postiz-lab`), usando copias dos volumes arquivados. O backend encerrava com:

```
Unable to create search attributes: cannot have more than 3 search attribute of type Text.
```

O Temporal de demonstracao criava `CustomTextField` e `CustomStringField`. O Postiz precisava cadastrar `organizationId` e `postId`; a soma ultrapassava o limite da visibilidade SQL.

No teste de recriacao surgiu outro problema: o Temporal escolhia automaticamente o IP de uma das duas redes internas, ficando inacessivel pela outra. A escuta foi fixada em `0.0.0.0`, sem publicar sua porta no Windows.

## Correcao aplicada

- `SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES=true`, impedindo a criacao dos exemplos na inicializacao.
- Inicializador `temporal-init` remove somente os dois campos de demonstracao legados e aguarda o namespace. Nao remove namespaces, workflows ou os campos usados pelo Postiz.
- Postiz inicia apenas depois da preparacao e da saude dos bancos/Redis.
- `BIND_ON_IP=0.0.0.0` no Temporal, mantendo o acesso restrito as redes Docker.
- Limite de memoria do Postiz ajustado para 2,5 GiB para os processos internos. Isso nao constitui capacidade medida por cliente.
- Healthcheck consulta a resposta JSON real do backend, o endpoint do orquestrador e a interface; o teste geral tambem usa o backend, em vez de aceitar somente o redirecionamento da pagina inicial.
- O modelo de novos clientes e o gateway central usam agora o Postiz corrigido (`2026-10-31.3`).

## Validacao

- Laboratorio: cadastro/login local, senha incorreta rejeitada, perfil e interface autenticados, lista de conectores incluindo Instagram e TikTok; repetidos apos recriar Temporal e reiniciar Postiz.
- Piloto: primeiro administrador local criado; depois, oito verificacoes autenticadas aprovadas. Nenhum email enviado.
- Verificacao final do conjunto, com Mixpost mantido: **50 checks aprovados, zero falhas** (oito bancos, sete rotas e 35 estados de servicos/inicializadores).
- Tres testes locais do modelo e painel aprovados.
- Laboratorio encerrado sem apagar seus volumes nem os originais. A rota temporaria e a porta de teste nao estao mais ativas.
- Relatorios: `reports/postiz-lab-test.json`, `reports/postiz-piloto-test.json`, `reports/smoke-postiz-fixed.json` na copia de trabalho; resultados detalhados no runtime do D:.

O cadastro local fica fechado depois da primeira organizacao. As credenciais iniciais sao privadas e foram incluidas na lista de arquivos de configuracao copiados pelos proximos backups.

## Instagram e outras redes

Os conectores estao disponiveis na interface, mas isso nao representa uma conta conectada ou publicacao testada. Instagram/Meta, TikTok e outras redes exigem configurar seus aplicativos, credenciais, permissoes e callbacks. Dominio/HTTPS publicos podem ser necessarios. Nenhuma conta externa foi autorizada e nenhuma publicacao foi enviada nesta correcao.

Fonte de referencia do problema: [relato no projeto Postiz](https://github.com/gitroomhq/postiz-app/issues/1504). A causa e as opcoes de configuracao foram confirmadas no codigo das imagens instaladas, nao somente no relato.

## Recuperacao

Configuracao do piloto antes desta correcao preservada em `runtime/migrations/piloto/before-postiz-fix-*`. Os arquivos e volumes do Mixpost foram preservados, sem servicos ativos. A copia anterior do Postiz em `runtime/migrations/piloto/postiz-1793453564886` foi mantida.

Ao recuperar um backup antigo do Postiz, aplique tambem a configuracao corrigida de `postiz.mjs`; restaurar so a configuracao antiga pode reintroduzir as falhas. A recuperacao completa do novo conjunto deve continuar sendo homologada antes da oferta comercial.

## Retirada do Mixpost

A pedido do usuario, o Mixpost foi retirado em 31/10/2026. A verificacao posterior aprovou 45 checks, sem falhas. A configuracao anterior esta em runtime/migrations/piloto/mixpost-retired-1793456683551. Nenhum volume foi apagado.

