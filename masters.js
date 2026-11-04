/* Private Masters uses the existing Supabase client; RLS is the authority. */
(() => {
  'use strict';
  const panel = document.querySelector('#masters-private');
  const q = s => panel.querySelector(s);
  const money = cents => (cents / 100).toLocaleString('pt-PT', {style:'currency', currency:'EUR'});
  const date = day => new Date(day + 'T12:00:00').toLocaleDateString('pt-PT');
  const labels = {pending:'Por marcar', present:'Presente', absent:'Falta', excused:'Justificada'};
  const roles = {player:'Jogador', coach:'Treinador', president:'Presidente'};
  const checked = r => { if (r.error) throw r.error; return r.data; };
  const errors = {
    'Attendance eligibility must be confirmed':'Confirma primeiro se este membro participa no controlo de presenças e faltas.',
    'Reopen marked trainings before changing eligibility':'Reabre os treinos com marcações deste membro antes de mudar a elegibilidade; estorna primeiro os pagamentos associados.',
    'Mark every player before closing':'Marca a presença de todos os jogadores antes de fechar o treino.',
    'Future training cannot close':'Só podes fechar um treino na própria data ou depois.',
    'Reverse allocated payments before reopening or cancelling':'Estorna os pagamentos deste treino antes de o reabrir ou cancelar.',
    'Reverse allocated payments before changing this absence':'Estorna primeiro os pagamentos associados a esta falta.',
    'Reopen the training before marking pending':'Reabre o treino antes de voltar a marcar uma presença como pendente.',
    'Absence over-allocation':'Esta falta já recebeu esse valor. Atualiza os dados antes de continuar.',
    'Payment over-allocation':'O valor alocado excede o pagamento recebido.',
    'Invalid login credentials':'Email ou palavra-passe incorretos.'
  };
  const el = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (label, run) => { const n = el('button', label, 'btn secondary'); n.type = 'button'; n.onclick = () => action(run); return n; };
  let state = null, generation = 0, imageUrls = [], busy = false, refreshPending = false;
  panel.innerHTML = `<div class="wrap"><div class="ey">Época 2026/27 · Área privada</div><h2>Masters — Treinos</h2>
    <p>Quartas-feiras desde 21/10/2026. Falta não justificada: 1 €. Só os treinos fechados contam.</p>
    <p id="mastersStatus" role="status" aria-live="polite"></p>
    <form id="mastersLogin" class="masters-toolbar"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Palavra-passe<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary">Entrar</button><a href="#area-socio">Recuperar palavra-passe</a></form>
    <div id="mastersSession" hidden class="masters-toolbar"><button id="mastersRefresh" type="button" class="btn secondary">Atualizar</button><button id="mastersLogout" type="button" class="btn ghost">Terminar sessão</button></div>
    <div id="mastersData" hidden></div><dialog id="mastersEditor"><form method="dialog"><button aria-label="Fechar" class="btn ghost">Fechar</button></form><div id="mastersEditorBody"></div></dialog></div>`;
  function status(text, error = false) { q('#mastersStatus').textContent = text; q('#mastersStatus').className = error ? 'masters-error' : ''; }
  function clear() {
    generation++; state = null;
    imageUrls.forEach(URL.revokeObjectURL); imageUrls = [];
    q('#mastersData').replaceChildren(); q('#mastersData').hidden = true;
    q('#mastersEditor').close(); q('#mastersEditorBody').replaceChildren();
  }
  async function action(run) {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy', 'true');
    try { await run(); } catch (e) {
      status(e.code === '23505' ? 'O registo já existe ou o pagamento já foi processado. Atualiza os dados antes de continuar.' : errors[e.message] || e.message || 'Não foi possível concluir. Atualiza antes de tentar novamente.', true);
    }
    finally {
      busy = false; panel.removeAttribute('aria-busy');
      if (refreshPending) { refreshPending = false; if (location.hash === '#masters-private') setTimeout(requestLoad, 0); }
    }
  }
  function requestLoad() { if (busy) refreshPending = true; else action(load); }
  async function all(table, order) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      let query = db.from(table).select('*').order(order);
      if (table === 'masters_attendance' || table === 'masters_payment_allocations') query = query.order('player_id');
      if (table === 'masters_payment_allocations') query = query.order('training_id');
      const batch = checked(await query.range(start, start + 999));
      rows.push(...batch); if (batch.length < 1000) return rows;
    }
  }
  async function load() {
    clear(); const token = generation; status('A verificar acesso…');
    const auth = await db.auth.getUser();
    const user = auth.error?.name === 'AuthSessionMissingError' ? null : checked(auth)?.user;
    if (token !== generation) return;
    q('#mastersLogin').hidden = !!user; q('#mastersSession').hidden = !user;
    if (!user) { status('Entra com a conta autorizada pela direção.'); return; }
    const players = await all('masters_players', 'id');
    if (token !== generation) return;
    const admin = user.app_metadata?.role === 'admin' && !user.is_anonymous;
    if (!admin && !players.some(p => p.active && p.auth_user_id === user.id)) { status('Esta conta não tem acesso à área Masters.', true); return; }
    const [trainings, attendance, payments, allocations, audit] = await Promise.all([
      all('masters_trainings', 'training_date'), all('masters_attendance', 'training_id'),
      all('masters_payments', 'id'), all('masters_payment_allocations', 'payment_id'),
      db.from('masters_audit').select('*').order('id', {ascending:false}).limit(100).then(checked)
    ]);
    if (token !== generation) return;
    state = {players, trainings, attendance, payments, allocations, audit, admin}; render();
    status(players.length ? 'Dados privados da equipa. Atualiza para consultar alterações recentes.' : 'Ainda não existem jogadores. A lista e as contas precisam de validação da direção.');
  }
  function showEditor(title) {
    const body = q('#mastersEditorBody'); body.replaceChildren(el('h3', title));
    q('#mastersEditor').showModal(); return body;
  }
  function render() {
    const s = state, body = q('#mastersData'); body.replaceChildren(); body.hidden = false;
    const stats = MastersDomain.statistics(s.players, s.trainings, s.attendance, s.allocations);
    const totals = el('div', '', 'masters-stats');
    for (const [label, value] of [['Treinos fechados', s.trainings.filter(t => t.status === 'closed').length], ['Faltas', stats.reduce((n, p) => n + p.absent, 0)], ['Recebido', money(stats.reduce((n, p) => n + p.paid, 0))], ['Em dívida', money(stats.reduce((n, p) => n + p.balance, 0))]]) {
      const box = el('div', label); box.append(el('strong', value)); totals.append(box);
    }
    body.append(totals);
    const tools = el('div', '', 'masters-toolbar');
    tools.append(button('Resumo semanal para WhatsApp', summary));
    if (s.admin) tools.append(button('Preparar quartas-feiras da época', seed), button('Adicionar jogador / autorizar conta', playerEditor), button('Importar lista Excel', importPlayers));
    body.append(tools, el('p', 'Legenda: Por marcar · Presente · Justificada · Falta por pagar / parcial / paga. O pagamento nunca apaga a falta.'));
    const scroll = el('div', '', 'masters-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Grelha de presenças e pagamentos. Desloca horizontalmente para consultar todos os treinos.');
    const table = el('table'); table.append(el('caption', 'Presenças e pagamentos individuais'));
    const head = el('thead'), hr = el('tr'); hr.append(el('th', 'Jogador'));
    for (const t of s.trainings) {
      const th = el('th'); th.scope = 'col'; th.append(el('div', date(t.training_date)), el('small', {open:'Aberto',closed:'Fechado',cancelled:'Cancelado'}[t.status]));
      if (s.admin) th.append(button('Gerir', () => trainingEditor(t))); hr.append(th);
    }
    head.append(hr); table.append(head); const tb = el('tbody');
    for (const p of s.players) {
      const row = el('tr'), name = el('td', p.display_name); row.append(name);
      name.append(el('small', ` · ${roles[p.sports_role] || 'Jogador'}${p.playing_position ? ' · ' + p.playing_position : ''}`));
      if (s.admin) name.append(button('Conta', () => playerEditor(p)));
      for (const t of s.trainings) {
        const c = MastersDomain.cell(p, t, s.attendance, s.allocations), td = el('td');
        const text = t.status === 'cancelled' ? 'Cancelado' : p.attendance_eligible !== true ? (p.attendance_eligible === false ? 'Fora do controlo' : 'Elegibilidade por decidir') : labels[c.status] + (c.due ? ` · ${c.paid === 100 ? 'Paga' : c.paid ? 'Parcial' : 'Por pagar'} (${money(c.paid)})` : '');
        const cls = `masters-cell ${c.status} ${c.due && c.paid === 100 ? 'paid' : c.paid ? 'partial' : ''}`;
        if (s.admin && p.attendance_eligible === true && t.status !== 'cancelled') {
          const b = button(text, () => attendanceEditor(p, t)); b.className = cls; b.setAttribute('aria-label', `${p.display_name}, ${date(t.training_date)}: ${text}`); td.append(b);
        } else td.append(el('div', text, cls)); row.append(td);
      }
      tb.append(row);
    }
    table.append(tb); scroll.append(table); body.append(scroll, el('h3', 'Assiduidade'));
    for (const p of stats) {
      const row = el('div', '', 'masters-rank'), bar = document.createElement('progress'); bar.max = 1; bar.value = p.rate || 0; bar.setAttribute('aria-label', `Assiduidade de ${p.display_name}`);
      row.append(el('span', p.display_name), bar, el('span', p.rate === null ? '—' : `${Math.round(p.rate * 100)}%`));
      body.append(row, el('small', `${p.present} presenças · ${p.absent} faltas · ${p.excused} justificadas · Saldo ${money(p.balance)}`));
    }
    body.append(el('h3', 'Pagamentos e correções'));
    for (const payment of s.payments) {
      const p = s.players.find(x => x.id === payment.player_id), row = el('p', `${p?.display_name || 'Jogador'} · ${money(payment.amount_cents)} · ${new Date(payment.paid_at).toLocaleString('pt-PT')} · ${payment.note || ''}`);
      if (s.admin) row.append(button('Estornar', async () => {
        const reason = prompt('Motivo do estorno (mínimo 3 caracteres). O original fica no histórico.');
        if (!reason) return; checked(await db.rpc('masters_reverse_payment', {payment_uuid:payment.id, reason})); await load();
      })); body.append(row);
    }
    body.append(el('h3', 'Pé de Chumbo — destaque e arquivo'));
    const archive = el('div', '', 'masters-archive'); body.append(archive);
    for (const t of [...s.trainings].reverse().filter(t => t.lead_foot_player_id && t.status === 'closed')) {
      const card = el('article', '', 'panel'); card.append(el('h4', `${date(t.training_date)} · ${s.players.find(p => p.id === t.lead_foot_player_id)?.display_name || 'Jogador'}`)); archive.append(card);
      if (t.lead_foot_image_path) renderImage(t.lead_foot_image_path, card, generation);
    }
    body.append(el('h3', 'Histórico — últimas 100 alterações'));
    for (const a of s.audit) {
      const detail = el('details'); detail.append(el('summary', `${new Date(a.created_at).toLocaleString('pt-PT')} · ${a.event_type}`));
      detail.append(el('pre', JSON.stringify(a.details, null, 2))); detail.style.overflow = 'auto'; body.append(detail);
    }
  }
  async function renderImage(path, card, token) {
    try {
      const blob = checked(await db.storage.from('masters-lead-foot').download(path));
      if (token !== generation) return;
      const url = URL.createObjectURL(blob); imageUrls.push(url); const img = el('img'); img.src = url; img.alt = 'Caricatura Pé de Chumbo carregada pela direção'; card.append(img);
    } catch { if (token === generation) card.append(el('p', 'Não foi possível carregar o JPG.')); }
  }
  function select(label, options, value, parent) {
    const wrap = el('label', label), input = el('select'); input.setAttribute('aria-label', label);
    for (const [v, text] of options) { const opt = el('option', text); opt.value = v; input.append(opt); }
    input.value = value; wrap.append(input); parent.append(wrap); return input;
  }
  function field(label, type, parent, value = '') {
    const wrap = el('label', label), input = el('input'); input.type = type; input.value = value; wrap.append(input); parent.append(wrap); return input;
  }
  function attendanceEditor(p, t) {
    const body = showEditor(`${p.display_name} · ${date(t.training_date)}`);
    const c = MastersDomain.cell(p, t, state.attendance, state.allocations);
    const input = select('Presença', Object.entries(labels), c.status, body);
    body.append(button('Guardar presença', async () => {
      checked(await db.from('masters_attendance').upsert({player_id:p.id, training_id:t.id, status:input.value})); await load();
    }));
    if (c.balance > 0) {
      const paymentId = crypto.randomUUID();
      const amount = field(`Alocar pagamento a esta falta — máximo ${money(c.balance)}`, 'number', body, (c.balance / 100).toFixed(2)); amount.min = '0.01'; amount.max = (c.balance / 100).toFixed(2); amount.step = '0.01';
      const note = field('Nota / referência', 'text', body); note.maxLength = 500;
      body.append(button('Registar pagamento individual', async () => {
        if (!amount.reportValidity()) return;
        const cents = Math.round(Number(amount.value) * 100);
        if (!Number.isInteger(cents) || cents <= 0 || cents > c.balance) throw Error('Valor inválido.');
        checked(await db.rpc('masters_record_payment', {payment_uuid:paymentId, target_player:p.id, cents,
          allocations:[{training_id:t.id, amount_cents:cents}], memo:note.value})); await load();
      }));
    }
    body.append(el('p', 'Para corrigir uma falta paga, estorna primeiro o pagamento. O histórico preserva a alteração.'));
  }
  function trainingEditor(t) {
    const body = showEditor(`Treino ${date(t.training_date)}`);
    const statusInput = select('Estado', [['open','Aberto'],['closed','Fechado'],['cancelled','Cancelado']], t.status, body);
    const player = select('Pé de Chumbo', [['','Sem seleção'], ...state.players.map(p => [p.id,p.display_name])], t.lead_foot_player_id || '', body);
    const image = field('JPG manual (máximo 5 MB)', 'file', body); image.accept = 'image/jpeg';
    body.append(button('Guardar treino', async () => {
      let path = player.value === t.lead_foot_player_id ? t.lead_foot_image_path : null;
      const file = image.files[0];
      if (file && !player.value) throw Error('Seleciona o jogador do Pé de Chumbo.');
      if (file) {
        const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
        if (file.type !== 'image/jpeg' || file.size > 5242880 || signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) throw Error('Escolhe um JPG válido até 5 MB.');
        const bitmap = await createImageBitmap(file); bitmap.close();
        path = `${t.id}/${crypto.randomUUID()}.jpg`;
        checked(await db.storage.from('masters-lead-foot').upload(path, file, {contentType:'image/jpeg', upsert:false}));
      }
      // A lost response may follow a committed update. Keep the private JPG:
      // deleting here could break the saved record and its audit history.
      checked(await db.from('masters_trainings').update({status:statusInput.value, lead_foot_player_id:player.value || null, lead_foot_image_path:player.value ? path : null}).eq('id', t.id));
      await load();
    }));
  }
  function playerEditor(existing) {
    const p = existing?.id ? existing : null, body = showEditor(p ? 'Conta do jogador' : 'Adicionar jogador');
    const name = field('Nome de apresentação', 'text', body, p?.display_name || ''); name.required = true; name.maxLength = 120;
    const uid = field('UUID da conta Supabase confirmada (opcional)', 'text', body, p?.auth_user_id || '');
    uid.pattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
    const active = select('Acesso', [['yes','Ativo'],['no','Inativo']], p?.active === false ? 'no' : 'yes', body);
    const role = select('Função desportiva', Object.entries(roles), p?.sports_role || 'player', body);
    const position = field('Posição em campo (opcional)', 'text', body, p?.playing_position || ''); position.maxLength = 80;
    const eligible = select('Controlo de presenças e faltas de 1 €', [['pending','Por decidir'],['yes','Incluído'],['no','Excluído']], p ? (p.attendance_eligible === true ? 'yes' : p.attendance_eligible === false ? 'no' : 'pending') : 'yes', body);
    role.onchange = () => { eligible.value = 'pending'; };
    body.append(el('p', 'A função não atribui permissões de gestão. Confirma a identidade antes de ligar a conta. Elegibilidade por decidir não gera faltas nem dívida.'));
    body.append(button('Guardar jogador', async () => {
      if (!name.reportValidity() || !uid.reportValidity() || !position.reportValidity()) return;
      const data = {display_name:name.value.trim(), auth_user_id:uid.value.trim() || null, active:active.value === 'yes', sports_role:role.value, playing_position:position.value.trim() || null, attendance_eligible:eligible.value === 'pending' ? null : eligible.value === 'yes'};
      checked(await (p ? db.from('masters_players').update(data).eq('id',p.id) : db.from('masters_players').insert(data))); await load();
    }));
  }
  async function seed() {
    for (const day of MastersDomain.dates()) if (!state.trainings.some(t => t.training_date === day)) checked(await db.rpc('masters_create_training', {day}));
    await load();
  }
  function importPlayers() {
    const body = showEditor('Importar jogadores — última folha do Excel');
    const input = field('Ficheiro Excel', 'file', body); input.accept = '.xlsx';
    const preview = el('div'); body.append(preview);
    input.onchange = () => action(async () => {
      preview.replaceChildren();
      if (!input.files[0]) return;
      if (input.files[0].size > 10485760) throw Error('O Excel deve ter até 10 MB.');
      if (typeof XLSX === 'undefined') throw Error('O leitor Excel não carregou. Atualiza a página.');
      const workbook = XLSX.read(await input.files[0].arrayBuffer(), {type:'array'});
      const sheetName = workbook.SheetNames.at(-1), rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header:1, defval:''});
      preview.append(el('p', `Folha: ${sheetName}. Escolhe a coluna e a primeira linha dos nomes. Não são associadas contas automaticamente.`));
      const columns = Math.max(0, ...rows.map(r => r.length));
      if (!columns || columns > 100) throw Error('Folha vazia ou com demasiadas colunas.');
      const col = select('Coluna dos nomes', Array.from({length:columns}, (_, i) => [String(i), `${XLSX.utils.encode_col(i)} · ${String(rows[0]?.[i] || '').slice(0,60)}`]), '0', preview);
      const start = field('Primeira linha dos jogadores', 'number', preview, '2'); start.min = '1'; start.max = String(rows.length); start.step = '1';
      const end = field('Última linha dos jogadores', 'number', preview, String(rows.length)); end.min = '2'; end.max = String(rows.length); end.step = '1';
      const extra = field('Nome adicional (se faltar no Excel)', 'text', preview); extra.maxLength = 120;
      preview.append(el('p', 'Lista confirmada: 28 membros, incluindo Aires e Pereira. No Excel original, selecionar A2:A29 e acrescentar Seabra no campo acima.'));
      const names = el('ol'); preview.append(names); let selected = [];
      const show = () => {
        end.min = start.value;
        selected = rows.slice(Number(start.value) - 1, Number(end.value)).map(r => String(r[Number(col.value)] || '').trim()).filter(Boolean);
        if (extra.value.trim()) selected.push(extra.value.trim());
        names.replaceChildren(...selected.map(name => { const p = MastersDomain.memberProfile(name); return el('li', `${name} · ${roles[p.sports_role]}${p.playing_position ? ' · ' + p.playing_position : ''}${p.attendance_eligible === null ? ' · elegibilidade por decidir' : ''}`); }));
      };
      col.onchange = show; start.oninput = show; end.oninput = show; extra.oninput = show; show();
      preview.append(button('Confirmar e importar os 28 nomes apresentados', async () => {
        if (!start.reportValidity() || !end.reportValidity()) return;
        show();
        const normalize = n => n.normalize('NFC').toLocaleLowerCase('pt-PT');
        if (selected.length !== 28 || selected.some(n => n.length > 120 || ['nome', 'total', 'pé de chumbo'].includes(normalize(n))) || new Set(selected.map(normalize)).size !== 28) throw Error('É necessária uma lista de 28 nomes distintos, sem cabeçalhos ou rodapés, até 120 caracteres cada.');
        if (state.players.some(p => selected.some(n => normalize(n) === normalize(p.display_name)))) throw Error('Já existem nomes desta lista. Valida os duplicados antes de importar.');
        checked(await db.from('masters_players').insert(selected.map(MastersDomain.memberProfile)));
        await load();
      }));
    });
  }
  function summary() {
    const closed = state.trainings.filter(t => t.status === 'closed'), t = closed.at(-1);
    if (!t) throw Error('Ainda não existe treino fechado.');
    const body = showEditor('Resumo semanal — copiar para WhatsApp');
    const cells = state.players.map(p => MastersDomain.cell(p,t,state.attendance,state.allocations));
    const text = `Mini-Águias Masters · ${date(t.training_date)}\nPresentes: ${cells.filter(c => c.status === 'present').length}\nFaltas: ${cells.filter(c => c.status === 'absent').length}\nJustificadas: ${cells.filter(c => c.status === 'excused').length}\nPé de Chumbo: ${state.players.find(p => p.id === t.lead_foot_player_id)?.display_name || 'Por selecionar'}`;
    const area = el('textarea'); area.value = text; area.rows = 8; area.style.width = '100%'; area.readOnly = true; body.append(area);
    body.append(button('Copiar resumo', async () => { await navigator.clipboard.writeText(text); status('Resumo copiado.'); }));
    body.append(el('p', 'Sem saldos individuais no resumo. Revê o texto antes de partilhar.'));
  }
  q('#mastersLogin').onsubmit = e => { e.preventDefault(); action(async () => {
    const f = new FormData(e.target); checked(await db.auth.signInWithPassword({email:f.get('email'), password:f.get('password')}));
    e.target.reset(); await load();
  }); };
  q('#mastersLogout').onclick = () => action(async () => { clear(); checked(await db.auth.signOut()); await load(); });
  q('#mastersRefresh').onclick = () => action(load);
  db.auth.onAuthStateChange((event) => {
    clear(); q('#mastersSession').hidden = true; q('#mastersLogin').hidden = false;
    if (location.hash === '#masters-private') setTimeout(requestLoad, 0);
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#masters-private') requestLoad(); else clear();
  });
  if (location.hash === '#masters-private') action(load);
})();
