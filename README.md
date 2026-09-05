# Grupo Desportivo Mini-Águias

Site oficial do G.D. Mini-Águias.

## Estrutura atual
- Site público
- Futebol Masters por épocas
- Épocas 25/26 e 26/27
- Gestão de sócios
- Cartão digital de sócio
- Quotas
- Área privada
- Supabase como backend
- Vercel como alojamento

## Deploy
Ligar este repositório ao projeto Vercel `mini-aguias`.
Branch de produção: `main`.
Deploy automático Vercel ativo.

## Gerir História e Memórias
Entrar em Administração com a conta da direção. O bloco **Conteúdos do site** permite:
- Editar o título e o texto longo da História, preservando parágrafos, e publicar/despublicar.
- Criar e editar memórias com título, texto, categoria, data opcional e fotografias.
- Preparar rascunhos, publicar/despublicar e apagar com confirmação.
- Definir a ordem numérica (os números menores aparecem primeiro).
- Enviar até 20 fotos JPEG/PNG/WebP por memória, até 10 MB por foto, e retirar fotos ao editar.

As alterações são guardadas no Supabase. A página pública consulta os conteúdos ao abrir,
ao regressar à janela e a cada 60 segundos. Não é necessário alterar código ou publicar na Vercel.
O bucket privado `club-memories` só permite ler fotos associadas a memórias publicadas;
o administrador também pode ler rascunhos. A autorização usa `app_metadata.role=admin`,
gerido pelo servidor. Não usar `user_metadata` para atribuir privilégios.
Fotos já descarregadas por um visitante não podem ser revogadas do seu dispositivo.

## Validação desta alteração
- `node --check content.js`
- `node tests/content-browser.cjs` (requer Playwright e Chrome): teste dos formulários com
  backend simulado, upload múltiplo, falha no envio, publicação, remoção e larguras 360–1280 px.
- `tests/content-rls.sql`: testes de permissões com transação revertida; executar no SQL Editor
  como administrador da base de dados. Não cria dados permanentes.
- Migração aplicada: `supabase/migrations/20260905234749_editable_club_content.sql`.

As migrações anteriores já existiam no projeto remoto e não estão neste repositório;
esta pasta não constitui um esquema completo para criar uma base de dados de raiz.
