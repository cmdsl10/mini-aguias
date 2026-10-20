# Critérios de ativação da sincronização Masters

**Competição:** AF Porto Campeonato Distrital de Masters, 2.ª Divisão, Série 2, 2026/27 (Zerozero edição 224121).

## Estado de produção
O site já apresenta a classificação a zero como válida. A sincronização automática **não está ativa**. Não existe feed estruturado verificado nem mecanismo de leitura autorizado e estável demonstrado.

## Fonte
- Referências: https://www.zerozero.pt/edicao/af-porto-campeonato-distrital-de-masters-2-divisao-serie-2-2026-2027/224121 e correspondente oGol.
- Não usar páginas de pesquisa/cache como API operacional: podem estar desatualizadas e apresentam divergências de horários.
- Não tratar ausência de resultados como falha: classificação com 12 equipas e zeros é legítima.
- Não atribuir à ordem interna dos 12 registos de Supabase o estatuto de posição oficial enquanto a fonte não atribuir classificação distinta.

## Publicação segura
1. Extrair de fonte estável e permitida, com identificação da edição e carimbo temporal.
2. Mapear explicitamente os 12 nomes para os registos existentes; rejeitar ambiguidades.
3. Verificar campos e coerência estatística; gerar diff sem escrita.
4. Não substituir horários confirmados, cartazes ou dados manuais.
5. Só depois ativar credenciais server-side, logging, idempotência e agendamento em Europe/Lisbon.
6. Em falha, não publicar alterações; conservar a última versão válida.

## Gate pendente
Acesso técnico estável e autorizado aos dados da competição, com amostra real, e ensaio completo antes de qualquer escrita automática.
