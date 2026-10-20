# Sincronização Masters — plano de implementação (não publicado)

## Âmbito
AF Porto Masters 2.ª Divisão Série 2 2026/27. Duas execuções semanais no fuso Europe/Lisbon: domingo às 21:00 e segunda-feira às 08:00. Atualizar próximo jogo e classificação geral **apenas após confirmação da fonte**.

## Estado verificado em 2026-10-20
- Supabase do projeto mini-aguias: `public.games` e `public.masters_standings`.
- 12 equipas na classificação 2026/27 Série 2; nenhuma com jogos contabilizados.
- Jogos de outubro: Lavrense (17/10), A.D.U. Paiço (24/10, 19:15 hora de Lisboa, cartaz existente), Juv. Ribeiras (31/10, provisório).
- O site lê `masters_standings`; sem sincronizador externo identificado.

## Requisitos antes de ativar escrita
1. Identificar fonte autorizada/estável de classificação e calendário (preferir AF Porto; Zerozero apenas para confronto). Confirmar permissão e método de acesso.
2. Criar extrator e testes com amostras reais; validar nomes de equipas, jornadas, fusos, pontuação, resultados e empates.
3. Comparar com a última versão conhecida e guardar registo de execução, fonte, instante e divergências.
4. Nunca substituir valores não-zero por zeros devido a falha, indisponibilidade ou ausência de publicação. Nunca apagar jogos ou cartazes por omissão na fonte.
5. Preservar `time_confirmed`, `manually_confirmed_at`, `poster_url` e correções manuais. Datas provisórias não substituem datas confirmadas.
6. Efetuar escrita apenas do lado do servidor com segredo em ambiente protegido; nunca colocar service_role no navegador, no GitHub ou em logs.
7. Garantir idempotência, validação de alterações anómalas, logs e rollback. Ensaiar primeiro em modo dry-run e comparar dados antes/depois.
8. Configurar agendamento com suporte explícito ao fuso Europe/Lisbon e mudança de hora de verão/inverno. Cron UTC fixo não preserva 21:00/08:00 locais todo o ano.
9. Só ativar em produção depois de testes e aprovação.

## Estado
Documento de preparação. Nenhum job de escrita ou publicação foi ativado por este commit. As verificações agendadas no ChatGPT são independentes da atualização do site.
