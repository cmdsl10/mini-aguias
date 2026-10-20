# Execução local dos testes — 2026-10-20

Foram obtidos os conteúdos dos quatro ficheiros da branch `feature/masters-weekly-sync-review` e reproduzidos localmente para execução com Node.js v22.16.0.

Comando: `node --test tests/*.test.cjs`

Resultado: **10 testes, 10 aprovados, 0 falhados, 0 ignorados**.

Âmbito: testes unitários dos módulos `validate-masters-standings.cjs` e `compare-masters-standings.cjs`. Não são testes de integração com o Zerozero, AF Porto ou Supabase; não validam um extrator de resultados nem executam qualquer escrita.

Próximo gate: obter amostra estruturada fiável da classificação, testar parsing e simular diff com snapshot real, sem alterações à base de dados.
