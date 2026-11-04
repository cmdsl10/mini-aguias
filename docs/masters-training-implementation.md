# Área Masters — implementação faseada

## Estado
Branch isolada `feature/masters-training-management`. Este documento é o contrato funcional inicial; nenhuma migração foi aplicada nem a produção alterada.

## Contexto verificado
Site estático com `index.html`, Supabase para autenticação/dados e Vercel para publicação. O README documenta `app_metadata.role=admin`; as migrações no repositório não constituem um esquema completo.

## Requisitos acordados
- Navegação: botão **Masters** junto a **Login Admin**, distinto da área pública Masters.
- Uma única autenticação, reutilizando Supabase Auth. Utilizadores autorizados: jogadores Masters e administradores; verificação efetiva por RLS no servidor/base de dados.
- Época 2026/27; treinos às quartas-feiras a partir de 2026-10-21; só criar falta após fecho do treino. Cancelado não penaliza.
- Importar 26 atletas da última folha de `Treinos_103416.xlsx` após validação de correspondências e duplicados; não publicar dados pessoais.
- Cada célula atleta × treino tem estado `pending|present|absent|excused`; pagamento de falta é dimensão separada, não substitui a ausência.
- Falta não justificada: 1,00 EUR. Pagamentos podem ser parciais; alocar valores a faltas específicas, permitindo distinguir visualmente falta por pagar / parcialmente paga / paga.
- Administrador regista e corrige pagamentos com histórico auditável. Jogadores autorizados consultam toda a equipa sem editar.
- Pé de Chumbo: selecionar um atleta por treino; JPG carregado manualmente, em bucket privado, visualizado com URL assinada ou acesso autenticado; destaque da semana e arquivo histórico.
- Estatísticas: presenças, faltas, classificação de assiduidade, totais cobrados e em dívida; excluir treinos pendentes/cancelados dos denominadores.
- Resumo semanal exportável para WhatsApp; primeiro manual, depois avaliar automação. Consentimento e visibilidade dos saldos da equipa a validar.

## Ordem de execução
1. Auditar código real de autenticação, navegação e dados; mapear tabelas e políticas existentes.
2. Desenhar migração aditiva e testes RLS para papéis admin/jogador/não autorizado.
3. Criar componentes de navegação/login e grelha de presenças.
4. Implementar lançamentos financeiros transacionais e histórico de auditoria.
5. Importar jogadores, testar datas e cálculos; sem gerar faltas por defeito.
6. Criar upload JPG privado, destaque Pé de Chumbo e histórico.
7. Gráficos e exportação semanal.
8. Testes de segurança e usabilidade móvel; PR e publicação apenas após revisão.

## Critérios de aceitação críticos
- Sem sessão ou sem autorização: nenhuma leitura de dados Masters (inclusive por chamadas diretas à API).
- Jogador autorizado: leitura, sem capacidade de alterar presenças, pagamentos ou imagens.
- Admin: alteração auditada; uma falta paga continua a contar como falta.
- Exemplo: 3 faltas, 2 EUR alocados a duas faltas = duas células pagas, uma por pagar, saldo 1 EUR.
- Treino pendente não gera dívida; treinos cancelados não contam.
- Upload apenas JPG válido, tamanho limitado e acesso privado.
- A alteração não pode afetar login Admin, sócios, quotas, galeria ou classificação Masters pública.
