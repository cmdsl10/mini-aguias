/* Content management uses the same Supabase Auth session as the existing portal. */
(() => {
  'use strict';
  const bucket = db.storage.from('club-memories');
  let entries = [], selected = null, photos = [], legacyImage = null, dirty = false, busy = false;
  let publicUrls = [], editorUrls = [], refreshRunning = false, publicVersion = '', historyDirty = false;
  const status = (text, type = 'notice') => msg($('#contentStatus'), text, type);
  const checked = result => { if (result.error) throw result.error; return result.data; };
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const revoke = urls => { urls.forEach(url => URL.revokeObjectURL(url)); urls.length = 0; };
  async function imageUrl(path, urls) {
    const blob = checked(await bucket.download(path));
    const url = URL.createObjectURL(blob); urls.push(url); return url;
  }
  function textBlock(tag, text, className = '') {
    const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
  }
  async function refreshPublic(force = false) {
    if (refreshRunning) return;
    refreshRunning = true;
    try {
      const [h, g] = await Promise.all([
        db.from('club_history').select('*').eq('published', true).maybeSingle(),
        db.from('gallery_items').select('*').eq('published', true).order('sort_order').order('created_at').order('id')
      ]);
      checked(h); checked(g);
      const version = JSON.stringify([h.data, g.data]);
      if (!force && version === publicVersion) return;
      const history = $('#historyContent'); history.replaceChildren();
      history.append(textBlock('div', 'O Clube', 'ey'));
      if (h.data) history.append(textBlock('h2', h.data.title), textBlock('div', h.data.body, 'content-text'));
      else history.append(textBlock('h2', 'História do Clube'), textBlock('p', 'História em preparação.'));
      revoke(publicUrls);
      const grid = $('#galleryGrid'); grid.replaceChildren();
      if (!g.data.length) grid.append(textBlock('p', 'Novas memórias serão publicadas em breve.', 'muted'));
      let imagesFailed = false;
      for (const item of g.data) {
        const card = document.createElement('article'); card.className = 'card';
        if (item.category) card.append(textBlock('span', item.category, 'pill'));
        card.append(textBlock('h3', item.title || 'Memória'));
        if (item.event_date) card.append(textBlock('p', new Date(item.event_date + 'T12:00:00').toLocaleDateString('pt-PT'), 'muted'));
        if (item.description) card.append(textBlock('div', item.description, 'content-text'));
        const gallery = document.createElement('div'); gallery.className = 'memory-images'; card.append(gallery);
        grid.append(card);
        const sources = [...(item.image_url && safeUrl(item.image_url) ? [{url: safeUrl(item.image_url)}] : []), ...(item.image_paths || []).map(path => ({path}))];
        for (const [i, source] of sources.entries()) {
          try {
            const url = source.url || await imageUrl(source.path, publicUrls);
            const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener';
            const img = document.createElement('img'); img.src = url; img.alt = `${item.title || 'Memória'} — fotografia ${i + 1}`; img.loading = 'lazy';
            link.append(img); gallery.append(link);
          } catch { imagesFailed = true; gallery.append(textBlock('p', 'Não foi possível carregar esta fotografia.', 'muted')); }
        }
      }
      publicVersion = imagesFailed ? '' : version;
    } catch {
      if (!publicVersion) $('#galleryGrid').textContent = 'Não foi possível carregar as memórias. Tenta novamente dentro de instantes.';
    } finally { refreshRunning = false; }
  }
  const panel = document.createElement('div');
  panel.className = 'panel content-admin';
  panel.innerHTML = `
    <h3>Conteúdos do site</h3><p class="muted">Escreve, adiciona fotografias e publica. As alterações aparecem automaticamente no site.</p>
    <div id="contentStatus" role="status" aria-live="polite"></div>
    <details open><summary>História do Clube</summary>
      <form id="historyForm" class="form-grid">
        <label class="full">Título<input name="title" maxlength="200" required></label>
        <label class="full">História do clube<textarea name="body" rows="12" placeholder="Escreve a história. Podes separar os temas com subtítulos e linhas em branco."></textarea></label>
        <label class="full"><input name="published" type="checkbox">Publicar no site</label>
        <button class="btn primary full">Guardar história</button>
      </form>
    </details>
    <details open><summary>Memórias e Galeria</summary>
      <div class="actions"><button type="button" id="newMemory" class="btn secondary">Nova memória</button></div>
      <div id="memoryList"></div>
      <form id="memoryForm" class="form-grid hidden">
        <h4 id="memoryEditorTitle" class="full" tabindex="-1">Nova memória</h4>
        <label class="full">Título da memória<input name="title" maxlength="200" required></label>
        <label class="full">Descrição / texto<textarea name="description" rows="6"></textarea></label>
        <label>Data (opcional)<input name="event_date" type="date"></label>
        <label>Categoria<input name="category" maxlength="100" list="memoryCategories" placeholder="Jogos, Convívios, Festas…"></label>
        <datalist id="memoryCategories"><option value="Jogos"><option value="Convívios"><option value="Festas"><option value="Arquivo"></datalist>
        <label>Ordem de apresentação<input name="sort_order" type="number" min="-100000" max="100000" step="1" value="0" required></label>
        <label><input name="published" type="checkbox">Publicar esta memória</label>
        <label class="full">Adicionar fotografias<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
        <p class="muted full">Até 20 fotografias por memória, com um máximo de 10 MB cada. As novas fotografias são enviadas ao guardar.</p>
        <div id="memoryPhotoList" class="memory-images full"></div>
        <div class="actions full"><button class="btn primary">Guardar memória</button><button id="cancelMemory" type="button" class="btn ghost">Fechar</button></div>
      </form>
    </details>`;
  $('#adminPanel').prepend(panel);
  function clearEditor() {
    selected = null; photos = []; legacyImage = null; dirty = false; revoke(editorUrls);
    $('#memoryForm').reset(); $('#memoryForm').classList.add('hidden'); $('#memoryPhotoList').replaceChildren();
  }
  function mayDiscard() { return !dirty || confirm('Tens alterações por guardar. Queres descartá-las?'); }
  async function withBusy(action) {
    if (busy) return;
    busy = true; panel.querySelectorAll('button,input,textarea').forEach(el => el.disabled = true);
    try { await action(); } catch (e) { status('Não foi possível concluir: ' + (e.message || 'tenta novamente.'), 'error'); }
    finally { busy = false; panel.querySelectorAll('button,input,textarea').forEach(el => el.disabled = false); }
  }
  async function loadEntries() {
    entries = checked(await db.from('gallery_items').select('*').order('sort_order').order('created_at').order('id'));
    const list = $('#memoryList'); list.replaceChildren();
    if (!entries.length) list.append(textBlock('p', 'Ainda não existem memórias. Cria a primeira.', 'muted'));
    for (const item of entries) {
      const row = document.createElement('div'); row.className = 'memory-row';
      row.append(textBlock('b', item.title || 'Memória'), textBlock('div', `${item.published ? 'Publicada' : 'Rascunho'} · Ordem ${item.sort_order} · ${(item.image_paths || []).length + (item.image_url ? 1 : 0)} fotografia(s)`, 'muted'));
      const actions = document.createElement('div'); actions.className = 'actions'; row.append(actions);
      const button = (label, handler, danger = false) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ' + (danger ? 'danger' : 'ghost'); b.textContent = label; b.onclick = handler; actions.append(b); };
      button('Editar', () => { if (mayDiscard()) withBusy(() => edit(item)); });
      button(item.published ? 'Despublicar' : 'Publicar', () => {
        if (!mayDiscard()) return;
        withBusy(async () => {
          checked(await db.from('gallery_items').update({published: !item.published}).eq('id', item.id).select('id').single());
          clearEditor(); await loadEntries(); await refreshPublic(true); status(item.published ? 'Memória despublicada.' : 'Memória publicada.', 'success');
        });
      });
      button('Apagar', () => {
        if (!mayDiscard() || !confirm(`Apagar a memória “${item.title || 'Memória'}” e as suas fotografias?`)) return;
        withBusy(async () => {
          checked(await db.from('gallery_items').delete().eq('id', item.id).select('id').single());
          let cleanupError = false;
          if (item.image_paths?.length) cleanupError = !!(await bucket.remove(item.image_paths)).error;
          clearEditor(); await loadEntries(); await refreshPublic(true);
          status(cleanupError ? 'Memória apagada. Algumas fotos ficaram no armazenamento privado; a limpeza pode ser repetida mais tarde.' : 'Memória apagada.', cleanupError ? 'notice' : 'success');
        });
      }, true);
      list.append(row);
    }
  }
  async function renderEditorPhotos() {
    revoke(editorUrls); const list = $('#memoryPhotoList'); list.replaceChildren();
    const sources = [...(legacyImage ? [{url: legacyImage}] : []), ...photos.map(path => ({path}))];
    for (const source of sources) {
      const figure = document.createElement('figure'); figure.className = 'memory-photo';
      try { const img = document.createElement('img'); img.src = source.url || await imageUrl(source.path, editorUrls); img.alt = 'Fotografia da memória'; figure.append(img); }
      catch { figure.append(textBlock('p', 'Pré-visualização indisponível.')); }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn danger sm'; remove.textContent = 'Retirar fotografia';
      remove.onclick = () => { if (source.path) photos = photos.filter(p => p !== source.path); else legacyImage = null; dirty = true; withBusy(renderEditorPhotos); };
      figure.append(remove); list.append(figure);
    }
  }
  async function edit(item) {
    clearEditor(); selected = item; photos = [...(item.image_paths || [])]; legacyImage = safeUrl(item.image_url);
    const form = $('#memoryForm'); form.classList.remove('hidden');
    for (const name of ['title','description','event_date','category','sort_order']) form.elements[name].value = item[name] ?? '';
    form.elements.published.checked = item.published; $('#memoryEditorTitle').textContent = 'Editar memória';
    await renderEditorPhotos(); $('#memoryEditorTitle').focus();
  }
  $('#newMemory').onclick = () => {
    if (!mayDiscard()) return; clearEditor(); $('#memoryForm').classList.remove('hidden');
    $('#memoryEditorTitle').textContent = 'Nova memória'; $('#memoryEditorTitle').focus();
    $('#memoryForm').elements.sort_order.value = Math.min(100000, Math.max(0, ...entries.map(x => x.sort_order)) + 10);
  };
  $('#cancelMemory').onclick = () => { if (mayDiscard()) clearEditor(); };
  $('#memoryForm').addEventListener('input', () => { dirty = true; });
  $('#historyForm').addEventListener('input', () => { historyDirty = true; });
  window.addEventListener('beforeunload', event => { if (dirty || historyDirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  $('#historyForm').onsubmit = event => {
    event.preventDefault(); const form = event.target;
    const patch = {id: 'main', title: form.elements.title.value.trim(), body: form.elements.body.value, published: form.elements.published.checked};
    if (!patch.title) { status('Escreve um título para a história.', 'error'); return; }
    withBusy(async () => { checked(await db.from('club_history').upsert(patch).select('id').single()); historyDirty = false; await refreshPublic(true); status('História guardada' + (patch.published ? ' e publicada.' : ' como rascunho.'), 'success'); });
  };
  $('#memoryForm').onsubmit = event => {
    event.preventDefault(); const form = event.target;
    const files = [...form.elements.images.files];
    const patch = {title: form.elements.title.value.trim(), description: form.elements.description.value, category: form.elements.category.value.trim() || null, event_date: form.elements.event_date.value || null, sort_order: Number(form.elements.sort_order.value), published: form.elements.published.checked};
    if (!patch.title) { status('Escreve um título para a memória.', 'error'); return; }
    if (photos.length + files.length + (legacyImage ? 1 : 0) > 20 || files.some(f => !['image/jpeg','image/png','image/webp'].includes(f.type) || f.size > 10485760 || !f.size)) { status('Escolhe até 20 imagens JPEG, PNG ou WebP, com um máximo de 10 MB cada.', 'error'); return; }
    withBusy(async () => {
      const uploaded = [], id = selected?.id || crypto.randomUUID(); let writeAttempted = false;
      try {
        for (const file of files) {
          const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
          const path = `${id}/${crypto.randomUUID()}.${ext}`;
          status(`A enviar fotografia ${uploaded.length + 1} de ${files.length}…`);
          checked(await bucket.upload(path, file, {contentType: file.type, upsert: false})); uploaded.push(path);
        }
        patch.image_paths = [...photos, ...uploaded]; patch.image_url = legacyImage || null;
        const query = selected ? db.from('gallery_items').update(patch).eq('id', id) : db.from('gallery_items').insert({id, ...patch});
        writeAttempted = true;
        checked(await query.select('id').single());
        const removed = (selected?.image_paths || []).filter(path => !photos.includes(path));
        const cleanupError = removed.length && (await bucket.remove(removed)).error;
        clearEditor(); await loadEntries(); await refreshPublic(true);
        status(cleanupError ? 'Memória guardada. Algumas fotos retiradas ficaram no armazenamento privado.' : 'Memória guardada' + (patch.published ? ' e publicada.' : ' como rascunho.'), cleanupError ? 'notice' : 'success');
      } catch (error) {
        // A lost database response may still represent a committed write. Keep private
        // uploads in that case, rather than deleting images referenced by a saved entry.
        if (!writeAttempted && uploaded.length) await bucket.remove(uploaded);
        throw error;
      }
    });
  };
  window.loadContentAdmin = async () => {
    try {
      const history = checked(await db.from('club_history').select('*').eq('id','main').maybeSingle());
      const form = $('#historyForm');
      if (history) { form.elements.title.value = history.title; form.elements.body.value = history.body; form.elements.published.checked = history.published; }
      await loadEntries();
    } catch (e) { status('Não foi possível carregar os conteúdos: ' + e.message, 'error'); }
  };
  refreshPublic();
  setInterval(() => { if (!document.hidden) refreshPublic(); }, 60000);
  window.addEventListener('focus', () => refreshPublic());
})();
