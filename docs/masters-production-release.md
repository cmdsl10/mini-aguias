# Masters — preparação da publicação em produção

Estado: **BLOCKED no backup; produção ainda não alterada**.
Autorização de publicação recebida em 04/11/2026. Esta autorização inclui commit,
push, migração aditiva verificada, merge e publicação. Não é necessário voltar a
pedir aprovação dessas operações normais depois de ultrapassado o bloqueio abaixo.

## Alvos confirmados

- GitHub: cmdsl10/mini-aguias; branch feature/masters-training-management.
- Main remoto antes desta fase: f14677e3f6021cade1534732a517a461f0330716.
- Supabase: dchthzmnldvvwnmhhlvf, sem as seis tabelas privadas Masters nem o
  schema masters_private; nenhum conflito nos nomes das novas políticas Storage.
- Vercel: mini-aguias, prj_URaaRqJPWoHMAFg1Fic0b9AS9yB8,
  equipa team_fQjs4oOBXznVuFvfCod3OVjl. Ligação ao repositório confirmada.
- URL oficial existente: https://mini-aguias.vercel.app .
- Produção anterior READY: dpl_BiFtb499E1fSDyUXVTb7TnJpXuJ6, commit main acima.
  Esse deployment é candidato a rollback de código se uma publicação futura falhar.

## Preparação concluída

- Migração canónica revista: só cria tabelas/funções privadas e um bucket privado,
  acrescentando políticas limitadas ao bucket novo. Não apaga/substitui dados do
  clube. Não aplicar conjuntamente o draft histórico nem resetar a pasta principal.
- Contagens reais verificadas apenas em agregado: 113 sócios, 112 quotas, 23 jogos,
  28 elementos no plantel público, 57 pagamentos de sócios e 67 objetos Storage.
  As contagens zero do catálogo eram estimativas, não ausência de dados.
- Há dez contas Auth, uma administradora. Nenhuma conta foi criada ou alterada.
  Não se associaram jogadores a UUIDs sem confirmação.
- Três buckets existentes preservados: public-media, member-photos e club-memories.
- Testes repetidos nesta fase: 82 verificações PGlite, cálculos, plantel, browser
  Masters e regressão de conteúdos PASS. A integração real de 16 cenários e os
  três cenários concorrentes PASS continuam documentados na fase local anterior;
  não são apresentados como testes de produção.
- Build estático preparado em dist com lista explícita de ficheiros públicos.
  Vercel usa npm ci --ignore-scripts e npm run build. Testes, SQL, relatórios,
  configurações locais e lista integral de conferência não entram no alojamento.
- A lista real docs/masters-confirmed-roster.json foi preservada localmente e
  excluída do Git. Os testes passam a usar um fixture sintético reproduzível.
- Nenhuma chave privilegiada é incluída no HTML público. A URL de produção e a
  chave publicável existentes são intencionais; não se trocaram por valores locais.

## Bloqueio concreto — backup recuperável

A revisão automática rejeitou a exportação dos registos pessoais/financeiros de
produção para o contexto do agente e para ficheiros locais. A razão foi que o
pedido genérico de backup não especificava a aprovação daquele conteúdo e destino.
As tentativas foram rejeitadas antes de produzir ficheiros; não existe backup
local criado nesta fase. Não contornar a rejeição por outro método de exportação.

Foi verificada uma alternativa sem exportação: listar os backups mantidos no
Supabase. O CLI 3.0.0 não tem SUPABASE_ACCESS_TOKEN/sessão configurada; o conector
não oferece listagem de backups. O browser Chrome estava minimizado e o controlo
disponível não conseguiu consultar o painel. Não foi criada uma chave de acesso,
nem se procuraram/exibiram credenciais privadas para contornar essa limitação.

Para prosseguir é necessário um dos seguintes:

1. Autorização específica para guardar localmente o backup dos dados pessoais e
   financeiros do clube (nomes, contactos, datas de nascimento, quotas, pagamentos
   e restantes tabelas públicas/configurações), em
   C:/Users/CM/Documents/ChatGPT/Mini Águias/test-results/production-backup-20261104/,
   excluído do Git e do alojamento, para validar recuperação antes da migração;
   sem palavras-passe nem chaves privadas.
2. Disponibilizar/verificar um backup recuperável já mantido no Supabase, sem
   exportar esses dados, através de um acesso autenticado ao painel/listagem.

Não aplicar a migração antes dessa verificação. A autorização geral de publicação
mantém-se válida; este é um requisito de proteção dos dados e uma rejeição do
controlo automático, não um pedido de nova aprovação de layout ou implementação.

## Verificação de segurança existente

O advisor reportou avisos anteriores sobre funções SECURITY DEFINER públicas e
proteção de palavras-passe comprometidas desativada. Não foram gerados pelo
módulo novo e não foram modificados nesta fase. As funções admin devem ser
revistas quanto a guardas de autorização antes da verificação final; funções de
trigger não devem ser tratadas como APIs normais. Não desativar RLS.
[Advisor de funções](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Após desbloquear

1. Criar/confirmar backup e testar recuperação num ambiente isolado sem publicar
   dados pessoais; conservar hashes e relatório, nunca enviar o backup para Git.
2. Guardar snapshot de esquema e contagens/checksums antes da mudança.
3. Aplicar só a migração canónica Masters, verificar RLS/advisors e invariantes.
4. Comparar a pré-visualização do original com a lista confirmada, acrescentar
   Seabra e conferir os 28. Aires/Pereira com elegibilidade nula, sem dívida.
   Não copiar automaticamente contas nem conceder papel admin por função.
5. Push da feature branch; rever preview; integrar main e acompanhar deployment
   no projeto Vercel já confirmado. Confirmar SHA publicado e URL oficial.
6. Testes online de visitante e perfis controlados. Não criar passwords fictícias
   de produção nem gerar dívidas reais. Registar honestamente os testes que
   exigirem uma conta real autorizada ainda indisponível.
7. Se falha crítica, rollback do código para o deployment anterior; não eliminar
   dados Masters criados entretanto e avaliar a migração separadamente.

## Estado de publicação

- Migrações remotas: **NOT EXECUTED**.
- Importação real: **NOT EXECUTED**, lista local confirmada com 28.
- Contas/permissões de jogadores: **NOT CONFIGURED**, sem associação automática.
- Push/main/deployment novo: **NOT EXECUTED**.
- Testes do módulo em produção: **NOT TESTED**.
- Custos novos/recursos pagos: nenhum.
