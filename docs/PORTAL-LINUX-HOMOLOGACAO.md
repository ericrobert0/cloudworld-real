# Homologação do portal Linux

O portal público usa a conta de sistema cloudworld-portal. O painel e o projetor usam cloudworld. O projetor publica a configuração de acesso em /var/lib/cloudworld-portal/config e oferece o socket de revalidação de identidade. A conta pública lê essa projeção e grava as próprias sessões. Configure a origem HTTPS em /etc/cloudworld/portal.env.

## Instalação

1. Extraia os fontes em /opt/cloudworld com proprietário root e remova permissões de gravação do grupo e de outros usuários. Instale as dependências fixadas pelo package-lock.json. Mantenha o runtime gravável somente pela conta administrativa cloudworld, com modo 0700.
2. Crie cloudworld e cloudworld-portal como contas de sistema, cada uma com seu grupo principal e sem login interativo. O portal deve operar com grupos que permitam apenas sua função. O acesso ao Docker fica com o operador.
3. Instale deploy/linux/cloudworld-portal.conf em /etc/tmpfiles.d/ e execute systemd-tmpfiles --create para preparar os diretórios. Instale cloudworld-portal-projector.service e cloudworld-portal.service em /etc/systemd/system/. Configure CW_PORTAL_ORIGIN com a origem HTTPS exata em /etc/cloudworld/portal.env e recarregue o systemd.
4. Habilite o serviço do portal. O projetor inicia como dependência. Configure o proxy HTTPS usando deploy/linux/Caddyfile.portal. Confira login, suspensão, reinício e falha temporária da administração antes de liberar usuários.

## Laboratório reproduzível

O script scripts/Test-LinuxPortalSystemd.sh exige root em um Linux descartável, sem instalação anterior do CloudWorld. Ele recebe o pacote tar.gz de fontes, uma pasta node_modules com dependências já instaladas e o executável Linux do Caddy. A opção --reuse repete o teste somente em uma instalação marcada como laboratório pelo script. Os serviços são instalados temporariamente em /run/systemd/system e encerrados ao final. Fontes, contas fictícias e arquivos do laboratório permanecem no Ubuntu para investigação e repetição.

O ensaio valida as unidades com systemd-analyze, testa a recusa de acesso do portal ao runtime e ao código gravável e utiliza Caddy com certificado local. O Node recebe a CA somente na execução do ensaio. A confiança em certificados do sistema permanece sob a configuração do host.

Os testes exercitam login seguro, sessão após reinício, rejeição de certificado sem confiança, origem incorreta e rotas administrativas. Também congelam o projetor por 16 segundos para comprovar que dados desatualizados bloqueiam acesso. Após retomar o projetor, o acesso volta. Suspender a conta deve invalidar a sessão existente.

O relatório fica em runtime/linux-portal-lab.json dentro do Linux de laboratório. A validação em produção depende do servidor e do domínio definitivos.
