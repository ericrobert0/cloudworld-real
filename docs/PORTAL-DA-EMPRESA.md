# Portal da empresa — CloudWorld 1.3

Disponível na instalação local em http://127.0.0.1:8100/. O portal administrativo permanece separado em http://127.0.0.1:8099/.

## O que o cliente encontra

- **Visão geral:** saudação, identificação da empresa, quantidade de ferramentas liberadas, favoritos e acesso rápido. Esses números descrevem permissões e preferências; não representam disponibilidade nem indicadores financeiros.
- **Minhas ferramentas:** busca pelo nome ou atividade, estrelas para favoritar e filtro de favoritos. Cada aplicação abre em uma nova aba.
- **Primeiros passos:** orientações correspondentes somente às ferramentas liberadas para a conta.
- **Ajuda e acesso:** empresa, usuário, tipo de login desta sessão e dúvidas sobre acesso, manutenção, recuperação de senha e logout.

A tela de entrada mantém login central e senha local. Há botão para mostrar/ocultar a senha. A versão móvel mantém os quatro menus e uma saída da conta visível no cabeçalho.

## Privacidade e limites

Os favoritos guardam somente identificadores de ferramentas no armazenamento deste navegador, com chave separada por empresa e usuário. Eles não dão acesso a ferramentas, não sincronizam entre dispositivos e não incluem credenciais. Sem autorização de armazenamento, funcionam na sessão atual.

O servidor continua fornecendo somente as quatro aplicações comerciais autorizadas. Não há API de administração, n8n, credenciais de integrações ou dados de outras empresas no portal. A indicação “Acesso liberado” descreve a permissão; não afirma que a aplicação esteja disponível naquele instante. Falha ao verificar a sessão oculta o ambiente até uma nova autenticação/verificação bem-sucedida.

O portal não cria contas internas, não configura redes sociais e não substitui as permissões das ferramentas. A área de ajuda contém orientações; não foi inventado um canal de suporte ou um sistema de chamados. Os avisos de manutenção vêm da trava de operações real.

## Validação desta entrega

31 testes automatizados aprovados; seis verificações HTTP reais do portal aprovadas; autenticação real no Authentik, PKCE incorreto e replay validados. A verificação visual cobriu desktop e tela de 390 × 844, navegação nas quatro áreas, busca por “financeiro”, favorito persistido após recarregar, filtro, busca sem resultados e saída pelo celular. O favorito criado no teste foi removido ao concluir e o tamanho do navegador restaurado.

Capturas e relatório de conferência ficam em `reports/portal-v1.3-*`. Esta entrega melhora o portal; a homologação de recuperação completa, carga, permissões/MFA por ferramenta e publicação comercial continua pendente conforme `PREPARACAO-COMERCIAL.md`.
