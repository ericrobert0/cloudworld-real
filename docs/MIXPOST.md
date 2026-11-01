# Midias sociais — Mixpost Lite

> Estado mais recente: o Postiz foi corrigido e retomado como ferramenta principal; Mixpost foi retirado do painel e seus containers foram removidos; os dados foram preservados. Consulte [POSTIZ-CORRIGIDO.md](POSTIZ-CORRIGIDO.md) para os resultados atuais. Os relatos anteriores abaixo sao historicos.


Postiz foi substituido por **Mixpost Lite v2.6.0**, com imagem fixada por digest apos o download. O problema observado no Postiz era `ECONNREFUSED 127.0.0.1:3000`: a interface respondia na entrada, mas o backend interno nao estava acessivel. O teste antigo de redirecionamento HTTP nao detectava esse defeito.

## Acesso

- URL: https://mixpost.piloto.localhost:8443/mixpost/login
- Usuario inicial: `admin@example.com` (identificador local, nao uma caixa de email configurada).
- Senha: arquivo privado `D:\VlanWorld\runtime\tenants\piloto\mixpost-admin.private.json`.
- Atalho no painel: **Midias sociais → Mixpost Lite**.

A senha publica `changeme` foi substituida por uma senha aleatoria. O login foi testado com a senha privada e a senha padrao foi recusada. Nenhum email foi enviado.

## Para que serve

Preparar textos e midias, organizar publicacoes, visualizar o calendario e agendar conteudo para contas sociais conectadas. A biblioteca permite organizar e reutilizar imagens e videos.

Esta instalacao **Lite** inclui conectores de paginas do Facebook, X/Twitter e Mastodon. Nao inclui os conectores Instagram, TikTok e LinkedIn encontrados em outras edicoes. Nao presumir equivalencia com todos os canais do Postiz. Recursos e limites das APIs precisam ser conferidos ao conectar cada rede; algumas exigem aprovacao de aplicativo ou acesso pago.

Nenhuma conta social foi conectada e nenhuma publicacao foi enviada/agendada em uma rede real. Publicacao ponta a ponta permanece pendente de contas e credenciais autorizadas.

## Implantacao

Mixpost tem MariaDB e Redis exclusivos por cliente. Seu banco usa um usuario proprio, diferente do administrador do MariaDB. Os volumes de armazenamento e logs sao persistentes. O gerador, o gateway central, o painel e as rotinas de backup/restore foram adaptados ao novo servico.

O script de inicializacao oficial foi mantido em `upstream/mixpost-start.sh` com dois ajustes: permissoes somente em `storage` e `bootstrap/cache`, evitando copiar toda a arvore de dependencias para a camada gravavel; criacao de usuario padrao somente quando a tabela de usuarios estiver vazia, evitando recriar uma conta com senha publica apos mudar o email do administrador. O script e montado como somente leitura e incluido nos backups de configuracao.

As imagens do Postiz/Temporal nao foram apagadas, e seus volumes foram preservados. A copia fria anterior esta em `D:\VlanWorld\runtime\migrations\piloto\postiz-1793453564886`. Os dados antigos nao foram importados automaticamente para o Mixpost, pois as estruturas sao diferentes.

## Verificacao realizada

- Tres testes locais do gerador/painel passaram.
- 41 verificacoes gerais do piloto passaram apos a troca.
- Sete verificacoes do Mixpost passaram: pagina real de login; rejeicao da senha publica; login com senha privada; paginas autenticadas de publicacoes, calendario, midias e contas.
- O teste de autenticacao foi repetido depois de reiniciar o container.
- Resultado especifico: `runtime/tenants/piloto/mixpost-test.json`.

Os 44 checks anteriores permanecem como historico da arquitetura com Postiz/Temporal. A contagem atual e menor porque cinco servicos antigos foram substituidos por tres. O teste de restauracao completo anterior nao valida o novo banco do Mixpost; as rotinas foram adaptadas, mas uma nova homologacao de backup/restauracao do conjunto atualizado continua necessaria.

Fontes: [Mixpost Docker](https://docs.mixpost.app/lite/installation/docker/), [variaveis](https://docs.mixpost.app/lite/configuration/environment-variables/), [licenca MIT do Lite](https://github.com/inovector/mixpost/blob/main/LICENSE.md). Os recursos comerciais Pro/Enterprise nao foram comprados nem instalados.

