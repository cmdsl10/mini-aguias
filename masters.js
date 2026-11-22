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
  const footballNames = {'Adérito':'Aderito Santos Curcialeiro Fernandes','Basílio':'Basílio António Seabra da Rocha','Campos':'José Campos','Cedric':'Cedric Ribeiro Ferreira','David':'David Humberto Marinho Antunes','Marco':'Marco Andrade','Marcos':'Marcos Daniel Gonçalves Ribeiro','Mika':'Micael Silva Coelho','Paquete':'Henrique Manuel Martins Paquete','Patrício':'Patrício Alberto Mendes Teixeira','Paulo Costa':'Paulo Sérgio Macedo Costa','Porfirio':'Porfírio Jorge Domingues Costa','Ribeiro':'José Alexandre Silva Ribeiro','Romano':'Romano Eurico Fernandes Magalhães','Vasco':'João Vasco Costa'};
  // Verified against Futebol 2026/27; fallback when public roster RLS is unavailable.
  // Never infer a position from a similar or abbreviated name without a verified match.
  const leadFootIds = t => Array.isArray(t.lead_foot_player_ids) && t.lead_foot_player_ids.length ? t.lead_foot_player_ids : (t.lead_foot_player_id ? [t.lead_foot_player_id] : []);
  const leadFootNames = (t, players) => leadFootIds(t).map(id => players.find(p=>p.id===id)?.display_name).filter(Boolean).join(', ') || 'Por selecionar';
  const verifiedPositions = Object.freeze({
    'Adérito':'AVZ','Basílio':'DEF','Campos':'DEF','Cedric':'MED',
    'David':'DEF','Marco':'GR','Marcos':'DEF','Mika':'AVZ',
    'Paquete':'GR','Patrício':'DEF','Paulo Costa':'AVZ',
    'Porfirio':'DEF','Ribeiro':'MED','Romano':'MED','Vasco':'DEF',
    'Carlitos':'AVZ','Costinha':'AVZ','Daniel (Boxexas)':'DEF',
    'Daniel (Rato)':'AVZ','Fausto':'MED','Guerra':'MED',
    'Miguel':'MED','Peninha':'DEF','Pisco':'MED','Toni':'AVZ'
  });
  const footballGroup = value => {
    const v = String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase();
    if (v.includes('GUARDA-REDES')) return 'GR';
    if (v.startsWith('DEFESA')) return 'DEF';
    if (v.startsWith('MEDIO')) return 'MED';
    if (v.startsWith('AVANCADO') || v.startsWith('PONTA')) return 'AVZ';
    return null;
  };
  const mastersLayoutStyle = document.createElement('style');
  mastersLayoutStyle.textContent = `
    #masters-private .masters-overview{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(250px,1fr);gap:18px;margin:18px 0;align-items:start}
    #masters-private .masters-roster{padding:18px}
    #masters-private .masters-roster h3,#masters-private .masters-photo-card h3{margin:0 0 12px}
    #masters-private .masters-roster-group{margin:12px 0}
    #masters-private .masters-roster-group h4{background:#173e79;color:#fff;border-left:5px solid #f0c531;padding:8px 10px;border-radius:5px;font-size:.92rem;margin:0 0 6px}
    #masters-private .masters-roster-group ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:5px 12px}
    #masters-private .masters-roster-group li{padding:5px 8px;border-bottom:1px solid #dde4ee}
    #masters-private .masters-archive-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}
    #masters-private .masters-archive-tabs button[aria-selected="true"]{background:#e1ad28;color:#102c4d;border-color:#e1ad28;font-weight:800}
    #masters-private .masters-weekly-archive-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}
    #masters-private .masters-weekly-photo{padding:12px}
    #masters-private .masters-weekly-photo h4{margin:0 0 10px;color:#102f53}
    #masters-private .masters-weekly-photo .masters-photo-frame{aspect-ratio:4/3}
    #masters-private .masters-photo-column{display:grid;gap:16px}
    #masters-private .masters-photo-card{padding:16px}
    #masters-private .masters-photo-frame{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:#eef2f7;border:2px dashed #a8b7ca;border-radius:9px;overflow:hidden;text-align:center;padding:12px;color:#556477}
    #masters-private .masters-photo-frame img{width:100%;height:100%;object-fit:contain}
    #masters-private .masters-photo-card .muted{margin:10px 0 0}
    #masters-private .masters-reference-header{background:linear-gradient(105deg,#071c38,#07528b);color:#fff;border-radius:12px;padding:18px 20px;margin:16px 0 10px;border-bottom:4px solid #f5c51b}
    #masters-private .masters-reference-header h2{color:#fff;margin:0;font-size:clamp(20px,3vw,31px)}
    #masters-private .masters-reference-header p{margin:5px 0 0;color:#e8f1ff}
    #masters-private .masters-tabs{display:flex;gap:5px;overflow-x:auto;padding:4px 0 12px;scrollbar-width:thin}
    #masters-private .masters-tabs button{flex:0 0 auto;border:1px solid #245580;border-radius:7px;background:#07315b;color:#fff;padding:11px 14px;font-weight:700;cursor:pointer}
    #masters-private .masters-tabs button[aria-selected=true]{background:#f6c529;color:#102d4b;border-color:#c99d08}
    #masters-private .masters-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(290px,1fr);gap:14px;align-items:start}
    #masters-private .masters-dashboard-main{min-width:0}
    #masters-private .masters-section-title{background:#082f59;color:#fff;border-radius:7px 7px 0 0;padding:11px 14px;font-size:1.12rem;font-weight:800}
    #masters-private .masters-dashboard-main .masters-scroll{margin:0;border:1px solid #b8c9dc;border-radius:0 0 8px 8px}
    #masters-private .masters-dashboard-main .masters-scroll th{background:#092e51;color:#fff;padding:8px 6px}
    #masters-private .masters-dashboard-main .masters-scroll td{padding:6px;text-align:center}
    #masters-private .masters-dashboard-main .masters-scroll td:first-child{text-align:left;font-weight:650}
    #masters-private .masters-dashboard-main .masters-scroll tr.masters-position-header th{background:#17467d;color:#fff;text-align:left;padding:7px 12px;border-top:3px solid #f6c529;font-size:.88rem;letter-spacing:.02em}
    #masters-private .masters-dashboard-main .masters-scroll tr.masters-position-header th:first-child{position:sticky;left:0;z-index:3}
    #masters-private .masters-dashboard-main .masters-scroll tr.masters-position-header th:not(:first-child){background:#17467d}
    #masters-private .masters-dashboard-main .masters-scroll .masters-cell{min-height:38px;display:flex;align-items:center;justify-content:center;border-radius:5px;font-weight:800;min-width:48px}
    #masters-private .masters-dashboard-main .masters-scroll .masters-cell.present{background:#d5f4dd;color:#067632}
    #masters-private .masters-dashboard-main .masters-scroll .masters-cell.absent{background:#ffe0e0;color:#b81919}
    #masters-private .masters-dashboard-main .masters-scroll .masters-cell.paid.absent{background:#c8f2d2;color:#087336}
    #masters-private .masters-attendance-editor-tabs{display:flex;gap:8px;margin:12px 0}
    #masters-private .masters-attendance-editor-tabs button[aria-selected="true"]{background:#e0ac28;color:#102b4a;font-weight:800}
    #masters-private .masters-editor-tab-panel[hidden]{display:none}
    #masters-private .masters-dashboard-main .masters-scroll .masters-cell.pending{background:#eef0f4;color:#4e5866}
    #masters-private .masters-dashboard-main .masters-scroll button.masters-cell{width:100%;border:1px solid #cbd4de;cursor:pointer}
    #masters-private .masters-quick-attendance{margin:12px 0 20px;padding:14px}
    #masters-private .masters-quick-nav,#masters-private .masters-quick-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:10px 0}
    #masters-private .masters-quick-nav label{flex:1;min-width:175px}
    #masters-private .masters-quick-actions button{flex:1;min-width:150px}
    #masters-private .masters-quick-summary{font-weight:700;color:#123d70}
    #masters-private .masters-quick-feedback{font-weight:700;color:#14552e;margin:6px 0;min-height:1.3em}
    #masters-private .masters-player-balances{margin:12px 0 20px}
    #masters-private .masters-balance-row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid #d8e0ea;padding:9px 4px}
    #masters-private .masters-has-debt{color:#8a351c}
    #masters-private .masters-player-balance{display:block;color:#365978;font-size:.76em}
    #masters-private .masters-quick-payment{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#145082}
    #masters-private .masters-quick-payment button{padding:5px 9px;font-size:.85em}
    #masters-private .masters-quick-player:has(.masters-quick-payment){flex-wrap:wrap}
    #masters-private .masters-quick-draft-notice{color:#71520c;font-size:0.92em;font-weight:600}
    #masters-private .masters-quick-group{background:#082e58;color:#fff;padding:9px 12px;margin:12px 0 0;border-left:5px solid #ffd22e;border-radius:5px}
    #masters-private .masters-quick-player{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 3px;border-bottom:1px solid #dce4ee}
    #masters-private .masters-quick-player>span{font-weight:600;min-width:0;overflow-wrap:anywhere}
    #masters-private .masters-quick-staff small{color:#52677f;text-align:right}
    #masters-private .masters-quick-choices{display:flex;gap:5px;flex-shrink:0}
    #masters-private .masters-quick-choice{min-width:68px;padding:9px 6px;border:1px solid #a6b8ca;border-radius:7px;background:#f6f8fa;color:#183b60}
    #masters-private .masters-quick-choice.is-yes{background:#08772b;color:white;border-color:#08772b}
    #masters-private .masters-quick-choice.is-no{background:#c8202c;color:white;border-color:#c8202c}
    @media(max-width:640px){#masters-private .masters-quick-attendance{padding:10px}#masters-private .masters-quick-player{font-size:14px}#masters-private .masters-quick-choice{min-width:62px}}
    #masters-private .masters-dashboard-side{min-width:0;display:grid;gap:14px}
    #masters-private .masters-foot-multi{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px;padding:12px;border:1px solid #b6c6d9;border-radius:8px;max-height:280px;overflow-y:auto}
    #masters-private .masters-foot-multi legend{font-weight:700;color:#103b70}
    #masters-private .masters-foot-choice{display:flex;gap:7px;align-items:center;padding:6px;border-bottom:1px solid #e7edf5;cursor:pointer}
    #masters-private .masters-dashboard-side .masters-photo-frame{aspect-ratio:16/10;padding:0;min-height:190px;background:#e8edf4;border:1px solid #b5c4d6}
    #masters-private .masters-dashboard-side .masters-photo-frame img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}
    #masters-private .masters-dashboard-side .masters-photo-card{padding:12px}
    #masters-private .masters-dashboard-side .masters-photo-card h3{margin:-12px -12px 12px}
    @media(max-width:850px){#masters-private .masters-dashboard-side{max-width:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#masters-private .masters-dashboard-side .masters-photo-frame{min-height:140px}}
    @media(max-width:520px){#masters-private .masters-dashboard-side{grid-template-columns:1fr}#masters-private .masters-dashboard-side .masters-photo-frame{min-height:210px}}
    #masters-private .masters-dashboard-side .masters-photo-card h3{background:#082f59;color:#fff;padding:10px 12px;border-radius:7px;margin:-16px -16px 12px}
    #masters-private .masters-tabs{background:#082f59;border-radius:9px;padding:5px;margin-bottom:12px}
    #masters-private .masters-tabs button{background:transparent;border-color:transparent;border-right:1px solid #53718d;border-radius:3px}
    #masters-private .masters-tabs button[aria-selected=true]{background:#f6c529;color:#092b4b;border-radius:6px}
    #masters-private .masters-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
    #masters-private .masters-dashboard-side .masters-photo-card{margin:0}
    #masters-private .masters-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
    #masters-private .masters-summary-card{background:#fff;border:1px solid #ced8e5;border-radius:9px;overflow:hidden;padding:0 13px 13px}
    #masters-private .masters-summary-card h3{margin:0 -13px 12px;padding:10px 13px;background:#07315b;color:#fff;font-size:1rem}
    #masters-private .masters-summary-card .masters-metric{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #e9eef5}
    #masters-private .masters-summary-card strong{font-size:1.15rem}
    #masters-private .masters-summary-card .masters-debt{color:#b51e1e}
    #masters-private .masters-section-panel[hidden]{display:none!important}
    @media(max-width:850px){#masters-private .masters-dashboard-grid{grid-template-columns:1fr}#masters-private .masters-dashboard-side{max-width:520px}#masters-private .masters-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:470px){#masters-private .masters-summary-grid{grid-template-columns:1fr 1fr;gap:7px}#masters-private .masters-summary-card{padding:0 9px 9px}#masters-private .masters-summary-card h3{margin:0 -9px 8px;padding:9px;font-size:.86rem}#masters-private .masters-summary-card .masters-metric{font-size:.78rem}#masters-private .masters-reference-header{padding:14px}#masters-private .masters-tabs button{padding:9px 11px;font-size:12px}}
    #masters-private .masters-collapsible{margin:14px 0;border:1px solid #dce2eb;border-radius:10px;background:#fff;padding:12px 14px}
    #masters-private .masters-collapsible>summary{font-weight:700;color:#173e79;cursor:pointer;padding:5px 0}
    #masters-private .masters-collapsible[open]>summary{margin-bottom:12px}
    #masters-private .masters-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch}
    #masters-private .masters-scroll table{min-width:760px;border-collapse:separate;border-spacing:0}
    #masters-private .masters-scroll th:first-child,#masters-private .masters-scroll td:first-child{position:sticky;left:0;z-index:1;background:#fff;min-width:145px;max-width:180px}
    #masters-private .masters-scroll th:first-child{z-index:2;background:#0b2d4b;color:#fff}
    #masters-private .masters-scroll td{min-width:145px}
    #masters-private .masters-scroll .masters-cell{min-height:42px;white-space:normal;overflow-wrap:anywhere}
    #masters-private .masters-rank{display:grid;grid-template-columns:minmax(90px,1fr) minmax(70px,2fr) 48px;align-items:center;gap:10px}
    #masters-private .masters-rank progress{width:100%;min-width:0}
    #masters-private .masters-audit-entry{margin:5px 0;font-size:.9rem}
    @media(max-width:720px){#masters-private .masters-scroll table{font-size:13px}#masters-private .masters-scroll td{padding:7px 5px}#masters-private .masters-scroll .masters-cell{font-size:12px;padding:7px 5px}#masters-private .masters-roster-group ul{grid-template-columns:repeat(2,minmax(0,1fr))}#masters-private .masters-roster-group li{overflow-wrap:anywhere}
#masters-private .masters-overview{grid-template-columns:1fr}#masters-private .masters-roster-group ul{grid-template-columns:repeat(auto-fit,minmax(135px,1fr))}}
  `;
  document.head.append(mastersLayoutStyle);
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
    const [trainings, attendance, staffAttendance, payments, allocations, audit] = await Promise.all([
      all('masters_trainings', 'training_date'), all('masters_attendance', 'training_id'), all('masters_staff_attendance', 'training_id'),
      all('masters_payments', 'id'), all('masters_payment_allocations', 'payment_id'),
      db.from('masters_audit').select('*').order('id', {ascending:false}).limit(100).then(checked)
    ]);
    if (token !== generation) return;
    // Read-only public football roster: no fabricated audit actor or database write.
    let footballPositions = {};
    try {
      const seasonRows = checked(await db.from('seasons').select('id').eq('start_year', 2026));
      if (seasonRows.length) {
        const footballRows = checked(await db.from('players').select('full_name,position').in('season_id', seasonRows.map(x=>x.id)));
        footballPositions = Object.fromEntries(footballRows.map(p=>[p.full_name,p.position]));
      }
    } catch (e) { console.warn('Não foi possível consultar posições do Futebol.',e); }
    if (token !== generation) return;
    state = {players, trainings, attendance, staffAttendance, payments, allocations, audit, admin, footballPositions, userId:user.id}; render();
    status(players.length ? 'Dados privados da equipa. Atualiza para consultar alterações recentes.' : 'Ainda não existem jogadores. A lista e as contas precisam de validação da direção.');
  }
  function showEditor(title) {
    const body = q('#mastersEditorBody'); body.replaceChildren(el('h3', title));
    q('#mastersEditor').showModal(); return body;
  }
  function render() {
    const s = state, body = q('#mastersData'); body.replaceChildren(); body.hidden = false;
    const staffStats=()=>s.players.filter(p=>p.sports_role==='coach'||p.sports_role==='president').map(p=>{
      const validTrainings=new Set(s.trainings.filter(t=>t.status!=='cancelled').map(t=>t.id));
      const marks=s.staffAttendance.filter(a=>a.player_id===p.id&&validTrainings.has(a.training_id)&&['present','absent'].includes(a.status));
      const present=marks.filter(a=>a.status==='present').length,absent=marks.filter(a=>a.status==='absent').length;
      return {...p,present,absent,paidAbsences:0,paid:0,balance:0,rate:marks.length?present/marks.length:null};
    });
    const currentStats=()=>[...MastersDomain.statistics(s.players.filter(p=>p.sports_role!=='coach'&&p.sports_role!=='president'),s.trainings,s.attendance,s.allocations),...staffStats()];
    const stats = currentStats();
    const header = el('div', '', 'masters-reference-header');
    header.append(el('h2', 'G. D. MINI ÁGUIAS · MASTERS'), el('p', 'Controlo de Treinos · Época 2026/2027'));
    body.append(header);
    const tabs = el('nav', '', 'masters-tabs');
    tabs.setAttribute('aria-label','Secções Masters');
    const sections = {};
    const activate = key => {
      for (const [id, node] of Object.entries(sections)) node.hidden = id !== key;
      for (const btn of tabs.querySelectorAll('button')) btn.setAttribute('aria-selected', String(btn.dataset.section === key));
    };
    for (const [key,label] of [['treinos','📅 Treinos'],['jogadores','👥 Jogadores'],['chumbo','🏆 Pé de Chumbo'],['estatisticas','📊 Estatísticas'],['pagamentos','💳 Pagamentos'],['resumo','↗ Resumo / WhatsApp']]) {
      const btn = el('button',label);btn.type='button';btn.dataset.section=key;btn.setAttribute('aria-selected',String(key==='treinos'));btn.onclick=()=>activate(key);tabs.append(btn);
    }
    body.append(tabs);
    const section = key => {const n=el('section','','masters-section-panel');n.hidden=key!=='treinos';sections[key]=n;body.append(n);return n;};
    const trainingSection=section('treinos'), playerSection=section('jogadores'), footSection=section('chumbo'), statsSection=section('estatisticas'), paymentsSection=section('pagamentos'), summarySection=section('resumo');
    const dashboard = el('div','','masters-dashboard-grid');
    const dashboardMain=el('div','','masters-dashboard-main'),dashboardSide=el('aside','','masters-dashboard-side');
    dashboard.append(dashboardMain,dashboardSide);trainingSection.append(dashboard);
    dashboardMain.append(el('div','📅 Presenças nos Treinos','masters-section-title'));

    // Club-approved overview: position roster on the left, two photo slots on the right.
    const overview = el('div', '', 'masters-overview');
    const roster = el('section', '', 'masters-roster panel');
    roster.append(el('h3', 'Plantel · Masters 2026/27'));
    const normalizePosition = value => {
      const v = String(value || '').trim().toUpperCase();
      if (['GR','GK','GUARDA-REDES'].includes(v)) return 'GR';
      if (['DEF','DF','DEFESA','DEFESAS'].includes(v)) return 'DEF';
      if (['MED','MD','MÉDIO','MEDIO','MÉDIOS','MEDIOS'].includes(v)) return 'MED';
      if (['AVZ','AV','AVANÇADO','AVANCADO','AVANÇADOS','AVANCADOS'].includes(v)) return 'AVZ';
      return 'OUTROS';
    };
    for (const [key, label] of [['GR','GR · Guarda-redes'],['DEF','DEF · Defesas'],['MED','MED · Médios'],['AVZ','AVZ · Avançados'],['OUTROS','Posição por definir'],['coach','Treinador'],['president','Presidente']]) {
      const group = s.players.filter(p => p.active !== false && (key === 'coach' || key === 'president' ? p.sports_role === key : p.sports_role === 'player' && (normalizePosition(p.playing_position) !== 'OUTROS' ? normalizePosition(p.playing_position) : footballGroup(s.footballPositions[footballNames[p.display_name]]) || verifiedPositions[p.display_name] || 'OUTROS') === key));
      if (!group.length) continue;
      const section = el('div', '', 'masters-roster-group');
      section.append(el('h4', label));
      const list = el('ul');
      for (const p of group.sort((a,b) => a.display_name.localeCompare(b.display_name,'pt'))) list.append(el('li', p.display_name));
      section.append(list); roster.append(section);
    }
    const photos = el('div', '', 'masters-photo-column');
    const foot = el('section', '', 'masters-photo-card panel');
    foot.append(el('h3', 'Pé de Chumbo'));
    const latestFoot = [...s.trainings].filter(t => t.status === 'closed' && leadFootIds(t).length > 0).sort((a,b)=>b.training_date.localeCompare(a.training_date))[0];
    const footFrame = el('div', '', 'masters-photo-frame');
    if (latestFoot?.lead_foot_image_path) renderImage(latestFoot.lead_foot_image_path, footFrame, generation);
    else footFrame.append(el('span', 'Sem fotografia disponível'));
    foot.append(footFrame);
    if (latestFoot) foot.append(el('p', `${date(latestFoot.training_date)} · ${leadFootNames(latestFoot,s.players)}`, 'muted'));
    const trainingPhoto = el('section', '', 'masters-photo-card panel');
    trainingPhoto.append(el('h3', 'Fotografia do treino'));
    const trainingFrame = el('div', '', 'masters-photo-frame');
    const latestTrainingPhoto = [...s.trainings].filter(t=>t.training_image_path).sort((a,b)=>b.training_date.localeCompare(a.training_date))[0];
    if (latestTrainingPhoto) renderImage(latestTrainingPhoto.training_image_path, trainingFrame, generation);
    else trainingFrame.append(el('span', 'Sem fotografia do treino'));
    trainingPhoto.append(trainingFrame);
    if (latestTrainingPhoto) trainingPhoto.append(el('p', date(latestTrainingPhoto.training_date), 'muted'));
    if (s.admin) {
      const photoActions = el('div', '', 'masters-photo-actions');
      const chooseTraining = (kind) => {
        const trainings = [...s.trainings].filter(t=>t.status!=='cancelled').sort((a,b)=>b.training_date.localeCompare(a.training_date));
        if (!trainings.length) { status('Ainda não existem treinos para associar fotografias.',true); return; }
        const editor = showEditor(kind==='foot'?'Alterar fotografia Pé de Chumbo':'Alterar fotografia do treino');
        const trainingSelect = select('Treino',trainings.map(t=>[t.id,date(t.training_date)]),trainings[0].id,editor);
        editor.append(button('Continuar',()=>{q('#mastersEditor').close();trainingEditor(trainings.find(t=>t.id===trainingSelect.value));}));
      };
      foot.append(button('Alterar Pé de Chumbo',()=>chooseTraining('foot')));
      trainingPhoto.append(button('Alterar foto do treino',()=>chooseTraining('training')));
    }
    photos.append(foot, trainingPhoto);
    overview.append(roster, photos); playerSection.append(roster); dashboardSide.append(foot, trainingPhoto);
    footSection.append(el('h3','Arquivo Pé de Chumbo'));
    const totals = el('div', '', 'masters-stats');
    const totalValues=new Map();
    for (const [label, value] of [['Treinos fechados', s.trainings.filter(t => t.status === 'closed').length], ['Faltas', stats.reduce((n, p) => n + p.absent, 0)], ['Recebido', money(stats.reduce((n, p) => n + p.paid, 0))], ['Em dívida', money(stats.reduce((n, p) => n + p.balance, 0))]]) {
      const box = el('div', label), valueNode=el('strong',String(value));box.append(valueNode);totals.append(box);totalValues.set(label,valueNode);
    }
    statsSection.append(totals);
    const balanceSection=el('section','','masters-player-balances');balanceSection.append(el('h3','Saldo por jogador · treinos fechados'));
    const balanceList=el('div','','masters-balances-list');balanceSection.append(balanceList);
    paymentsSection.prepend(balanceSection);
    function refreshStatistics(){
      const freshStats=currentStats();
      const sum=(key)=>freshStats.filter(p=>p.sports_role!=='coach'&&p.sports_role!=='president').reduce((n,p)=>n+(p[key]||0),0);
      totalValues.get('Treinos fechados').textContent=String(s.trainings.filter(t=>t.status==='closed').length);
      totalValues.get('Faltas').textContent=String(sum('absent'));
      totalValues.get('Recebido').textContent=money(sum('paid'));
      totalValues.get('Em dívida').textContent=money(sum('balance'));
      balanceList.replaceChildren();
      for(const p of freshStats.filter(p=>s.players.find(x=>x.id===p.id)?.sports_role==='player').sort((a,b)=>a.display_name.localeCompare(b.display_name,'pt'))){
        const row=el('div','','masters-balance-row');
        row.append(el('strong',p.display_name),el('span','Presenças: '+p.present+' · Faltas: '+p.absent+' · Faltas pagas: '+p.paidAbsences+' · Pago: '+money(p.paid)+' · Por pagar: '+money(p.balance)));
        if(p.balance>0)row.classList.add('masters-has-debt');
        balanceList.append(row);
      }
      const attendanceDetails=statsSection.querySelector('.masters-collapsible');
      if(attendanceDetails){
        const open=attendanceDetails.open;
        attendanceDetails.replaceChildren(el('summary','Assiduidade por jogador e staff'));
        for(const p of freshStats){const row=el('div','','masters-rank'),bar=document.createElement('progress');bar.max=1;bar.value=p.rate||0;bar.setAttribute('aria-label','Assiduidade de '+p.display_name);row.append(el('span',p.display_name),bar,el('span',p.rate===null?'—':Math.round(p.rate*100)+'%'));attendanceDetails.append(row,el('small',p.present+' presenças · '+p.absent+' faltas'+(p.sports_role==='coach'||p.sports_role==='president'?' · Staff (sem dívida)':' · '+p.paidAbsences+' pagas · '+money(p.balance)+' por pagar')));}
        attendanceDetails.open=open;
      }
      const p=sum('present'),a=sum('absent');
      for(const [key,val] of Object.entries({'Resumo da Época:Presenças':p,'Resumo da Época:Faltas':a,'Resumo da Época:Recebido':money(sum('paid')),'Resumo da Época:Por pagar':money(sum('balance')),'Assiduidade da Equipa:Presenças':p,'Assiduidade da Equipa:Faltas':a,'Assiduidade da Equipa:Taxa':p+a?Math.round(p/(p+a)*100)+'%':'—'})){
        const target=[...body.querySelectorAll('[data-masters-metric]')].find(e=>e.dataset.mastersMetric===key);if(target)target.textContent=String(val);
      }
    }
    trainingSection.append(el('p', `${s.trainings.filter(t=>t.status==='open').length} treinos abertos. As presenças e faltas marcadas já contam para a assiduidade; as dívidas só são geradas após o fecho do treino.`, 'muted'));
    const tools = el('div', '', 'masters-toolbar');
    tools.append(button('Resumo semanal para WhatsApp', summary));
    if (s.admin) tools.append(button('Preparar quartas-feiras da época', seed), button('Adicionar jogador / autorizar conta', playerEditor), button('Importar lista Excel', importPlayers));
    summarySection.append(tools); trainingSection.append(el('p', 'Legenda: ✓ Presente · ✕ Falta · P Falta paga · ◷ Por marcar · J Justificada. O pagamento nunca apaga a falta.'));
    const scroll = el('div', '', 'masters-scroll'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Grelha de presenças e pagamentos. Desloca horizontalmente para consultar todos os treinos.');
    const table = el('table'); table.append(el('caption', 'Presenças e pagamentos individuais'));
    const head = el('thead'), hr = el('tr'); hr.append(el('th', 'Jogador'));
    for (const t of s.trainings) {
      const th = el('th'); th.scope = 'col'; th.append(el('div', date(t.training_date)), el('small', {open:'Aberto',closed:'Fechado',cancelled:'Cancelado'}[t.status]));
      if (s.admin) th.append(button('Gerir', () => trainingEditor(t))); hr.append(th);
    }
    head.append(hr); table.append(head); const tb = el('tbody');
    const positionOf = p => {
      if (p.sports_role === 'coach') return 'coach';
      if (p.sports_role === 'president') return 'president';
      const manual = normalizePosition(p.playing_position);
      return manual !== 'OUTROS' ? manual : (footballGroup(s.footballPositions[footballNames[p.display_name]]) || verifiedPositions[p.display_name] || 'OUTROS');
    };
    const orderedPlayers = [...s.players].sort((a,b) => {
      const order = {GR:0,DEF:1,MED:2,AVZ:3,OUTROS:4,coach:5,president:6};
      return (order[positionOf(a)] ?? 7) - (order[positionOf(b)] ?? 7) || a.display_name.localeCompare(b.display_name,'pt');
    });
    const positionLabels = {GR:'GR · Guarda-redes',DEF:'DEF · Defesas',MED:'MED · Médios',AVZ:'AVZ · Avançados',OUTROS:'Posição por definir',coach:'Treinador',president:'Presidente'};
    const gridCells=new Map(),gridBalanceNodes=new Map();
    // Mobile-first quick attendance: one training, one save, no horizontal scrolling.
    if (s.admin) {
      const quick = el('section','','masters-quick-attendance panel');
      quick.append(el('h3','Marcação rápida de presenças'));
      const available = s.trainings.filter(t=>t.status!=='cancelled');
      const today = new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Lisbon'});
      const defaultTraining = [...available].filter(t=>t.training_date<=today).at(-1) || available.at(-1);
      // Remember the training across Android app suspension, navigation and page reloads.
      // Only a date is persisted, never attendance records or private player data.
      const selectedDateKey='mini-aguias-masters-selected-training-date';
      let rememberedDate=null;
      try { rememberedDate=window.localStorage.getItem(selectedDateKey); } catch(e) {}
      const initialTraining=available.find(t=>t.training_date===rememberedDate)||defaultTraining;
      if (initialTraining) {
        // Drafts are local, per account and per training; never sent until Save.
        const draftKey=t=>'mini-aguias-masters-draft-v1:'+s.userId+':'+t.id;
        const validIds=new Set(s.players.filter(p=>p.active!==false).map(p=>p.id));
        const validStatuses=new Set(['present','absent','pending']);
        function restoreDraft(t){
          try{
            const raw=JSON.parse(window.localStorage.getItem(draftKey(t))||'null');
            if(!raw || !Array.isArray(raw.entries))return new Map();
            return new Map(raw.entries.filter(e=>Array.isArray(e)&&e.length===2&&validIds.has(e[0])&&validStatuses.has(e[1])));
          }catch(e){return new Map();}
        }
        function persistDraft(t){
          try{
            if(draft.size)window.localStorage.setItem(draftKey(t),JSON.stringify({entries:[...draft],savedAt:Date.now()}));
            else window.localStorage.removeItem(draftKey(t));
          }catch(e){console.warn('Não foi possível guardar o rascunho local.',e);}
        }
        const nav = el('div','','masters-quick-nav');
        const dateSelect = select('Treino',available.map(t=>[t.id,date(t.training_date)]),initialTraining.id,nav);
        const rememberTraining=()=>{
          const selected=available.find(t=>t.id===dateSelect.value);
          if(selected)try{window.localStorage.setItem(selectedDateKey,selected.training_date);}catch(e){}
        };
        rememberTraining();
        const prev = button('‹ Anterior',()=>move(-1)), next=button('Seguinte ›',()=>move(1));
        nav.append(prev,next);quick.append(nav);
        const actions = el('div','','masters-quick-actions');
        const allPresent=button('✓ Marcar todos Sim',()=>{for(const p of eligible) draft.set(p.id,'present');persistDraft(available.find(t=>t.id===dateSelect.value));paint();});
        const staff=s.players.filter(p=>p.active!==false&&(p.sports_role==='coach'||p.sports_role==='president')).sort((a,b)=>(a.sports_role==='coach'?0:1)-(b.sports_role==='coach'?0:1));
        const staffStatus=(p,t)=>s.staffAttendance.find(a=>a.training_id===t.id&&a.player_id===p.id)?.status||'pending';
        const save=button('Guardar presenças',async()=>{
          const t=available.find(t=>t.id===dateSelect.value);
          const changes=eligible.filter(p=>draft.has(p.id) && draft.get(p.id)!==MastersDomain.cell(p,t,s.attendance,s.allocations).status);
          const staffChanges=staff.filter(p=>draft.has(p.id)&&draft.get(p.id)!==staffStatus(p,t));
          if (!changes.length && !staffChanges.length) {saveFeedback.textContent='Todas as presenças deste treino já estão guardadas. Para alterar, toca em Sim ou Não.';return;}
          saveFeedback.textContent='A guardar '+(changes.length+staffChanges.length)+' alterações…';
          if(t.status==='closed' && changes.some(p=>draft.get(p.id)==='pending'))throw Error('Reabre o treino antes de desmarcar uma presença já fechada.');
          // Existing paid absences must not be changed without a payment reversal.
          for(const p of changes) {
            const c=MastersDomain.cell(p,t,s.attendance,s.allocations);
            if(c.paid && draft.get(p.id)!=='absent')throw Error('A falta de '+p.display_name+' tem pagamentos associados. Estorna o pagamento antes de alterar.');
          }
          if(changes.length) checked(await db.from('masters_attendance').upsert(changes.map(p=>({player_id:p.id,training_id:t.id,status:draft.get(p.id)})),{onConflict:'training_id,player_id'}));
          const staffMarked=staffChanges.filter(p=>draft.get(p.id)!=='pending');
          const staffCleared=staffChanges.filter(p=>draft.get(p.id)==='pending');
          if(staffMarked.length) checked(await db.from('masters_staff_attendance').upsert(staffMarked.map(p=>({player_id:p.id,training_id:t.id,status:draft.get(p.id)})),{onConflict:'training_id,player_id'}));
          if(staffCleared.length) checked(await db.from('masters_staff_attendance').delete().eq('training_id',t.id).in('player_id',staffCleared.map(p=>p.id)));
          status((changes.length+staffChanges.length)+' presenças guardadas.');
          saveFeedback.textContent='✓ '+(changes.length+staffChanges.length)+' presenças guardadas com sucesso no treino de '+date(t.training_date)+'.';
          // Refresh data in place without rebuilding the entire dashboard.
          const [fresh, freshStaff]=await Promise.all([all('masters_attendance','training_id'),all('masters_staff_attendance','training_id')]);
          s.attendance=fresh;s.staffAttendance=freshStaff;draft.clear();persistDraft(t);refreshGrid(t);refreshStatistics();paint();
        });
        actions.append(allPresent,save);quick.append(actions);
        const saveFeedback=el('p','','masters-quick-feedback');saveFeedback.setAttribute('role','status');saveFeedback.setAttribute('aria-live','polite');quick.append(saveFeedback);
        const draftNotice=el('p','','masters-quick-draft-notice');quick.append(draftNotice);
        const summary=el('p','','masters-quick-summary');quick.append(summary);
        const list=el('div','','masters-quick-list');quick.append(list);
        let draft=restoreDraft(initialTraining),eligible=[];
        function move(step){const index=available.findIndex(t=>t.id===dateSelect.value);const target=available[index+step];if(target){dateSelect.value=target.id;rememberTraining();draft=restoreDraft(target);saveFeedback.textContent='';paint();}}
        function paint(){
          const t=available.find(t=>t.id===dateSelect.value);list.replaceChildren();
          eligible=orderedPlayers.filter(p=>p.active!==false&&p.sports_role==='player'&&p.attendance_eligible===true);
          let yes=0,no=0,missing=0,group='';
          for(const p of eligible){
            const c=MastersDomain.cell(p,t,s.attendance,s.allocations);
            const value=draft.get(p.id)||c.status;
            if(value==='present')yes++;else if(value==='absent')no++;else missing++;
            const pos=positionOf(p);
            if(pos!==group){group=pos;list.append(el('h4',positionLabels[pos]||pos,'masters-quick-group'));}
            const line=el('div','','masters-quick-player');
            line.append(el('span',p.display_name));
            const controls=el('div','','masters-quick-choices');
            for(const [value,label] of [['present','✓ Sim'],['absent','✕ Não']]){
              const b=button(label,()=>{const selected=draft.has(p.id)?draft.get(p.id):c.status;const next=selected===value?'pending':value;if(next===c.status)draft.delete(p.id);else draft.set(p.id,next);persistDraft(t);saveFeedback.textContent='';paint();});
              b.className='masters-quick-choice '+(draft.get(p.id)===value||(!draft.has(p.id)&&c.status===value)?(value==='present'?'is-yes':'is-no'):'');
              b.setAttribute('aria-pressed',String((draft.get(p.id)||c.status)===value));
              controls.append(b);
            }
            line.append(controls);
            if(t.status==='closed'&&c.status==='absent'){
              const paymentLine=el('div','','masters-quick-payment');
              if(c.balance>0){paymentLine.append(el('small','Por pagar: '+money(c.balance)),button('Registar pagamento',()=>attendanceEditor(p,t)));}
              else if(c.paid>0)paymentLine.append(el('small','✓ Falta paga · '+money(c.paid)));
              line.append(paymentLine);
            }
            list.append(line);
          }
          if(staff.length){
            list.append(el('h4','Staff','masters-quick-group'));
            for(const p of staff){
              const line=el('div','','masters-quick-player masters-quick-staff');
              line.append(el('span',p.display_name+' · '+(p.sports_role==='coach'?'Treinador':'Presidente')));
              const controls=el('div','','masters-quick-choices');
              const current=staffStatus(p,t);
              for(const [value,label] of [['present','✓ Sim'],['absent','✕ Não']]){
                const b=button(label,()=>{const selected=draft.has(p.id)?draft.get(p.id):current;const next=selected===value?'pending':value;if(next===current)draft.delete(p.id);else draft.set(p.id,next);persistDraft(t);saveFeedback.textContent='';paint();});
                b.className='masters-quick-choice '+((draft.get(p.id)||current)===value?(value==='present'?'is-yes':'is-no'):'');
                b.setAttribute('aria-pressed',String((draft.get(p.id)||current)===value));controls.append(b);
              }
              line.append(controls);list.append(line);
            }
          }
          summary.textContent=`Jogadores: ${eligible.length} · Sim: ${yes} · Não: ${no} · Por marcar: ${missing} · Staff: ${staff.length}`;
          const index=available.findIndex(t=>t.id===dateSelect.value);
          prev.disabled=index===0;next.disabled=index===available.length-1;
          const changed=eligible.filter(p=>draft.has(p.id)&&draft.get(p.id)!==MastersDomain.cell(p,t,s.attendance,s.allocations).status).length+staff.filter(p=>draft.has(p.id)&&draft.get(p.id)!==staffStatus(p,t)).length;
          draftNotice.textContent=changed ? 'Rascunho guardado neste dispositivo · '+changed+' alteração'+(changed===1?' pendente':'ões pendentes')+'. Carrega em Guardar para confirmar.' : '';
          save.textContent=changed ? 'Guardar '+changed+' alteração'+(changed===1?'':'ões') : 'Presenças guardadas ✓';
          save.setAttribute('aria-label',changed ? 'Guardar '+changed+' alterações de presenças' : 'Todas as presenças estão guardadas; toca para ver informação');
        }
        dateSelect.addEventListener('change',()=>{rememberTraining();draft=restoreDraft(available.find(t=>t.id===dateSelect.value));saveFeedback.textContent='';paint();});
        paint();
      } else quick.append(el('p','Ainda não existem treinos para marcar.'));
      dashboardMain.append(quick);
    }
    function refreshGrid(training){
      for(const p of orderedPlayers){
        const buttonEl=gridCells.get(training.id+':'+p.id);
        if(!buttonEl)continue;
        const c=MastersDomain.cell(p,training,s.attendance,s.allocations);
        const label=c.status==='present'?'✓':c.status==='excused'?'J':c.status==='pending'?'◷':c.status==='absent'?('✕'):'—';
        buttonEl.textContent=label;
        buttonEl.className='masters-cell '+c.status+' '+(c.due&&c.paid>=100?'paid':c.paid?'partial':'');
        buttonEl.setAttribute('aria-label',p.display_name+', '+date(training.training_date)+': '+label);
      }
      refreshGridBalances();
    }
    function refreshGridBalances(){
      const current=MastersDomain.statistics(s.players,s.trainings,s.attendance,s.allocations);
      for(const p of current){const node=gridBalanceNodes.get(p.id);if(node)node.textContent=' · Pago: '+money(p.paid)+' · Dívida: '+money(p.balance);}
    }
    let currentPosition = null;

    for (const p of orderedPlayers) {
      const position = positionOf(p);
      if (position !== currentPosition) {
        currentPosition = position;
        const groupRow = el('tr','','masters-position-header'), groupHead = el('th',positionLabels[position] || position);
        groupHead.colSpan = s.trainings.length + 1; groupHead.scope = 'rowgroup'; groupRow.append(groupHead); tb.append(groupRow);
      }
      const row = el('tr'), name = el('td', p.display_name); row.append(name);
      name.append(el('small', ` · ${roles[p.sports_role] || 'Jogador'}${p.playing_position ? ' · ' + p.playing_position : ''}`));
      if (s.admin) name.append(button('Conta', () => playerEditor(p)));
      if(p.sports_role==='player' && p.attendance_eligible===true){const balance=el('small','','masters-player-balance');name.append(balance);gridBalanceNodes.set(p.id,balance);}
      for (const t of s.trainings) {
        const c = MastersDomain.cell(p, t, s.attendance, s.allocations), td = el('td');
        const text = t.status === 'cancelled' ? '—' : p.attendance_eligible !== true ? (p.attendance_eligible === false ? '—' : '?') : c.status === 'present' ? '✓' : c.status === 'excused' ? 'J' : c.status === 'pending' ? '◷' : c.status === 'absent' ? ('✕') : '—';
        const cls = `masters-cell ${c.status} ${c.due && c.paid >= 100 ? 'paid' : c.paid ? 'partial' : ''}`;
        if (s.admin && p.attendance_eligible === true && t.status !== 'cancelled') {
          const b = button(text, () => attendanceEditor(p, t)); b.className = cls; b.setAttribute('aria-label', `${p.display_name}, ${date(t.training_date)}: ${text}`); gridCells.set(t.id+':'+p.id,b); td.append(b);
        } else td.append(el('div', text, cls)); row.append(td);
      }
      tb.append(row);
    }
    table.append(tb); scroll.append(table); dashboardMain.append(scroll);refreshGridBalances();
    const attendanceDetails = el('details', '', 'masters-collapsible'); attendanceDetails.open=true; attendanceDetails.append(el('summary', 'Assiduidade por jogador e staff')); statsSection.append(attendanceDetails);
    for (const p of stats) {
      const row = el('div', '', 'masters-rank'), bar = document.createElement('progress'); bar.max = 1; bar.value = p.rate || 0; bar.setAttribute('aria-label', `Assiduidade de ${p.display_name}`);
      row.append(el('span', p.display_name), bar, el('span', p.rate === null ? '—' : `${Math.round(p.rate * 100)}%`));
      attendanceDetails.append(row, el('small', p.sports_role==='coach'||p.sports_role==='president'?`${p.present} presenças · ${p.absent} faltas · Staff (sem dívida)`:`${p.present} presenças · ${p.absent} faltas · ${p.paidAbsences} pagas · Por pagar ${money(p.balance)}`));
    }
    refreshStatistics();
    const paymentsDetails = el('details', '', 'masters-collapsible'); paymentsDetails.open=true; paymentsDetails.append(el('summary', `Pagamentos e correções (${s.payments.length})`)); paymentsSection.append(paymentsDetails);
    for (const payment of s.payments) {
      const p = s.players.find(x => x.id === payment.player_id), row = el('p', `${p?.display_name || 'Jogador'} · ${money(payment.amount_cents)} · ${new Date(payment.paid_at).toLocaleString('pt-PT')} · ${payment.note || ''}`);
      if (s.admin) row.append(button('Estornar', async () => {
        const reason = prompt('Motivo do estorno (mínimo 3 caracteres). O original fica no histórico.');
        if (!reason) return; checked(await db.rpc('masters_reverse_payment', {payment_uuid:payment.id, reason})); await load();
      })); paymentsDetails.append(row);
    }
    // Two independent weekly archives, each tied to the original training date.
    const archiveTabs=el('nav','','masters-archive-tabs');
    archiveTabs.setAttribute('aria-label','Arquivos de fotografias Masters');
    const archivePanels={};
    const archiveButtons={};
    const selectArchive=kind=>{
      for(const key of ['foot','training']){
        archivePanels[key].hidden=key!==kind;
        archiveButtons[key].setAttribute('aria-selected',String(key===kind));
      }
    };
    for(const [kind,label] of [['foot','🏆 Pé de Chumbo'],['training','📷 Fotografias dos treinos']]){
      const tab=el('button',label,'btn secondary');tab.type='button';
      tab.onclick=()=>selectArchive(kind);archiveButtons[kind]=tab;archiveTabs.append(tab);
    }
    footSection.append(el('h3','Arquivo semanal · Masters 2026/27'),archiveTabs);
    const weekly=[...s.trainings].filter(t=>t.status!=='cancelled').sort((a,b)=>b.training_date.localeCompare(a.training_date));
    for(const [kind,title] of [['foot','Pé de Chumbo'],['training','Fotografias dos treinos']]){
      const panel=el('section','','masters-weekly-archive');
      archivePanels[kind]=panel;footSection.append(panel);
      if(s.admin){
        const addPhoto=button('＋ Adicionar fotografia por data',()=>{
          if(!weekly.length){status('Cria primeiro um treino com a data pretendida.',true);return;}
          const editor=showEditor('Adicionar '+(kind==='foot'?'Pé de Chumbo':'fotografia do treino')+' ao arquivo');
          editor.append(el('p','Escolhe a data do treino. A fotografia ficará arquivada nessa semana.','muted'));
          const chosen=select('Data do treino',weekly.map(t=>[t.id,date(t.training_date)]),weekly[0].id,editor);
          editor.append(button('Continuar',()=>{
            const training=weekly.find(t=>t.id===chosen.value);
            if(!training)return;
            q('#mastersEditor').close();
            trainingEditor(training);
          }));
        });
        panel.append(addPhoto);
        panel.append(el('p','Podes adicionar fotografias a qualquer treino já criado, mesmo que ainda não tenha fotografia.','muted'));
      }
      const hasContent=t=>kind==='foot'?(!!t.lead_foot_image_path||leadFootIds(t).length>0):!!t.training_image_path;
      const entries=weekly.filter(hasContent);
      panel.append(el('p',entries.length+' semana'+(entries.length===1?'':'s')+' no arquivo de '+title+'.','muted'));
      const cards=el('div','','masters-weekly-archive-grid');panel.append(cards);
      for(const t of entries){
        const card=el('article','','masters-weekly-photo panel');
        card.append(el('h4',date(t.training_date)));
        const frame=el('div','','masters-photo-frame');
        const path=kind==='foot'?t.lead_foot_image_path:t.training_image_path;
        if(path)renderImage(path,frame,generation);
        else frame.append(el('span','Fotografia ainda não adicionada'));
        card.append(frame);
        if(kind==='foot')card.append(el('p',leadFootNames(t,s.players)||'Jogador por definir','muted'));
        if(s.admin)card.append(button('Alterar fotografia',()=>trainingEditor(t)));
        cards.append(card);
      }
      if(!entries.length)panel.append(el('p','Ainda não existem fotografias neste arquivo.','muted'));
    }
    selectArchive('foot');
    const summaryCards=el('div','','masters-summary-grid');
    const closed=s.trainings.filter(t=>t.status==='closed').length;
    const present=stats.reduce((n,p)=>n+p.present,0),absent=stats.reduce((n,p)=>n+p.absent,0);
    const paid=stats.reduce((n,p)=>n+p.paid,0),debt=stats.reduce((n,p)=>n+p.balance,0);
    const addCard=(title,rows)=>{const card=el('article','','masters-summary-card');card.append(el('h3',title));for(const [label,value,warning] of rows){const line=el('div','','masters-metric'),strong=el('strong',String(value),warning?'masters-debt':'');if(['Presenças','Faltas','Recebido','Por pagar','Taxa'].includes(label)){strong.dataset.mastersMetric=title+':'+label;}line.append(el('span',label),strong);card.append(line);}summaryCards.append(card);};
    addCard('Resumo da Época',[['Jogadores',s.players.filter(p=>p.active!==false&&p.sports_role==='player').length],['Treinos fechados',closed],['Presenças',present],['Faltas',absent],['Recebido',money(paid)],['Por pagar',money(debt),debt>0]]);
    const denominator=present+absent;addCard('Assiduidade da Equipa',[['Presenças',present],['Faltas',absent],['Taxa',denominator?Math.round(present/denominator*100)+'%':'—']]);
    const top=stats.filter(p=>p.absent>0).sort((a,b)=>b.absent-a.absent).slice(0,5);
    addCard('Faltas · Top 5',top.length?top.map(p=>[p.display_name,p.absent]):[['Sem faltas registadas','—']]);
    const next=[...s.trainings].filter(t=>t.status==='open'&&t.training_date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.training_date.localeCompare(b.training_date))[0];
    addCard('Próximo Treino',[['Data',next?date(next.training_date):'Por definir'],['Estado',next?'Aberto':'Sem treino futuro']]);
    trainingSection.append(summaryCards);
    const auditDetails = el('details', '', 'masters-collapsible'); auditDetails.append(el('summary', `Histórico técnico (${s.audit.length} alterações)`)); paymentsSection.append(auditDetails);
    for (const a of s.audit) {
      const detail = el('details'); detail.append(el('summary', `${new Date(a.created_at).toLocaleString('pt-PT')} · ${a.event_type}`));
      detail.append(el('pre', JSON.stringify(a.details, null, 2))); detail.style.overflow = 'auto'; detail.className = 'masters-audit-entry'; auditDetails.append(detail);
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
    const body=showEditor(`${p.display_name} · ${date(t.training_date)}`);
    const c=MastersDomain.cell(p,t,state.attendance,state.allocations);
    const tabs=el('div','','masters-attendance-editor-tabs');
    const presenceTab=button('Presença',()=>selectTab('presence'));
    const paymentTab=button('Pagamento',()=>selectTab('payment'));
    tabs.append(presenceTab,paymentTab);body.append(tabs);
    const presencePanel=el('section','','masters-editor-tab-panel');
    const paymentPanel=el('section','','masters-editor-tab-panel');
    body.append(presencePanel,paymentPanel);
    const selectTab=kind=>{
      presencePanel.hidden=kind!=='presence';paymentPanel.hidden=kind!=='payment';
      presenceTab.setAttribute('aria-selected',String(kind==='presence'));
      paymentTab.setAttribute('aria-selected',String(kind==='payment'));
    };
    const input=select('Presença',Object.entries(labels),c.status,presencePanel);
    presencePanel.append(button('Guardar presença',async()=>{
      checked(await db.from('masters_attendance').upsert({player_id:p.id,training_id:t.id,status:input.value}));
      await load();
    }));
    if(t.status!=='closed'){
      paymentPanel.append(el('p','O pagamento só pode ser registado depois de fechar o treino. Até lá, uma falta não gera dívida.','muted'));
    }else if(c.status!=='absent'){
      paymentPanel.append(el('p','Este jogador não tem uma falta neste treino. Seleciona Falta no separador Presença, guarda e volta ao pagamento.','muted'));
    }else if(c.balance>0){
      paymentPanel.append(el('p','Falta: 1,00 € · Já pago: '+money(c.paid)+' · Por pagar: '+money(c.balance)));
      const paymentId=crypto.randomUUID();
      const amount=field('Valor a pagar — máximo '+money(c.balance),'number',paymentPanel,(c.balance/100).toFixed(2));
      amount.min='0.01';amount.max=(c.balance/100).toFixed(2);amount.step='0.01';
      const note=field('Nota / referência','text',paymentPanel);note.maxLength=500;
      paymentPanel.append(button('Confirmar pagamento',async()=>{
        if(!amount.reportValidity())return;
        const cents=Math.round(Number(amount.value)*100);
        if(!Number.isInteger(cents)||cents<=0||cents>c.balance)throw Error('Valor inválido.');
        checked(await db.rpc('masters_record_payment',{payment_uuid:paymentId,target_player:p.id,cents,allocations:[{training_id:t.id,amount_cents:cents}],memo:note.value}));
        await load();
      }));
    }else{
      paymentPanel.append(el('p','✓ Falta paga na totalidade ('+money(c.paid)+').','muted'));
    }
    paymentPanel.append(el('p','O pagamento não altera a falta: a grelha mantém ✕ e muda a cor para verde quando estiver totalmente paga. Para corrigir pagamentos, usa o estorno no histórico.','muted'));
    selectTab('presence');
  }
  function trainingEditor(t) {
    const body = showEditor(`Treino ${date(t.training_date)}`);
    const statusInput = select('Estado', [['open','Aberto'],['closed','Fechado'],['cancelled','Cancelado']], t.status, body);
    const selected = new Set(leadFootIds(t));
    const chooser = el('fieldset','','masters-foot-multi');
    chooser.append(el('legend','Pé de Chumbo · seleciona um ou vários jogadores'));
    const checks = [];
    for (const p of state.players.filter(p=>p.active!==false && p.sports_role==='player').sort((a,b)=>a.display_name.localeCompare(b.display_name,'pt'))) {
      const label = el('label','','masters-foot-choice'), checkbox=document.createElement('input');
      checkbox.type='checkbox';checkbox.value=p.id;checkbox.checked=selected.has(p.id);
      label.append(checkbox,document.createTextNode(' '+p.display_name));chooser.append(label);checks.push(checkbox);
    }
    body.append(chooser);
    const image = field('Foto Pé de Chumbo · JPG (máximo 5 MB)', 'file', body); image.accept = 'image/jpeg';
    const weeklyImage = field('Foto da semana de treino · JPG (máximo 5 MB)', 'file', body); weeklyImage.accept = 'image/jpeg';
    body.append(el('p','Seleciona um ficheiro apenas para a fotografia que pretendes alterar. As fotografias anteriores ficam preservadas no armazenamento.','muted'));
    body.append(button('Guardar treino', async () => {
      const ids = checks.filter(c=>c.checked).map(c=>c.value);
      let path = ids.length ? t.lead_foot_image_path : null;
      const file = image.files[0];
      if (file && !ids.length) throw Error('Seleciona pelo menos um jogador do Pé de Chumbo.');
      if (file) {
        const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
        if (file.type !== 'image/jpeg' || file.size > 5242880 || signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) throw Error('Escolhe um JPG válido até 5 MB.');
        const bitmap = await createImageBitmap(file); bitmap.close();
        path = `${t.id}/${crypto.randomUUID()}.jpg`;
        checked(await db.storage.from('masters-lead-foot').upload(path, file, {contentType:'image/jpeg', upsert:false}));
      }
      let weeklyPath = t.training_image_path || null;
      const weeklyFile = weeklyImage.files[0];
      if (weeklyFile) {
        const signature = new Uint8Array(await weeklyFile.slice(0,3).arrayBuffer());
        if (weeklyFile.type !== 'image/jpeg' || weeklyFile.size > 5242880 || signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) throw Error('Escolhe um JPG válido até 5 MB para a fotografia do treino.');
        const bitmap = await createImageBitmap(weeklyFile); bitmap.close();
        weeklyPath = `${t.id}/training-${crypto.randomUUID()}.jpg`;
        checked(await db.storage.from('masters-lead-foot').upload(weeklyPath,weeklyFile,{contentType:'image/jpeg',upsert:false}));
      }
      // A lost response may follow a committed update. Keep the private JPG:
      // deleting here could break the saved record and its audit history.
      checked(await db.from('masters_trainings').update({status:statusInput.value, lead_foot_player_id:ids[0] || null, lead_foot_player_ids:ids, lead_foot_image_path:ids.length ? path : null, training_image_path:weeklyPath}).eq('id', t.id));
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
    const text = `Mini-Águias Masters · ${date(t.training_date)}\nPresentes: ${cells.filter(c => c.status === 'present').length}\nFaltas: ${cells.filter(c => c.status === 'absent').length}\nJustificadas: ${cells.filter(c => c.status === 'excused').length}\nPé de Chumbo: ${leadFootNames(t,state.players)}`;
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
