// Real localhost Auth, PostgREST, PostgreSQL and Storage. No request mocks.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const out = path.join(root,'test-results');
const config = JSON.parse(fs.readFileSync(path.join(out,'masters-local-runtime.json'),'utf8'));
// WSL relay occupies 127.0.0.1; use another loopback address without changing global services.
const base = config.API_URL.replace('http://127.0.0.1:', 'http://127.0.0.2:');
assert.equal(new URL(base).hostname,'127.0.0.2');
assert.equal(new URL(base).port,'57421');
const anon = config.ANON_KEY, service = config.SERVICE_ROLE_KEY;
assert(anon && service, 'Local legacy JWT keys required for the test runner');
const password = 'Masters-Local-Test-2026!';
const runId = randomUUID().slice(0,8), results=[];
let browser, server, diagnosticPage;
async function request(endpoint, {token=anon,method='GET',body,headers={}}={}) {
 const response=await fetch(base+endpoint,{method,headers:{apikey:anon,Authorization:'Bearer '+token,...(body && !Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
 const text=await response.text(); let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,ok:response.ok,data};
}
function success(r){assert(r.ok,JSON.stringify(r));return r.data;}
function denied(r){assert(!r.ok,JSON.stringify(r));}
async function test(name, fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS: '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}}
async function createUser(name,metadata={}) {
 const email=`masters-${runId}-${name}@example.test`;
 const data=success(await request('/auth/v1/admin/users',{method:'POST',token:service,headers:{apikey:service},body:{email,password,email_confirm:true,app_metadata:metadata}}));
 const user=data.user||data;
 const login=success(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));
 return {id:user.id,email,token:login.access_token};
}
async function patch(table,filter,body,token){return request(`/rest/v1/${table}?${filter}`,{method:'PATCH',token,body,headers:{Prefer:'return=representation'}});}
async function insert(table,body,token){return request('/rest/v1/'+table,{method:'POST',token,body,headers:{Prefer:'return=representation'}});}
async function rpc(name,body,token){return request('/rest/v1/rpc/'+name,{method:'POST',token,body});}
async function loginUI(page, selector, user){await page.locator(selector+' [name=email]').fill(user.email);await page.locator(selector+' [name=password]').fill(password);await page.locator(selector).getByRole('button',{name:'Entrar',exact:true}).click();}
async function emailLink(email,type='signup'){
 for(let attempt=0;attempt<30;attempt++){
  const list=await (await fetch('http://127.0.0.2:57424/api/v1/messages')).json();
  for(const message of (list.messages||[]).filter(m=>(m.To||[]).some(t=>t.Address===email))){const detail=await (await fetch('http://127.0.0.2:57424/api/v1/message/'+message.ID)).json();const link=(detail.HTML||'').match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/);if(link){const url=link[1].replaceAll('&amp;','&');if(new URL(url).searchParams.get('type')===type)return url;}}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('No verification email captured in local Mailpit for '+email);
}
(async()=>{
 const admin=await createUser('admin',{role:'admin'}), member=await createUser('member'), outsider=await createUser('outsider'), editor=await createUser('editor',{role:'editor'});
 await test('Real Auth: correct credentials, invalid password, four distinct profiles',async()=>{
  for(const u of [admin,member,outsider,editor])assert(u.token && u.id);
  denied(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:member.email,password:'wrong-password'}}));
 });
 const assets=path.join(out,'masters-integration-assets');fs.mkdirSync(assets,{recursive:true});
 for(const [name,url] of [['sdk.js','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'],['xlsx.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js']]){
  const file=path.join(assets,name);if(!fs.existsSync(file)){const r=await fetch(url);assert(r.ok);fs.writeFileSync(file,await r.text());}
 }
 const source=fs.readFileSync(path.join(root,'index.html'),'utf8')
  .replace(/const SUPA_URL='[^']+'/,`const SUPA_URL='${base}'`).replace(/const SUPA_KEY='[^']+'/,`const SUPA_KEY='${anon}'`)
  .replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/sdk.js').replace('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','/xlsx.js');
 assert(!source.includes('dchthzmnldvvwnmhhlvf.supabase.co'));
 assert(!source.includes(service));
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.2');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(source);}
  if(!url.pathname.startsWith('/assets/')&&!['/sdk.js','/xlsx.js','/masters.js','/masters-domain.js','/masters.css','/content.js','/content.css','/manifest.webmanifest'].includes(url.pathname)){res.statusCode=404;return res.end();}
  let file=['/sdk.js','/xlsx.js'].includes(url.pathname)?path.join(assets,url.pathname.slice(1)):path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(57430,'127.0.0.2',resolve));
 assert.equal((await fetch('http://127.0.0.2:57430/test-results/masters-local-runtime.json')).status,404);
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
 diagnosticPage=page;
 const errors=[],productionRequests=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.2')return route.continue();if(u.hostname.endsWith('.supabase.co'))productionRequests.push(u.hostname);return route.abort();});
 await page.goto('http://127.0.0.2:57430/#masters-private');
 await loginUI(page,'#mastersLogin',admin);
 await page.locator('#mastersData:not([hidden])').waitFor();
 await test('Real XLSX reader → 28 fictional members → HTTP/PostgreSQL insert',async()=>{
  await page.getByRole('button',{name:'Importar lista Excel',exact:true}).click();
  const encoded=await page.evaluate(()=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Ignorar']]),'Antiga');XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Nome'],...Array.from({length:28},(_,i)=>['Membro fictício '+String(i+1).padStart(2,'0')]),['TOTAL']]),'Folha1');return XLSX.write(w,{bookType:'xlsx',type:'base64'});});
  await page.getByLabel('Ficheiro Excel').setInputFiles({name:'masters-ficticios.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(encoded,'base64')});
  await page.getByLabel('Última linha dos jogadores').fill('29');
  assert.equal(await page.locator('dialog ol li').count(),28);
  await page.getByRole('button',{name:'Confirmar e importar os 28 nomes apresentados'}).click();
  await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal(success(await request('/rest/v1/masters_players?select=id',{token:admin.token})).length,28);
 });
 const players=success(await request('/rest/v1/masters_players?select=*&order=display_name',{token:admin.token})), player=players[0];
 await test('Real RLS: visitor, outsider, reader, admin and unsupported editor',async()=>{
  success(await patch('masters_players','id=eq.'+player.id,{auth_user_id:member.id},admin.token));
  success(await patch('masters_players','id=eq.'+players[26].id,{sports_role:'coach',attendance_eligible:null},admin.token));
  success(await patch('masters_players','id=eq.'+players[27].id,{sports_role:'president',attendance_eligible:null},admin.token));
  denied(await request('/rest/v1/masters_players?select=id'));
  for(const u of [outsider,editor])assert.deepEqual(success(await request('/rest/v1/masters_players?select=id',{token:u.token})),[]);
  assert.equal(success(await request('/rest/v1/masters_players?select=id',{token:member.token})).length,28);
  denied(await insert('masters_players',{display_name:'Forbidden'},member.token));
  assert.deepEqual(success(await patch('masters_players','id=eq.'+player.id,{sports_role:'president'},member.token)),[]);
  denied(await insert('masters_players',{display_name:' membro fictício 01 '},admin.token));
  success(await request('/auth/v1/user',{method:'PUT',token:outsider.token,body:{data:{role:'admin'}}}));
  const refreshed=success(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:outsider.email,password}}));
  assert.deepEqual(success(await request('/rest/v1/masters_players?select=id',{token:refreshed.access_token})),[]);
 });
 let training;
 await test('Real training closure, pending staff and future/cancelled restrictions',async()=>{
  training=success(await rpc('masters_create_training',{day:'2026-10-21'},admin.token));
  denied(await patch('masters_trainings','id=eq.'+training,{status:'closed'},admin.token));
  for(const p of players.slice(0,26))success(await patch('masters_attendance',`training_id=eq.${training}&player_id=eq.${p.id}`,{status:'absent'},admin.token));
  denied(await patch('masters_attendance',`training_id=eq.${training}&player_id=eq.${players[26].id}`,{status:'absent'},admin.token));
  success(await patch('masters_trainings','id=eq.'+training,{status:'closed'},admin.token));
  const future=success(await rpc('masters_create_training',{day:'2027-06-30'},admin.token));
  denied(await patch('masters_trainings','id=eq.'+future,{status:'closed'},admin.token));
  success(await patch('masters_trainings','id=eq.'+future,{status:'cancelled'},admin.token));
  denied(await rpc('masters_record_payment',{payment_uuid:randomUUID(),target_player:player.id,cents:100,allocations:[{training_id:future,amount_cents:100}]},admin.token));
 });
 const pay=(id,cents)=>rpc('masters_record_payment',{payment_uuid:id,target_player:player.id,cents,allocations:[{training_id:training,amount_cents:cents}]},admin.token);
 await test('Real partial payments, double-payment refusal, reversals and preserved audit',async()=>{
  const first=randomUUID(),second=randomUUID();success(await pay(first,50));success(await pay(second,50));
  denied(await rpc('masters_record_payment',{payment_uuid:randomUUID(),target_player:players[1].id,cents:50,allocations:[{training_id:training,amount_cents:100}]},admin.token));
  denied(await patch('masters_payments','id=eq.'+first,{amount_cents:1},admin.token));
  denied(await pay(randomUUID(),1));denied(await pay(second,50));
  denied(await patch('masters_attendance',`training_id=eq.${training}&player_id=eq.${player.id}`,{status:'present'},admin.token));
  denied(await patch('masters_trainings','id=eq.'+training,{status:'open'},admin.token));
  success(await rpc('masters_reverse_payment',{payment_uuid:first,reason:'Correção fictícia'},admin.token));
  assert.equal(success(await request(`/rest/v1/masters_payment_allocations?select=amount_cents&player_id=eq.${player.id}`,{token:admin.token})).reduce((n,x)=>n+x.amount_cents,0),50);
  success(await pay(randomUUID(),50));
  assert(success(await request('/rest/v1/masters_audit?select=id&event_type=eq.masters_payments.delete',{token:admin.token})).length>0);
 });
 const jpeg=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=4;return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
 await test('Real HTTP RLS matrix over all six private tables and unauthorized RPCs',async()=>{
  for(const table of ['masters_players','masters_trainings','masters_attendance','masters_payments','masters_payment_allocations','masters_audit']){
   denied(await request('/rest/v1/'+table+'?select=*'));
   assert(success(await request('/rest/v1/'+table+'?select=*',{token:admin.token})).length>0);
   assert(success(await request('/rest/v1/'+table+'?select=*',{token:member.token})).length>0);
   for(const u of [outsider,editor])assert.deepEqual(success(await request('/rest/v1/'+table+'?select=*',{token:u.token})),[]);
  }
  denied(await rpc('masters_create_training',{day:'2026-10-28'},member.token));
  denied(await rpc('masters_reverse_payment',{payment_uuid:randomUUID(),reason:'Sem autorização'},outsider.token));
 });
 await test('Real private JPEG Storage: admin upload, authorized download, public/outsider/write refusal',async()=>{
  const object=training+'/'+randomUUID()+'.jpg', endpoint='/storage/v1/object/masters-lead-foot/'+object;
  success(await request(endpoint,{method:'POST',token:admin.token,body:jpeg,headers:{'Content-Type':'image/jpeg'}}));
  assert((await request(endpoint,{token:member.token})).ok);
  denied(await request(endpoint,{token:outsider.token}));
  denied(await request('/storage/v1/object/public/masters-lead-foot/'+object));
  denied(await request('/storage/v1/object/masters-lead-foot/'+training+'/'+randomUUID()+'.jpg',{method:'POST',token:member.token,body:jpeg,headers:{'Content-Type':'image/jpeg'}}));
  denied(await request('/storage/v1/object/masters-lead-foot/'+training+'/'+randomUUID()+'.png',{method:'POST',token:admin.token,body:Buffer.from('png'),headers:{'Content-Type':'image/png'}}));
  denied(await request('/storage/v1/object/masters-lead-foot/'+training+'/'+randomUUID()+'.jpg',{method:'POST',token:admin.token,body:Buffer.alloc(5242881),headers:{'Content-Type':'image/jpeg'}}));
  success(await patch('masters_trainings','id=eq.'+training,{lead_foot_player_id:player.id,lead_foot_image_path:object},admin.token));
 });
 await test('Real Masters UI: paid absence blue, archive JPEG, logout and reader access, mobile/desktop',async()=>{
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await page.locator('.masters-cell.paid').first().waitFor();
  assert.equal(await page.locator('.masters-cell.paid').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(220, 236, 255)');
  await page.locator('#mastersData img').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('#mastersData img')?.naturalWidth>0);
  for(const width of [360,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.locator('#mastersLogout').click();
  await page.locator('#mastersLogin:not([hidden])').waitFor();
  assert.equal(await page.locator('#mastersData').innerText(),'');
  await loginUI(page,'#mastersLogin',member);await page.locator('#mastersData:not([hidden])').waitFor();
  assert.equal(await page.locator('#mastersData button').filter({hasText:'Gerir'}).count(),0);
 });
 let memberRecord;
 await test('Real membership revocation with an existing JWT immediately removes private reads',async()=>{
  success(await patch('masters_players','id=eq.'+player.id,{active:false},admin.token));
  assert.deepEqual(success(await request('/rest/v1/masters_payments?select=*',{token:member.token})),[]);
  await page.locator('#mastersRefresh').click();await page.getByText('Esta conta não tem acesso à área Masters.',{exact:true}).waitFor();
  assert.equal(await page.locator('#mastersData').innerText(),'');
  success(await patch('masters_players','id=eq.'+player.id,{active:true},admin.token));
  await page.locator('#mastersRefresh').click();await page.locator('#mastersData:not([hidden])').waitFor();
 });
 await test('Real member account linkage, dues/card and self-service updates/photo',async()=>{
  const email=`masters-${runId}-socio@example.test`;
  memberRecord=success(await insert('members',{member_number:1,full_name:'Sócio fictício de integração',email,status:'active',birth_date:'1990-01-01'},admin.token))[0];
  const socio=await createUser('socio');
  const linked=success(await request('/rest/v1/members?id=eq.'+memberRecord.id,{token:socio.token}))[0];assert.equal(linked.user_id,socio.id);
  success(await insert('membership_payments',{member_id:memberRecord.id,coverage_start:'2026-01-01',coverage_end:'2027-12-31',payment_type:'annual',months_count:12,amount:12},admin.token));
  await page.locator('#mastersLogout').click();await page.locator('#mastersLogin:not([hidden])').waitFor();
  await page.goto('http://127.0.0.2:57430/#area-socio');await loginUI(page,'#memberLogin',socio);
  await page.locator('#memberPortal:not(.hidden)').waitFor();
  assert((await page.locator('#cardName').innerText()).includes('Sócio fictício'));
  await page.locator('#cardValidity').filter({hasText:'Quota válida'}).waitFor();
  assert((await page.locator('#cardValidity').innerText()).includes('Quota válida'));
  await page.locator('#memberSelfEdit [name=phone]').fill('910000001');await page.locator('#memberSelfEdit button').click();
  await page.getByText('Dados atualizados.',{exact:true}).waitFor();
  assert.equal(success(await request('/rest/v1/members?id=eq.'+memberRecord.id,{token:socio.token}))[0].phone,'910000001');
  await page.locator('#memberSelfPhoto').setInputFiles({name:'ficticio.jpg',mimeType:'image/jpeg',buffer:jpeg});await page.locator('#memberSelfPhotoButton').click();
  await page.getByText('Fotografia atualizada.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#cardPhotoSlot')?.naturalWidth>0);
  denied(await patch('members','id=eq.'+memberRecord.id,{member_number:999},socio.token));
  assert.deepEqual(success(await request('/rest/v1/members?select=id',{token:outsider.token})),[]);
  await page.locator('#memberLogout').click();await page.locator('#memberLogin').waitFor();
 });
 let signupEmail;
 await test('Real existing account claims its subsequently registered member record',async()=>{
  const record=success(await insert('members',{member_number:3,full_name:'Sócio fictício com conta existente',email:member.email,status:'active'},admin.token))[0];
  await page.goto('http://127.0.0.2:57430/#area-socio');await loginUI(page,'#memberLogin',member);
  await page.locator('#memberPortal:not(.hidden)').waitFor();
  assert.equal(success(await request('/rest/v1/members?id=eq.'+record.id,{token:member.token}))[0].user_id,member.id);
  await page.locator('#memberLogout').click();await page.locator('#memberLogin').waitFor();
 });
 await test('Real member signup, local SMTP confirmation and automatic account linkage',async()=>{
  signupEmail=`masters-${runId}-signup@example.test`;
  success(await insert('members',{member_number:2,full_name:'Sócio fictício novo',email:signupEmail,status:'active'},admin.token));
  await page.goto('http://127.0.0.2:57430/#area-socio');
  await page.locator('#memberSignup [name=email]').fill(signupEmail);await page.locator('#memberSignup [name=password]').fill(password);
  await page.locator('#memberSignup').getByRole('button',{name:'Criar conta',exact:true}).click();
  await page.locator('#memberSignupMsg').filter({hasText:'Conta criada'}).waitFor();
  const link=await emailLink(signupEmail);assert.equal(new URL(link).hostname,'127.0.0.2');
  await page.goto(link);await page.locator('#memberPortal:not(.hidden)').waitFor({state:'attached'});
  await page.evaluate(()=>{location.hash='area-socio';});await page.locator('#memberPortal:not(.hidden)').waitFor();
  assert.equal(await page.locator('#cardName').innerText(),'Sócio fictício novo');
  await page.locator('#memberLogout').click();await page.locator('#memberLogin').waitFor();
 });
 await test('Real password recovery through local email, update and login with new password',async()=>{
  await page.locator('#memberLogin [name=email]').fill(signupEmail);await page.locator('#forgotBtn').click();
  await page.locator('#memberLoginMsg').filter({hasText:'Foi enviado um email'}).waitFor();
  const link=await emailLink(signupEmail,'recovery');assert.equal(new URL(link).hostname,'127.0.0.2');
  await page.goto(link);await page.locator('#recoveryBox:not(.hidden)').waitFor();
  const changed='Changed-Local-Password-2026!';
  await page.locator('#recoveryForm [name=password]').fill(changed);await page.locator('#recoveryForm button').click();
  await page.locator('#recoveryMsg').filter({hasText:'Palavra-passe atualizada.'}).waitFor();
  success(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:signupEmail,password:changed}}));
  denied(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:signupEmail,password}}));
  await page.evaluate(()=>db.auth.signOut());
 });
 await test('Real public fixtures: history, fishing, season/team and published gallery JPEG',async()=>{
  const team=success(await insert('teams',{name:'Equipa fictícia de ensaio',slug:'masters'},admin.token))[0];
  const season=success(await insert('seasons',{label:'2026/27 fictícia',slug:'ensaio-2026',start_year:2026,end_year:2027,visible:true,current_season:true},admin.token))[0];
  success(await insert('players',{team_id:team.id,season_id:season.id,full_name:'Atleta público fictício',position:'Médio'},admin.token));
  const standing={team_name:'Equipa fictícia de ensaio',position:1,played:1,wins:1,points:3};
  denied(await insert('masters_standings',standing,admin.token));
  success(await insert('masters_standings',standing,service));
  success(await insert('club_history',{id:'main',title:'História fictícia do ensaio',body:'Conteúdo exclusivamente fictício para regressão.',published:true},admin.token));
  success(await insert('fishing_content',{title:'Pesca fictícia de ensaio',body:'Registo de teste',published:true},admin.token));
  const object='gallery/'+randomUUID()+'.jpg';
  success(await request('/storage/v1/object/club-memories/'+object,{method:'POST',token:admin.token,body:jpeg,headers:{'Content-Type':'image/jpeg'}}));
  success(await insert('gallery_items',{title:'Galeria fictícia de ensaio',description:'Fotografia fictícia',published:true,image_paths:[object]},admin.token));
  await page.goto('http://127.0.0.2:57430/#clube');await page.reload();await page.getByText('História fictícia do ensaio',{exact:true}).waitFor();
  await page.goto('http://127.0.0.2:57430/#pesca');await page.getByText('Pesca fictícia de ensaio',{exact:true}).waitFor();
  await page.goto('http://127.0.0.2:57430/#galeria');await page.getByText('Galeria fictícia de ensaio',{exact:true}).first().waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#galeria img')).some(i=>i.naturalWidth>0 && i.src.startsWith('blob:')));
 });
 await test('Real public membership application and email-validation request are stored privately',async()=>{
  await page.goto('http://127.0.0.2:57430/#socios');
  await page.locator('#applicationForm [name=full_name]').fill('Candidato fictício de ensaio');
  await page.locator('#applicationForm [name=gender]').selectOption('male');
  await page.locator('#applicationForm [name=email]').fill(`application-${runId}@example.test`);
  await page.locator('#applicationForm [name=consent]').check();await page.locator('#applicationForm button').click();
  await page.locator('#applicationMsg').filter({hasText:'Pedido enviado para validação.'}).waitFor();
  assert.equal(success(await request('/rest/v1/membership_applications?email=eq.application-'+runId+'@example.test',{token:admin.token})).length,1);
  await page.goto('http://127.0.0.2:57430/#area-socio');
  await page.locator('#memberEmailRequest [name=full_name]').fill('Sócio fictício sem email');
  await page.locator('#memberEmailRequest [name=birth_date]').fill('1990-01-01');
  await page.locator('#memberEmailRequest [name=requested_email]').fill(`email-request-${runId}@example.test`);
  await page.locator('#memberEmailRequest [name=consent]').check();await page.locator('#memberEmailRequest button').click();
  await page.locator('#memberEmailRequestMsg').filter({hasText:'Pedido enviado.'}).waitFor();
  assert.equal(success(await request('/rest/v1/member_email_update_requests?requested_email=eq.email-request-'+runId+'@example.test',{token:admin.token})).length,1);
  for(const table of ['membership_applications','member_email_update_requests']){
   const r=await request('/rest/v1/'+table+'?select=id');assert(!r.ok || r.data.length===0);
  }
 });
 await test('Real public-site navigation and no production requests / JavaScript errors',async()=>{
  await page.setViewportSize({width:390,height:844});
  for(const route of ['inicio','clube','futebol','pesca','galeria','socios','area-socio']){
   await page.goto('http://127.0.0.2:57430/#'+route);await page.locator('#'+route+'.site-view-active').waitFor();
  }
  assert.deepEqual(productionRequests,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'masters-real-integration-mobile.png'),fullPage:true});
 });
})().catch(async e=>{console.error(e);process.exitCode=1;if(diagnosticPage){
 const state=await diagnosticPage.evaluate(async()=>{const u=new URL(location.href);const s=await db.auth.getSession();return {host:u.host,path:u.pathname,hashKeys:[...new URLSearchParams(u.hash.slice(1)).keys()],queryKeys:[...u.searchParams.keys()],session:!!s.data.session,authError:s.error?.message,portalHidden:document.querySelector('#memberPortal').classList.contains('hidden'),storageKeys:Object.keys(localStorage)};});
 fs.writeFileSync(path.join(out,'masters-integration-failure-state.json'),JSON.stringify(state,null,2));console.error(state);
 fs.writeFileSync(path.join(out,'masters-integration-failure.txt'),await diagnosticPage.locator('body').innerText());await diagnosticPage.screenshot({path:path.join(out,'masters-integration-failure.png'),fullPage:true});}}).finally(async()=>{
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
 fs.writeFileSync(path.join(out,'masters-real-integration.json'),JSON.stringify({runId,endpoint:base,mockedRequests:false,status:process.exitCode?'FAIL':'PASS',results,remoteWrites:false},null,2));
});
