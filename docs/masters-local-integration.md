# Masters — validação local real e resolução do bloqueio

Estado de 04/11/2026, branch `feature/masters-training-management`.
**Bloqueio local resolvido. 16 cenários de integração real PASS, três cenários
concorrentes PASS, 82 verificações PGlite PASS. Nenhuma migração remota,
publicação, push ou merge.**

## Diagnóstico e correções do ambiente

- Docker Desktop 4.97.0; cliente/motor Docker 29.9.2, contexto desktop-linux.
  Motor operacional em WSL2. O serviço Windows com.docker.service aparecia parado,
  mas o backend Docker estava operacional: isso não impediu os testes.
- Supabase CLI 3.0.0 já instalado em cache npm, embora ausente do PATH. Foi
  reutilizado sem instalar dependências do projeto nem ligar um projeto remoto.
- PostgreSQL nativo 17.11. A pasta temporária inicial sob o perfil restrito
  falhava por permissões. As pastas descartáveis passaram para test-results/.
  A inicialização com sincronização ultrapassava o limite de 40 segundos;
  `--no-sync` completou-a. É uma opção só para estas bases descartáveis, nunca
  uma recomendação para produção. A hipótese de gargalo de sincronização é
  compatível com esse resultado; não foi demonstrada uma causa de disco/antivírus.
- O leitor dos logs também falhava: o initdb Windows emitia bytes de outra
  codificação, não UTF-8. A leitura agora tolera esses bytes sem abortar o teste.
- Não se reutilizaram 5432/54321/54322/54323: estavam ocupadas por PostgreSQL e
  outros ambientes locais. O laboratório Masters usa 57421/57422/57424 e o site
  de ensaio usa 57430. Não se pararam ou apagaram outros projetos.
- Foi demonstrado outro conflito: wslrelay.exe escutava em 127.0.0.1 e ::1,
  enquanto com.docker.backend.exe escutava nos mesmos números de porta em ::.
  Acesso a 127.0.0.1 começou a falhar com reset/timeout; dentro do contentor o
  Auth estava saudável, e 127.0.0.2 respondia HTTP 200. O ensaio foi configurado
  em 127.0.0.2, incluindo os emails. Nenhum encaminhamento WSL global foi alterado.
- Recursos observados: cerca de 9,3 GiB de memória física livre e 299 GiB de
  disco livre; Docker com cerca de 15,6 GiB e oito CPUs. Não houve evidência
  de falta de memória ou espaço que justificasse apagar volumes.

## Isolamento e serviços reais

Projeto exclusivamente local: `mini-aguias-masters-integration-20261104`.
Pasta: `test-results/masters-integration-lab`. API usada pelos testes:
`http://127.0.0.2:57421`; SMTP de teste/Mailpit em 57424.

Versões efetivamente usadas: Supabase Postgres 17.11.0.011, GoTrue 2.197.0,
PostgREST 16.5, Storage API 1.88.0, Mailpit 1.31.3 e Kong 2.8.1.
O laboratório inclui apenas DB, Auth, REST, Storage, gateway e caixa SMTP local.
Não se iniciou um segundo Studio, Realtime ou conjunto de analytics.

A produção foi consultada **apenas para metadados de esquema**: 20 tabelas,
uma vista, funções, índices, triggers, grants e políticas. Nenhum registo de
pessoa, pagamento, token ou ficheiro foi copiado. As permissões locais foram
revogadas e repostas conforme o snapshot, evitando permissões adicionais vindas
por defeito do CLI. Os snapshots e o SQL gerado estão em test-results/, ignorados
pelo Git. Este repositório continua sem todo o histórico de migrações do clube.

Foram criados apenas utilizadores `@example.test`, nomes e pagamentos fictícios.
A importação real utilizou um XLSX gerado com 28 nomes fictícios e o leitor
SheetJS existente. As funções dos dois últimos membros foram configuradas como
coach/president, com elegibilidade pendente. A composição real de 26 jogadores,
Seabra médio, Aires treinador e Pereira presidente continua coberta pelos testes
locais de domínio e pela lista confirmada; o original não foi alterado.

Não houve respostas HTTP simuladas no ensaio de integração. O site foi servido
por uma cópia em memória, com URL/chave pública locais. A chave service_role
ficou no preparador Node, nunca no HTML. O servidor de teste recusa servir a
pasta test-results/ ou ficheiros de configuração. Pedidos para produção eram
bloqueados e a contagem observada foi zero.

## Resultado final por cenário de integração real

| Estado | Cenário |
| --- | --- |
| PASS | Real Auth: correct credentials, invalid password, four distinct profiles |
| PASS | Real XLSX reader → 28 fictional members → HTTP/PostgreSQL insert |
| PASS | Real RLS: visitor, outsider, reader, admin and unsupported editor |
| PASS | Real training closure, pending staff and future/cancelled restrictions |
| PASS | Real partial payments, double-payment refusal, reversals and preserved audit |
| PASS | Real HTTP RLS matrix over all six private tables and unauthorized RPCs |
| PASS | Real private JPEG Storage: admin upload, authorized download, public/outsider/write refusal |
| PASS | Real Masters UI: paid absence blue, archive JPEG, logout and reader access, mobile/desktop |
| PASS | Real membership revocation with an existing JWT immediately removes private reads |
| PASS | Real member account linkage, dues/card and self-service updates/photo |
| PASS | Real existing account claims its subsequently registered member record |
| PASS | Real member signup, local SMTP confirmation and automatic account linkage |
| PASS | Real password recovery through local email, update and login with new password |
| PASS | Real public fixtures: history, fishing, season/team and published gallery JPEG |
| PASS | Real public membership application and email-validation request are stored privately |
| PASS | Real public-site navigation and no production requests / JavaScript errors |

Além destes 16 cenários, `tests/masters-concurrency.py` passou em PostgreSQL
independente real, tanto por Docker como por arranque nativo corrigido:

1. Dois pagamentos para a mesma falta: um commit, uma recusa, sem movimento extra.
2. Pagamento em paralelo com cancelamento: o cancelamento é recusado após o pagamento.
3. Correção à espera do bloqueio do jogador: uma falta paga não pode virar presença.

A versão final observa efetivamente uma sessão à espera de lock, em vez de
inferir concorrência apenas pelo momento do arranque. Cada cluster descartável
foi encerrado depois dos testes; o contentor temporário era exclusivo, sem rede
ou volume persistente existente, e removia-se ao terminar.

## Falhas encontradas, corrigidas e retestadas

| Estado inicial | Problema | Estado final |
| --- | --- | --- |
| BLOCKED | Permissões da pasta temporária, timeout do initdb e falha de leitura dos logs Windows | PASS: Docker e nativo corrigidos |
| FAIL | Esquema de ensaio sem terminadores de função e sem vista dependente | PASS: preparação completa, transações anteriores revertidas |
| FAIL | Confirmação local desligada por defeito, sem mensagem SMTP | PASS: confirmação ativa só no laboratório |
| BLOCKED | Encaminhamento WSL interferia com 127.0.0.1 | PASS: loopback 127.0.0.2, sem alterar outros serviços |
| FAIL | Retorno /#area-socio recebia um segundo # antes de access_token; sessão não era criada | PASS: retorno para /, validado por email real local |
| FAIL | PASSWORD_RECOVERY chamava showView fora do âmbito da função | PASS: navegação pelo evento de hash existente e mudança de palavra-passe real |
| FAIL | loadPublic sobrescrevia a galeria privada do content.js com image_url vazio | PASS: um único módulo apresenta a galeria/história e o carregador geral reutiliza-o |
| FAIL | Teste verificava quotas antes da resposta, selecionava dois botões de saída ou não recarregava após preparar conteúdo | PASS: esperas e seletores corrigidos, sem reduzir as verificações |
| FAIL | Preparador tentava inserir classificação pública como administrador de browser | PASS: recusa esperada validada; seed feito só no preparador com service_role |

As três correções funcionais do site estão no código local: links de retorno de
Auth, recuperação sem função fora de âmbito e apresentação única da galeria.
A regressão também confirma que chamar loadPublic não destrói as fotografias
privadas múltiplas já apresentadas.

## Outras verificações, sem confundir com integração real

- **PASS** — 82 verificações PostgreSQL/PGlite, usando Auth e Storage simplificados
  nesse teste. O número 82 não é apresentado como 82 testes HTTP reais.
- **PASS** — cálculos, lista de 28, funções/posição, elegibilidade e importação no
  browser com cliente simulado, mais regressão de edição de história/galeria.
- **PASS** — sintaxe dos scripts externos e cinco scripts inline do index.html;
  análise sintática Python e git diff --check.
- **PASS** — larguras 360/390/768/1280 px no Chrome; imagem JPG real descodificada.
- **BLOCKED** — nenhum bloqueio técnico local permaneceu no âmbito executado.
- **NOT TESTED** — execução em Supabase remoto/produção, contas reais dos membros,
  entrega de email pela infraestrutura externa e aparelhos físicos/Safari.
  Estes itens não são convertidos em PASS por existirem testes locais.
- **NOT TESTED** — publicação, merge e migrações remotas: não foram executados por
  instrução expressa. Impressão física e pagamentos bancários/MB WAY não fazem
  parte dos cenários exercitados.

## Evidência e reprodução

- `test-results/masters-real-integration.json`: 16 PASS, zero FAIL; requests sem mocks.
- `test-results/masters-concurrency.json`: três cenários concorrentes PASS.
- `test-results/masters-native-diagnostic.json` e pasta masters-native-diagnostic-*/:
  prova de inicialização com --no-sync.
- `test-results/masters-real-integration-mobile.png`: captura do browser real.
- `test-results/masters-integration-failure*`: diagnóstico das falhas anteriores,
  conservado como histórico; não é o resultado final.

Com os snapshots locais presentes, `python tests/masters-prepare-baseline.py`
prepara apenas SQL num ficheiro, sem contactar qualquer base. Nunca executar esse
SQL em produção ou numa base com dados. No laboratório novo, aplicar a migração
Masters e o baseline uma única vez. O runner precisa da base fictícia limpa:
numa repetição, confirmar o label exato do contentor antes de limpar os seus
fixtures. Não executar resets na pasta supabase/ principal do clube.

CLI usado nesta máquina:
`C:/Users/CM/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe`.

Arranque local, a partir da raiz do repositório:

```powershell
& '<CLI acima>' start --workdir 'test-results/masters-integration-lab' --exclude 'realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'
& '<CLI acima>' status --workdir 'test-results/masters-integration-lab' -o json > test-results/masters-local-runtime.json
node tests/masters-integration.cjs
python tests/masters-concurrency.py
```

Os valores runtime são credenciais apenas locais e ficam em test-results/.
Não os publicar. Em PowerShell antigo que escreva UTF-16, guardar o JSON em UTF-8.
MASTERS_PG_DOCKER=1 seleciona a variante Docker do teste concorrente; por defeito
usa PostgreSQL 17 local e MASTERS_PG_BIN pode indicar outra pasta de binários.

No fim deste trabalho o laboratório foi **encerrado sem apagar volumes**.
Ficaram conservados exclusivamente os volumes
`supabase_db_mini-aguias-masters-integration-20261104` e
`supabase_storage_mini-aguias-masters-integration-20261104`. Outros projetos,
bases, contentores e volumes não foram parados ou eliminados.

## Custo e alternativa remota

Recomendação: continuar com o laboratório local já validado. **Custo incremental
Supabase: US$0; nenhum recurso pago criado.** Um projeto remoto não foi necessário
para resolver este bloqueio.

Preços oficiais consultados em 04/11/2026, apenas como alternativa: plano Free
US$0, até dois projetos ativos, 500 MB de base, 1 GB Storage, 50 mil utilizadores
ativos mensais, 5 GB de egress e pausa após uma semana de inatividade. Pro desde
US$25/mês; projetos adicionais desde US$10/mês. Não se presume vaga gratuita nem
crédito disponível nesta conta; qualquer custo efetivo teria de ser confirmado
antes de criar recursos. [Preços oficiais](https://supabase.com/pricing).
[Desenvolvimento local oficial](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Decisões restantes

- Direção decidir a elegibilidade de Aires/Pereira; continuam por decidir, sem
  faltas nem dívida, sem presumir isenção definitiva.
- Confirmar identidades e contas reais antes de qualquer associação em produção.
- Revisão humana da versão local e aprovação separada para migração de produção,
  publicação ou merge. Nenhuma dessas operações foi autorizada ou executada.
