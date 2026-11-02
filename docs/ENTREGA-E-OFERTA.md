# Preparar e entregar o CloudWorld

O ambiente atual demonstra ferramentas reais de uma empresa. A oferta comercial continua bloqueada enquanto houver itens pendentes no painel e na verificação `node scripts/Check-CommercialReady.mjs apresentacao` (saída 2 significa pendência, não teste aprovado).

## Ordem de implantação

1. Definir hospedagem contínua, domínio, orçamento, responsável e armazenamento de backup independente. O Codespaces tem cota e suspensão e não substitui esse servidor.
2. Instalar uma empresa de homologação no destino, validar DNS/HTTPS, portas privadas da administração, permissões do processo público e atualizações.
3. Criar duas empresas de teste com usuários de mesmo nome e senhas diferentes. Conferir APIs, arquivos, sessões, redes e credenciais nos dois sentidos. O laboratório de bancos deste Codespaces é parte dessa verificação, não substitui as aplicações completas.
4. Restaurar uma cópia criptografada no destino, abrir as ferramentas recuperadas e conferir os dados. Guardar chave e backup separadamente e comprovar a cópia fora do servidor. Verificar também retorno após reinício e envio de alertas para um canal independente.
5. O proprietário cadastra o segundo fator e guarda os códigos de recuperação em local privado. Confirmar que uma conta de cliente não administra o servidor ou outras empresas. Não cadastrar autenticadores sob controle de terceiros para o proprietário.
6. Validar licenças do pacote, proposta, tratamento de dados, responsabilidades e suporte. Revisar o modelo específico antes de prometer integrações ou disponibilidade.
7. Atender uma empresa piloto assistida, coletar falhas e medir consumo antes de ampliar.

## Cadastro de cada empresa

Registrar responsável, contato, ferramentas necessárias, usuários, espaço, prazo de suporte, migração e rotina de backup. Começar com dados de teste. Não cadastrar dados reais até a verificação de segurança e recuperação.

Criar contas individuais nas ferramentas, com permissões mínimas. Para o Chatwoot, configurar agentes e caixas de entrada; ERPNext, empresa, usuários e perfis adequados ao trabalho; Nextcloud, usuários/grupos e compartilhamentos; Postiz, organização, membros e contas sociais do próprio cliente. Só liberar SSO depois de testar o vínculo exato de empresa e usuário na ferramenta compatível.

WhatsApp e redes sociais exigem participação do titular: número, conta, consentimento, permissões e eventuais aprovações do provedor. A opção WAHA usa integração não oficial e deve ser avaliada antes de assumir compromissos com atendimento. Não enviar mensagens ou publicações externas durante ensaios sem autorização.

O operador configura automações previamente acordadas. O cliente recebe os resultados e utiliza as ferramentas contratadas; não recebe o painel administrativo, bancos, Docker ou credenciais de integração. O editor n8n permanece privado e seu modelo de uso deve seguir a licença aplicável.

## Escopo da proposta

- Implantação: configuração, migração delimitada, testes e treinamento.
- Mensalidade: infraestrutura dimensionada, manutenção, backup e suporte com horários/limites definidos.
- Adicionais: integrações novas, horas de trabalho, espaço ou usuários extras, conforme custo real.

O preço precisa cobrir infraestrutura, armazenamento, manutenção, licenças e trabalho. Não há capacidade comercial ou preço mínimo homologado neste projeto. Não anunciar recursos ilimitados nem SLA antes de medi-los.

Antes da primeira contratação, preencher identificação das partes, escopo, preço, prazo, disponibilidade, manutenção, suporte, responsabilidades, proteção de dados, exportação, cancelamento e exclusão. Este roteiro prepara as decisões; não é um contrato assinado ou parecer jurídico.

## Encerramento de um cliente

Suspender acessos, revogar chaves e vínculos, interromper automações e combinações de compartilhamento. Preparar exportação e conferir recuperação com o responsável. Aplicar o prazo de retenção acordado; não apagar volumes, backups ou contas reais automaticamente durante testes. Exclusão definitiva exige procedimento próprio e autorização.
