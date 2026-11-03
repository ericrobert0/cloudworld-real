# Piloto assistido do CloudWorld

O CloudWorld entrega a infraestrutura digital pronta para a empresa começar a operar. Cada empresa recebe seu ambiente, seu portal e acessos individuais. O operador configura as ferramentas, ensina a equipe a usar o que ela precisa e cuida da manutenção.

## Apresentação com as ferramentas reais

Use a empresa de apresentação com dados fictícios. Combine uma sessão curta e abra o portal antes da reunião para confirmar que o Codespace está ativo. Explique que a hospedagem da sessão é temporária e que a operação diária depende do servidor definitivo.

1. Entre pelo portal da empresa e abra o Chatwoot com uma conta de atendimento. Use a caixa de teste preparada pelo operador.
2. Crie um contato fictício com um identificador único, como `CW-PILOTO-20261102-01`. Busque o mesmo contato no ERPNext. Se a captura estiver habilitada, mostre no painel privado a entrega da integração e confira que ela foi concluída.
3. Abra o Nextcloud e salve um arquivo de teste. No Postiz, mostre um rascunho sem publicar. Se a empresa não precisar dessas rotinas no começo, mostre onde ficam no portal e siga para o próximo passo.
4. Peça à pessoa para repetir uma tarefa sem sua ajuda. Registre onde ela travou e quais ferramentas ela usaria na primeira semana.

Se a integração falhar, registre a falha e a etapa em que ocorreu. Antes da reunião, execute `node scripts/Check-ERPIntegration.mjs apresentacao` para verificar o acesso ao ERP. Confira separadamente o fluxo completo no ambiente que será apresentado.

## Entrada da primeira empresa

- Defina quem vai usar o ambiente e quais tarefas precisam funcionar desde o primeiro dia. Use o [roteiro de entrada](ENTRADA-DE-CLIENTES.md) para provisionar e entregar as contas.
- Combine por escrito o que entra na implantação, o que a mensalidade cobre e quem responde pelo suporte. Ative as ferramentas conforme as necessidades da empresa.
- Antes de receber dados reais, valide hospedagem contínua, isolamento entre empresas, acessos, recuperação de backup e alertas no servidor definitivo. Use os [critérios de entrega](ENTREGA-E-OFERTA.md) para liberar o uso.

## Registro do piloto

Preencha no início, após uma semana e ao fechar o primeiro mês. Guarde o registro em local privado e use um identificador de empresa, sem senhas ou dados de clientes finais.

| Medida | O que registrar |
| --- | --- |
| Tempo de implantação | Horas de configuração, treinamento e correções até a entrega |
| Primeiro uso independente | Data e tarefa que a pessoa concluiu sem ajuda |
| Uso recorrente | Quais tarefas a equipe repetiu e em quais semanas |
| Suporte | Quantidade de chamados, horas gastas e motivos mais frequentes |
| Custo da operação | Hospedagem, backup, licenças e horas de suporte atribuídas à empresa |
| Continuidade | Valor apresentado, decisão de continuar e motivo nas palavras do responsável |

Ao encerrar, confira se a empresa conseguiu trabalhar sozinha nas tarefas combinadas, se quer continuar pagando e se a mensalidade cobre o custo de atendê-la. Use os resultados para ajustar o pacote antes de ampliar a oferta.
