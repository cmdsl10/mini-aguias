# Masters — publicação em produção

Estado em 04/11/2026: **migração aplicada e validada; publicação Vercel em curso**.
Autorização expressa de publicação e backup registada. Não é necessária nova
confirmação para as operações normais desta release.

## Destinos confirmados

- GitHub: cmdsl10/mini-aguias, PR #1, feature/masters-training-management → main.
- Supabase de produção: dchthzmnldvvwnmhhlvf, mini-aguias, PostgreSQL 17.
- Vercel: prj_URaaRqJPWoHMAFg1Fic0b9AS9yB8, equipa team_fQjs4oOBXznVuFvfCod3OVjl.
- Site oficial: https://mini-aguias.vercel.app .
- Área Masters: https://mini-aguias.vercel.app/#masters-private .

## Backup e proteção dos dados

Backup específico autorizado em test-results/production-backup-20261104/,
excluído do Git/build. ACL Windows limitada ao proprietário e SYSTEM, sem
herança. Nenhum dado pessoal foi enviado para GitHub ou Vercel.

PASS: hashes dos seis ficheiros, recuperação e comparação das 20 tabelas públicas,
três buckets e metadados de 67 objetos; foreign keys verificadas em PostgreSQL
isolado sem rede. Sequências verificadas no motor PostgreSQL/PGlite isolado.
Os números JSON equivalentes foram normalizados na comparação (12 e 12.0),
sem ignorar diferenças de conteúdo. Não foram incluídos passwords/tokens/chaves
Auth; só UUIDs necessários à validação das relações. Os binários das imagens
não fazem parte desta cópia e não foram alterados pela migração.

Antes e depois da migração foram comparadas 22 contagens/fingerprints agregados:
**22/22 iguais**, excluindo apenas o bucket novo da comparação com buckets antigos.
Sócios, quotas, pagamentos de sócios, jogos, plantel público, conteúdos e objetos
Storage existentes permaneceram intactos.

## Migração aplicada pelo CLI

CLI oficial 3.0.0 autenticado pelo proprietário. A conta lista o projeto exato;
CLI confirmou explicitamente mini-aguias (dchthzmnldvvwnmhhlvf) · production.

O histórico remoto de 58 migrações foi obtido numa pasta isolada
`test-results/masters-production-cli/`. Foi acrescentado apenas o SQL canónico
`20261104125552_masters_private_training_management.sql`. O dry-run propôs só
esse ficheiro. Aplicação com --skip-vault, sem seeds, alterações de roles,
include-all, repair ou reset. As confirmações expiradas do conector não foram
repetidas; foi utilizado o mecanismo oficial do CLI conforme pedido.

**PASS:** migração aplicada, seis tabelas novas com RLS ativo, dez triggers de
guarda/auditoria e bucket masters-lead-foot privado, image/jpeg, máximo 5 MB.
A pasta principal de migrações do clube não foi aplicada em lote.

## Verificação na base de produção

`tests/masters-production-rollback.sql` executado antes da importação real:
PASS para contexto de administrador, leitor autorizado, externo e visitante;
fecho incompleto recusado, treinador por decidir sem falta, pagamentos parciais,
sobrealocação recusada, UUID repetido recusado, proteção de faltas pagas,
estorno e auditoria. Toda a transação foi revertida. Confirmados zero jogadores,
treinos, pagamentos e auditoria de teste depois do rollback.

Este teste usa roles e claims controlados na base remota; não é apresentado
como login positivo de uma pessoa no browser. O script recusa execução depois
de existir plantel real, para não tocar em registos reais.

Advisor de segurança: os avisos anteriores sobre funções públicas SECURITY
DEFINER e proteção de passwords comprometidas desativada permanecem; nenhum
aviso novo atribuído ao módulo Masters. A função de classificação existente
verifica app_metadata.role=admin; a função de auditoria é de trigger. Não foi
desativada nenhuma política RLS nem alterada a configuração Auth.
[Referência dos avisos](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Plantel e treinos

Pré-visualização local confirmada: 28 nomes distintos, 26 jogadores incluindo
Seabra (médio), Aires treinador e Pereira presidente. Original preservado.
A lista privada estava vazia. Os nomes não permitem associar automaticamente
este conjunto ao plantel público; nenhuma associação por semelhança foi feita.

**PASS:** 28 elementos importados apenas nas tabelas privadas. Aires/Pereira
com elegibilidade nula, sem dívida. Zero contas associadas automaticamente;
nenhuma conta Auth, palavra-passe ou permissão administrativa criada.

Criados 37 treinos abertos, de 21/10/2026 a 30/06/2027, às quartas-feiras.
Todas as marcações pendentes. Zero faltas e pagamentos; nenhuma dívida criada.
O plantel público anterior não foi substituído nem reutilizado para finanças.

## GitHub e Vercel

PR #1 será concluído apenas depois dos controlos acima. O build publica só
index.html, scripts/estilos do site, manifesto e assets. SQL, testes, relatórios,
backups, configurações e lista real de conferência ficam fora do alojamento.

Os testes locais foram novamente executados antes da migração: 82 verificações
PGlite, cálculos, browser Masters e regressão de conteúdos PASS; build PASS.
A fase anterior contém 16 cenários reais locais e três cenários concorrentes
PASS, que não são confundidos com testes de produção.

A release atualiza o cabeçalho e a área privada, preservando o futebol Masters
público e a área de sócios. Inclui as correções já validadas dos retornos Auth,
recuperação sem função fora de âmbito e galeria privada sem sobrescrita.

## Verificação online e limitações

A executar após deployment oficial: tests/masters-live-smoke.cjs. Usa apenas
visitante/chave pública, sem criar contas ou escrever dados. Verifica os assets,
Auth HTTP/recusa de login inválido, recusa de leitura privada nas seis tabelas,
bucket não público, navegação, menu Masters e larguras 360/390/768/1280.

NOT TESTED enquanto não houver contas reais disponibilizadas: login/logout
positivo de administrador/jogador no browser, JPG de produção com conta real,
aparelhos físicos/Safari. Operações financeiras e perfis RLS foram testados na
base remota com rollback; não são inventados resultados de interface autenticada.

Pendências funcionais: confirmar identidade e UUID de cada jogador antes de
associar a conta; direção decidir elegibilidade de Aires/Pereira. Estas decisões
não geraram contas, privilégios ou dívidas automáticas.

## Recuperação e rollback

Deployment anterior de produção: dpl_BiFtb499E1fSDyUXVTb7TnJpXuJ6,
commit f14677e3f6021cade1534732a517a461f0330716. Em falha crítica, reverter o
código para essa versão e avaliar a migração separadamente, sem apagar dados
Masters eventualmente criados. Backup protegido disponível e recuperação validada.
