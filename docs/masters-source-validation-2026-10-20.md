# Validação da fonte — Masters Série 2 (20-10-2026)

## Fonte candidata
Zerozero: https://www.zerozero.pt/edicao/af-porto-campeonato-distrital-de-masters-2-divisao-serie-2-2026-2027/224121

## Observações
- A classificação acessível da Série 2 apresenta 12 equipas com 0 jogos e 0 pontos, apesar de a jornada 1 estar datada de 17/10/2026.
- Versões indexadas da página apresentam horários divergentes para a jornada 2; portanto, não são autoridade suficiente para alterar horários confirmados manualmente.
- A página identifica a competição e as equipas, mas não garante dados atualizados nem fornece neste teste um endpoint estruturado estável ou licença de ingestão.

## Decisão técnica
**Não ativar importação de escrita** até existir fonte validada, com confirmação de atualidade e condições de acesso.

## Critérios de aceitação para um adaptador de fonte
1. Recuperar 12 equipas e métricas J/V/E/D/GM/GS/Pts sem ambiguidades.
2. Rejeitar tabelas vazias, parciais, todas a zero depois de haver dados previamente confirmados, ou inconsistentes (J != V+E+D, pontos negativos, etc.).
3. Guardar snapshot e proveniência para auditoria; aplicar alterações apenas quando consistentes.
4. Identificar o jogo por época, competição, jornada e equipas; nunca por posição numa lista.
5. Respeitar campos manuais de jogo (poster_url, time_confirmed, manually_confirmed_at).
6. Executar dry-run comparativo e testes de falha antes de qualquer escrita.
7. Executar às 21:00 domingo e 08:00 segunda, Europe/Lisbon, incluindo transições de hora.

## Próximo passo
Validar acesso a fonte oficial AF Porto (ou exportação autorizada), recolher amostras de jornadas com resultados e testar um adaptador em modo leitura. Até lá, a verificação manual agendada no ChatGPT não equivale a sincronização do site.
