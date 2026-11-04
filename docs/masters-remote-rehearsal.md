# Atualização — produção publicada em 04/11/2026

A migração Masters foi aplicada via CLI e o PR #1 integrado. O domínio oficial
serve a área privada, com sete cenários online PASS. RLS e regras financeiras
foram verificadas na base remota com rollback. [Relatório final](masters-production-release.md).
O conteúdo abaixo é o registo histórico do ensaio anterior à publicação.

# Masters — ensaio local real concluído; remoto não executado

04/11/2026. Branch `feature/masters-training-management`.

## Estado atual

O bloqueio foi resolvido localmente. Não é necessário criar um projeto remoto
pago para validar estes fluxos. Laboratório local
`mini-aguias-masters-integration-20261104`, portas 57421/57422/57424 e site de
ensaio 57430, com URL 127.0.0.2 para contornar o encaminhamento WSL.

**PASS** — 16 cenários de integração real com Auth, PostgreSQL/PostgREST,
Storage, SMTP capturado localmente e browser. Três cenários concorrentes PASS
em PostgreSQL independente; 82 verificações PGlite e regressões simuladas PASS,
identificadas separadamente. [Matriz e evidência](masters-local-integration.md).

O laboratório foi encerrado sem apagar os dois volumes exclusivos Masters.
O arranque nativo também foi corrigido apenas para clusters descartáveis.
Nenhum outro ambiente local foi parado ou eliminado.

## O que foi executado

1. Docker/CLI, portas, permissões, logs, memória e espaço verificados.
2. Projeto local novo, com identificador e portas próprios; nunca ligado ao remoto.
3. Migração Masters aplicada apenas à base local e esquema público reproduzido
   por metadados, sem copiar dados pessoais, pagamentos ou ficheiros reais.
4. Dados fictícios: 28 membros, contas @example.test, quotas e pagamentos de teste.
5. Auth com admin, leitor, externo e editor sem autorização; RLS nas seis tabelas
   privadas, revogação com JWT existente e recusa de elevação por user_metadata.
6. Treinos, fecho incompleto/futuro/cancelado, staff por decidir sem dívida;
   pagamentos parciais, sobrealocação, repetição e estornos com auditoria.
7. Concorrência real com espera de locks observada entre ligações independentes.
8. JPEG real: upload admin, leitura autorizada, recusa de leitura pública/externa,
   escrita por jogador, MIME inválido e tamanho acima de 5 MB.
9. XLSX real fictício com 28 nomes, pré-visualização e gravação HTTP na base.
10. Sócios: associação automática e claim de conta existente, cartão/quotas,
    contactos, foto privada, signup/confirmacão, recuperação e logout.
11. História, pesca, equipa/época, galeria privada publicada e navegação pública;
    candidaturas e pedidos de validação de email guardados sem exposição pública.
12. Mobile 360/390 e larguras 768/1280; zero pedidos para produção no browser.

Foram corrigidos três problemas reais no código local: retorno Auth com dois
fragmentos, função fora de âmbito na recuperação e dois renderizadores a
escrever na galeria. O relatório detalhado regista também falhas do preparador
e condições de corrida no próprio teste, sem as esconder como resultados PASS.

## Limites e decisões

**BLOCKED:** nenhum bloqueio técnico local permaneceu nos cenários executados.
**NOT TESTED:** Supabase remoto/produção, contas reais, SMTP externo e aparelhos
físicos/Safari. A validação local não é apresentada como ensaio em produção.
A lista real conserva 26 jogadores, Seabra médio, Aires treinador e Pereira
presidente. A elegibilidade destes dois últimos aguarda decisão; fica nula e
não gera faltas/dívidas. Não os excluir nem presumir isenção definitiva.

Custos incrementais Supabase do ensaio: US$0. Nenhum recurso pago criado.
Preços oficiais foram consultados como alternativa, mas um novo projeto remoto
não foi necessário. Ver comparação e limites no relatório detalhado.

## Se for pedido um ensaio remoto futuro

- Confirmar alvo, proprietário, custo e autorização antes de criar recursos.
  Não presumir que outro projeto do utilizador, como meu-studio, é descartável.
- Excluir produção `dchthzmnldvvwnmhhlvf`; não reutilizar dados pessoais por defeito.
- Rever esquema e políticas e fazer backup se o alvo contiver dados.
- Aplicar só a migração canónica Masters; não aplicar conjuntamente o draft
  histórico nem executar reset ou a pasta incompleta de migrações do clube.
- Preparar cópia do site com URL/chave pública do alvo. A configuração principal
  do site continua a apontar para produção e não deve ser usada para testes.
  Nunca colocar service_role no browser.
- Repetir a matriz real e conservar evidência. Migração de produção, publicação,
  push ou merge precisam de autorização separada.

Até nova autorização, as alterações permanecem locais. A produção não recebeu
qualquer migração, mudança de configuração, upload, importação ou publicação.
