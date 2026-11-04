# Masters privados — implementação local e revisão

## Publicação concluída — 04/11/2026

**PUBLICADO:** https://mini-aguias.vercel.app/#masters-private .
Migração 20261104125552 aplicada pelo CLI no projeto correto, PR #1 integrado,
Vercel production READY no commit funcional 1e3a0e0. Sete cenários online PASS;
RLS e finanças na base remota PASS com rollback. Backup protegido recuperado e
22 fingerprints de dados existentes preservados. Plantel privado com 28 membros,
37 treinos abertos e nenhuma falta, pagamento ou dívida inicial.

Contas dos jogadores continuam sem associação automática. Aires/Pereira com
elegibilidade pendente. Login positivo/upload com conta real em produção e
aparelhos físicos são NOT TESTED; não são inferidos dos testes de base de dados.
[Relatório final de produção](masters-production-release.md).

O restante documento conserva o histórico das fases anteriores e seus bloqueios,
que foram entretanto resolvidos; não descreve o estado atual da publicação.

## Publicação autorizada — backup validado; confirmação da migração pendente

Autorização expressa recebida em 04/11/2026. Alvos confirmados e testes repetidos.
Backup específico autorizado, protegido e recuperado com sucesso. A migração
continua sem aplicação: o conector Supabase devolveu confirmação expirada nas
duas tentativas. Produção ainda não alterada; não contornar essa confirmação. [Preparação e desbloqueio](masters-production-release.md).

## Resultado mais recente — bloqueio resolvido em 04/11/2026

**PASS: 16 cenários de integração HTTP/browser real, três cenários de concorrência
com PostgreSQL independente e 82 verificações locais PGlite.** Auth, PostgREST,
Storage, SMTP local e fluxos de sócio foram exercitados com dados fictícios.
Os testes simulados são apresentados separadamente no relatório detalhado.

Correções adicionais: links de confirmação/recuperação deixam de usar fragmento
antes do token; recuperação deixa de chamar uma função fora do âmbito; a galeria
já não é sobrescrita pelo carregador antigo. Testes reais e regressão repetidos.

Laboratório Supabase exclusivamente local criado e testado; encerrado no fim,
com volumes preservados. Produção consultada só para definições de esquema,
sem cópia de registos ou ficheiros e sem escrita remota. Nenhum recurso pago.
O projeto remoto de ensaio deixou de ser necessário para resolver o bloqueio.

[Diagnóstico, matriz PASS/FAIL/BLOCKED/NOT TESTED e reprodução](masters-local-integration.md).
[Estado do ensaio e limites para operações remotas](masters-remote-rehearsal.md).

Permanecem decisões humanas sobre elegibilidade de Aires/Pereira, confirmação de
contas reais e eventual aprovação de migração/publicação/merge. Estes membros
continuam por decidir, sem gerar dívida. Não houve publicação, push ou merge.

Ficheiros alterados nesta fase: `index.html`, `content.js`,
`tests/content-browser.cjs`, `tests/masters-concurrency.py`,
`tests/masters-integration.cjs`, `tests/masters-prepare-baseline.py` e os documentos
`masters-local-integration.md`, `masters-validation.md`,
`masters-remote-rehearsal.md`, `masters-next-step.md`. As restantes alterações
locais já existiam ao iniciar este pedido e foram preservadas.

---

## Auditoria anterior — estado entretanto ultrapassado

**Validação local aprovada; aprovação de publicação ainda depende de ensaio real.**
Branch confirmada: `feature/masters-training-management`. Há alterações locais
anteriores e novas ainda sem commit; foram preservadas. Não houve push, merge,
publicação, criação de recursos externos nem execução de SQL remoto nesta fase.

### Corrigido nesta auditoria

- A lista passa efetivamente a guardar `sports_role` (player/coach/president),
  `playing_position` e `attendance_eligible`. Importação: 26 jogadores incluídos,
  Seabra médio, Aires treinador e Pereira presidente com elegibilidade nula.
  O original não foi alterado. A pré-visualização identifica estas funções.
- Elegibilidade configurável por administrador: por decidir / incluído / excluído.
  Nula ou falsa impede marcações não pendentes e pagamentos na base de dados,
  não exige marcação ao fechar treinos e não gera dívida ou taxa de assiduidade.
  Não se presume isenção definitiva para treinador/presidente.
- A alteração de elegibilidade é recusada quando há marcações em treinos fechados.
  Para corrigir, reabrir os treinos afetados e estornar pagamentos primeiro.
  Função desportiva não autoriza gestão. Não foi criado perfil de editor:
  continua a existir administrador ou membro autorizado apenas para consulta.
- Índice único de nome normalizado na base de dados impede duplicações também
  fora da interface; identidade do membro fica protegida contra alteração.
- Falta paga continua a contar como falta e passa a ter fundo azul; presença
  permanece verde, falta não paga vermelha e pendente neutra.
- Migração candidata existente atualizada localmente (nunca aplicada no remoto).
  Continua aditiva e sem alterações às tabelas públicas Masters ou de sócios.

### Verificação executada nesta fase

- `npm test`: **82 verificações PostgreSQL/PGlite aprovadas**, testes de domínio,
  composição de 28 membros e browser aprovados. Não reutilizamos o resultado
  antigo de 68 como validação das alterações novas.
- Testes novos: função inválida, nome duplicado normalizado, identidade imutável,
  elegibilidade pendente/excluída, fecho sem penalizar staff, inclusão explícita,
  pagamento parcial e proteção contra alteração retroativa; papel editor não
  recebe acesso por existir no JWT. RLS e Storage continuam cobertos.
- Browser repetido após as últimas alterações: roles/posição da lista completa,
  edição da elegibilidade do treinador, recusa de rodapé mesmo com 28 entradas,
  pagamentos azuis, navegação para área de sócios e futebol público, limpeza de
  dados privados e larguras 360/390/768/1280 px aprovados, sem erros JavaScript.
- `node tests/content-browser.cjs`: regressão de história/galeria aprovada.
  A área de sócios recebeu teste de navegação, não um ensaio completo do cartão,
  quotas, recuperação de conta ou email com serviços reais.
- Sintaxe JavaScript, compilação do teste Python e `git diff --check` aprovados.

### Limitações e falhas registadas

Ensaio de concorrência preparado em `tests/masters-concurrency.py`, com cluster
PostgreSQL 17 temporário, ligações independentes e dados fictícios. A primeira
inicialização falhou por permissões na pasta temporária; as seguintes excederam
40 segundos, incluindo tentativa com execução autorizada fora da restrição.
Nenhum cluster de teste chegou a arrancar e nenhum cenário concorrente foi
executado. O processo `initdb` bloqueado identificado pela pasta deste teste
foi encerrado; o PostgreSQL preexistente não foi alterado. Resultado explícito
BLOCKED em `test-results/masters-concurrency.json`. O script foi verificado
sintaticamente; os seus cenários não estão validados neste computador.

Os bloqueios e transações SQL foram revistos e os invariantes testados de forma
sequencial, mas isso não prova a segurança entre sessões concorrentes reais.
Auth e HTTP Storage continuam simulados no browser; bucket privado e RLS são
validados no PostgreSQL, não por tentativas HTTP contra um Storage de ensaio.

### Ambiente remoto e decisões necessárias

Inventário Supabase consultado apenas em leitura: projetos `mini-aguias`
(`dchthzmnldvvwnmhhlvf`) e `meu-studio` (`zmbptxjvrwtwjhxyzpyf`). Não há branch
de desenvolvimento do mini-aguias. `meu-studio` não foi presumido descartável
nem usado. Não existe um alvo de homologação identificado como apropriado.

1. Direção decidir se Aires e Pereira entram no controlo de faltas/pagamentos;
   até lá, ficam por decidir, sem dívida. Esta decisão não bloqueia o código local.
2. Aprovar um novo ambiente de homologação e o respetivo custo/permissões, ou
   indicar um alvo descartável já autorizado. Antes de criar recursos, confirmar
   custo concreto. Só depois aprovar/aplicar a migração nesse alvo isolado.
3. Executar Auth/Storage e concorrência reais, confirmar contas dos membros e
   completar a revisão humana. Publicação e merge para main exigem aprovação
   separada. Ainda não se declara pronto para publicar.

### Ficheiros desta continuação

`masters.js`, `masters-domain.js`, `masters.css`,
`supabase/migrations/20261104125552_masters_private_training_management.sql`,
`tests/masters-db.cjs`, `tests/masters-domain.cjs`, `tests/masters-browser.cjs`,
`tests/masters-concurrency.py`, `docs/masters-confirmed-roster.json`,
`docs/masters-validation.md`, `docs/masters-remote-rehearsal.md` e
`docs/masters-next-step.md`. Os restantes ficheiros modificados já constavam
no estado inicial desta auditoria. Evidência e capturas em `test-results/`.

---

## Registo das fases anteriores

Estado em 04/11/2026: implementado e testado localmente na branch
`feature/masters-training-management`. Não aplicado ao Supabase remoto,
não enviado ao GitHub e não publicado. Nenhum merge efetuado.

## Implementado

- Botão Masters junto ao acesso administrativo; área privada independente do futebol público.
- Mesma sessão Supabase Auth. Administradores por `app_metadata.role=admin`;
  jogadores por associação explícita e ativa entre `masters_players.auth_user_id`
  e a conta autenticada. Metadados editáveis do utilizador não autorizam acesso.
- RLS em seis tabelas novas; visitantes e contas externas não leem dados;
  jogadores autorizados só consultam; administradores editam. Desativar um
  jogador retira acesso através da associação na base de dados.
- Preparação de 37 quartas-feiras, de 21/10/2026 a 30/06/2027, sempre abertas.
  O final de junho é o limite usado para a época 2026/27 e pode ser ajustado.
  A preparação não cria faltas nem dívida automaticamente.
- Grelha com presença, falta, justificação e estado pendente. Não se fecha um
  treino futuro ou com jogadores ativos por marcar. Cancelados não penalizam.
- Faltas não justificadas de 100 cêntimos, exclusivamente após fecho.
  Valores financeiros usam inteiros. Pagamentos parciais e totais aparecem
  na célula respetiva, preservando o estado de falta.
- Registo transacional de um pagamento com alocações por falta. A interface
  lança por célula; a função suporta várias alocações num único recebimento.
  Validação na base de dados impede pagamentos cruzados, valores negativos,
  sobrealocação e pagamentos a treinos abertos/cancelados. Bloqueios por jogador
  serializam alterações financeiras; treino e presença também são bloqueados.
- Estorno com motivo e histórico permanente do original. Para corrigir uma
  falta paga ou reabrir/cancelar o treino é necessário estornar primeiro.
- Pé de Chumbo por treino, upload manual JPG até 5 MB, bucket privado e
  leitura autenticada. O browser verifica assinatura e descodificação JPEG;
  o Storage limita MIME/tamanho/extensão. Só administradores carregam ficheiros.
- Arquivo do Pé de Chumbo, últimas 100 alterações auditadas, assiduidade,
  faltas, recebido e dívida. Treinos abertos/cancelados são excluídos das estatísticas.
  Justificadas contam no denominador de assiduidade, mas nunca geram dívida.
- Resumo semanal copiável para WhatsApp, sem saldos individuais e sem envio automático.
- Importador Excel reutiliza o leitor já existente no site: última folha,
  escolha da coluna/primeira linha, pré-visualização e confirmação de 26 nomes
  distintos. Bloqueia nomes já existentes. Não associa contas automaticamente.

## Inspeção remota, apenas leitura

Projeto confirmado: `dchthzmnldvvwnmhhlvf`, PostgreSQL 17.
As tabelas públicas `masters_standings` e `masters_round_results` já existem,
têm RLS e são de consulta pública. Não foram alteradas nem usadas para dados
financeiros. As seis tabelas privadas, funções `masters_*` e bucket
`masters-lead-foot` ainda não existem no remoto.

As políticas atuais de imagens estão limitadas aos buckets existentes e não
concedem leitura pública ao novo bucket. A autorização administrativa existente
usa `app_metadata.role`. Nenhum dado pessoal dos jogadores foi exportado.

A migração aditiva completa é
`supabase/migrations/20261104125552_masters_private_training_management.sql`.
É a fonte canónica; o ficheiro antigo em `supabase/drafts/` permanece apenas
como documento histórico e **não deve ser aplicado em conjunto**.
As migrações antigas do clube não estão todas no repositório; não executar
um reset nem tratar esta pasta como esquema completo do site.

## Testes executados

Instalar com `npm ci`; executar `npm test` (Node e Chrome instalados).
As únicas dependências novas são ferramentas de teste, fixadas no lockfile.

- `tests/masters-db.cjs`: 68 verificações num PostgreSQL isolado em memória
  (PGlite), aplicando a migração completa e políticas RLS reais.
  Testa admin, jogador, externo, visitante, conta anónima, tentativa de
  autorização via `user_metadata`, revogação, pagamentos, parciais, estornos,
  rollback, fecho de treinos e políticas Storage.
- `tests/masters-domain.cjs`: quartas-feiras, exemplo de 3 faltas/2 € pagos/1 €
  em dívida, parciais e denominadores das estatísticas.
- `tests/masters-browser.cjs`: Chrome com Supabase simulado; login/acessos,
  limpeza ao sair, jogador sem edição, texto malicioso, pagamentos, repetição
  da mesma operação após erro, JPG inválido/válido, importação com confirmação,
  bloqueio de duplicados, resumo e integração com a navegação real do site.
  Larguras 360, 390, 768 e 1280 px, sem transbordo horizontal da página.
- `node tests/content-browser.cjs`: regressão de história e galeria aprovada.
  O teste antigo foi atualizado para a sessão/rota administrativa atuais,
  seletor `clubHistory` e carregamento separado dos dois scripts externos.
- `node --check masters.js`, `node --check masters-domain.js` e `git diff --check`.

Limites: o Auth e o serviço HTTP Storage foram simulados nos testes de browser;
as suas políticas foram testadas no PostgreSQL, mas ainda falta um ensaio com
contas reais e Storage numa base de homologação aprovada. Concorrência entre
conexões independentes não foi exercitada pelo PGlite. O teste local não
substitui essa validação antes de produção. Não foi usado um projeto pago novo.

## Próximos passos que exigem intervenção humana

1. Lista confirmada pelo utilizador: 28 membros, incluindo Seabra (médio),
   ausente do original, Aires (treinador) e Pereira (presidente). Não excluir
   os dois membros separados pela linha vazia. Não é necessário reenviar o Excel.
2. Confirmar as contas Supabase de cada jogador antes de associar UUIDs.
3. Confirmar que os jogadores podem consultar saldos e histórico de toda a
   equipa, conforme o acesso solicitado. O resumo WhatsApp omite esses saldos.
4. Aprovar o ambiente e a aplicação da migração para ensaio remoto. Fazer
   backup e rever o esquema desse ambiente antes de executar. Não aplicar
   alterações sensíveis remotamente sem autorização.
5. Validar com contas reais e um JPG real. Rever o aspeto no telemóvel.
6. Só depois, com aprovação separada, enviar/publicar, fazer merge ou alterar produção.

Os JPG antigos são conservados no bucket privado para preservar referências do
histórico. Se uma resposta de gravação se perder, o ficheiro também é conservado
para evitar apagar uma imagem já gravada; eventuais órfãos são revistos manualmente.
O papel admin segue a validade do JWT existente; revogação administrativa exige
revogar sessões/renovar tokens. A revogação de um jogador via `active=false`
é verificada na base de dados em cada pedido.

## Continuação — original verificado em 04/11/2026

O anexo da conversa foi recuperado através do caminho temporário devolvido
pela aplicação; `/mnt/data/Treinos_103416.xlsx` não existe neste computador Windows.
SHA-256 do original: `e0c78500b489244c5e8f4ab4c97f2bee385e569751cd98e85ad47cbfc169c0e2`.
Leitura direta do XML do XLSX, sem modificar o ficheiro nem executar fórmulas.

- Cinco folhas; última `Folha1`. Cabeçalho em A1, 25 nomes em A2:A26,
  A27 vazia, Aires em A28 e Pereira em A29: **27 nomes distintos**.
- A30 é `TOTAL`; A31 é `Pé de Chumbo`, com `Ribeiro` em B31.
  Não são jogadores adicionais. `Miguel ` em A22 contém um espaço final,
  removido pela normalização já existente no importador.
- B1 é `Em divida`; C1:J1 são oito quartas-feiras, de 21/10/2026 a
  09/12/2026. As células dos jogadores em B2:J29 estão vazias, sem fórmulas:
  não existem presenças, faltas ou valores para migrar nesta folha.
  Células vazias não significam presença nem dívida zero confirmada.
- O importador local importa só nomes, não histórico financeiro nem Pé de Chumbo.
  Antes desta correção, selecionava até ao fim da folha e incluía os rodapés,
  apresentando 29 entradas e recusando-as. Agora permite definir a última linha,
  preserva a pré-visualização e mantém a exigência de 26 nomes distintos.
  Delimitar A2:A29 ainda produz 27 nomes e deve continuar a bloquear.
  Não se deve truncar a lista para contornar a divergência.
- Auditoria reproduzível: `python tests/masters-excel-audit.py CAMINHO_DO_ORIGINAL`.
  Evidência local em `test-results/masters-excel-audit.json` (não versionada).
  Não existe uma importação persistida local nesta aplicação: os testes de
  interface usam dados simulados. A comparação foi com a lógica de importação,
  não com registos reais Supabase.

Reexecução aprovada: 68 verificações PostgreSQL, domínio, browser Masters e
regressão de conteúdos. Depois da correção, o teste Masters passou novamente,
incluindo rodapés, bloqueio antes da delimitação, seleção da última linha,
importação de 26 nomes e rejeição de duplicados. O leitor XLSX permanece
simulado no teste de browser; a leitura do original foi validada separadamente.

Ensaio remoto descrito em [plano de homologação](masters-remote-rehearsal.md),
incluindo o risco do URL de produção fixo no `index.html` e a configuração
da cópia isolada. Preparado documentalmente; não executado remotamente.

Referências oficiais verificadas: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage](https://supabase.com/docs/guides/storage/security/access-control),
[changelog TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) e
[PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

## Esclarecimento do utilizador — lista de 28 membros

A contagem correta é 26 jogadores + Aires (treinador) + Pereira (presidente).
Seabra (médio) falta no Excel original; os 27 nomes existentes permanecem.
A linha vazia separa treinador/presidente, não indica exclusão.
Lista completa preparada em `docs/masters-confirmed-roster.json`, com funções
apenas quando explicitamente confirmadas. Estas funções não são papéis de acesso
nem foram acrescentadas ao esquema de permissões.

O importador exige agora 28 nomes distintos, recusa cabeçalhos/rodapés e permite
acrescentar um nome em falta antes da confirmação. Para o original: coluna A,
linhas 2 a 29, nome adicional Seabra. A pré-visualização mostra os 28 e a gravação
usa uma única inserção; não é necessário alterar o original. Um Excel já completo
pode ser importado deixando o nome adicional vazio. Não foi feita importação real.
As referências anteriores a uma lista obrigatória de 26 descrevem o estado anterior.

Teste browser atualizado: 27 nomes com linha vazia e rodapés, recusa de contagem
incompleta, inclusão de Seabra, importação dos 28 e recusa de duplicação.
