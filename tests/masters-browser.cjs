const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const mock = `
window.calls=[]; window.uploads=[]; window.uploadedFiles={}; window.authCallbacks=[];
window.user={id:'u',app_metadata:{role:'admin'}};
window.fixture={masters_players:[{id:'p',display_name:'Atleta <script>alert(1)</script>',active:true,attendance_eligible:true,sports_role:'player',auth_user_id:'u'}],masters_trainings:[{id:'t',training_date:'2026-10-21',status:'closed'},{id:'t2',training_date:'2026-10-28',status:'closed'}],masters_attendance:[{training_id:'t',player_id:'p',status:'absent'},{training_id:'t2',player_id:'p',status:'present'}],masters_payments:[],masters_payment_allocations:[],masters_audit:[]};
window.switchUser=(u)=>{window.user=u;window.authCallbacks.forEach(f=>f(u?'SIGNED_IN':'SIGNED_OUT',u?{user:u}:null));};
class Query{
 constructor(t){this.t=t;this.filters=[];this.act='read';}
 select(){return this;}order(){return this;}limit(){return this;}range(){return this;}
 gte(){return this;}neq(){return this;}maybeSingle(){this.one=true;return this;}single(){this.one=true;return this;}
 eq(k,v){this.filters.push(x=>x[k]===v);return this;}
 insert(v){this.act='insert';this.v=v;return this;}update(v){this.act='update';this.v=v;return this;}upsert(v){this.act='upsert';this.v=v;return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{
 window.calls.push([this.t,this.act,this.v]);
 if(window.failRead)return {error:{message:'Falha de rede simulada'}};
 let rows=window.fixture[this.t]||[];
 if(!window.user || window.user.id==='outsider')return {data:[],error:null};
 if(this.act==='update'){rows.filter(x=>this.filters.every(f=>f(x))).forEach(x=>Object.assign(x,this.v));}
 if(this.act==='upsert'){const x=rows.find(x=>x.player_id===this.v.player_id&&x.training_id===this.v.training_id);if(x)Object.assign(x,this.v);else rows.push(this.v);}
 if(this.act==='insert')rows.push(...(Array.isArray(this.v)?this.v:[this.v]).map((v,i)=>({id:'new'+i,...v})));
 const result=rows.filter(x=>this.filters.every(f=>f(x)));
 return {data:JSON.parse(JSON.stringify(this.one?result[0]||null:result)),error:null};
 }).then(resolve,reject);}
}
window.db={from:t=>new Query(t),auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:window.user},error:null}),onAuthStateChange:f=>window.authCallbacks.push(f),signInWithPassword:async()=>({data:{user:window.user},error:null}),signOut:async()=>{window.switchUser(null);return {error:null};}},
 rpc:async(name,args)=>{window.calls.push([name,args]);if(window.failPayment)return {error:{message:'Falha de pagamento simulada'}};
 if(name==='masters_record_payment'){window.fixture.masters_payments.push({id:args.payment_uuid,player_id:args.target_player,amount_cents:args.cents,paid_at:new Date().toISOString()});for(const a of args.allocations)window.fixture.masters_payment_allocations.push({...a,player_id:args.target_player,payment_id:args.payment_uuid});}
 return {data:'new',error:null};},
 storage:{from:()=>({upload:async(p,f)=>{window.uploads.push(p);window.uploadedFiles[p]=f;return {data:{path:p}};},download:async p=>({data:window.uploadedFiles[p]||new Blob(['jpg'],{type:'image/jpeg'})}),remove:async()=>({data:[]})})}};
`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://mini.test/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/mock.js')return route.fulfill({contentType:'application/javascript',body:mock});
  if(url.pathname==='/full.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'))});
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="masters.css"><section id="masters-private"></section><script src="mock.js"></script><script src="masters-domain.js"></script><script src="masters.js"></script>'});
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,url.pathname))});
 });
 await page.goto('https://mini.test/#masters-private');
 await page.locator('#mastersData:not([hidden])').waitFor({timeout:5000}).catch(async e=>{console.error(await page.locator('body').innerText(), errors);throw e;});
 assert.equal(await page.locator('#mastersData script').count(),0);
 await page.getByRole('button',{name:/Atleta.*21\/10\/2026/}).click();
 await page.getByLabel(/Alocar pagamento/).fill('0.50');
 await page.getByRole('button',{name:'Registar pagamento individual'}).click();
 await page.getByRole('button',{name:/Atleta.*Parcial/}).waitFor();
 assert.equal((await page.evaluate(()=>window.calls.find(x=>x[0]==='masters_record_payment')))[1].cents,50);
 await page.getByRole('button',{name:/Atleta.*Parcial/}).click();
 await page.evaluate(()=>window.failPayment=true);
 await page.getByRole('button',{name:'Registar pagamento individual'}).click();
 await page.getByText('Falha de pagamento simulada').waitFor();
 assert.equal(await page.locator('dialog').isVisible(),true);
 await page.evaluate(()=>window.failPayment=false);
 await page.getByRole('button',{name:'Registar pagamento individual'}).click();
 await page.getByRole('button',{name:/Atleta.*Paga/}).waitFor();
 assert.equal(await page.locator('.masters-cell.paid').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(220, 236, 255)');
 const paymentCalls=await page.evaluate(()=>window.calls.filter(x=>x[0]==='masters_record_payment'));
 assert.equal(paymentCalls.at(-1)[1].payment_uuid,paymentCalls.at(-2)[1].payment_uuid,'A failed response must reuse the same payment identifier');
 await page.getByRole('button',{name:'Gerir',exact:true}).first().click();
 await page.getByLabel('Pé de Chumbo',{exact:true}).selectOption('p');
 await page.getByLabel(/JPG manual/).setInputFiles({name:'fake.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not jpeg')});
 await page.getByRole('button',{name:'Guardar treino'}).click();
 await page.getByText('Escolhe um JPG válido até 5 MB.').waitFor();
 assert.equal(await page.evaluate(()=>window.uploads.length),0);
 const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=2;return c.toDataURL('image/jpeg').split(',')[1];});
 await page.getByLabel(/JPG manual/).setInputFiles({name:'caricatura.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});
 await page.getByRole('button',{name:'Guardar treino'}).click();
 await page.locator('#mastersData img').waitFor();
 assert.equal(await page.evaluate(()=>window.uploads.length),1);
 await page.getByRole('button',{name:'Importar lista Excel'}).click();
 await page.evaluate(()=>{
  window.importRows=[['Nome'],...Array.from({length:25},(_,i)=>['Importado '+(i+1)]),[],['Aires'],['Pereira'],['TOTAL'],['Pé de Chumbo','Ribeiro']];
  window.XLSX={read:()=>({SheetNames:['Ignorar','Folha1'],Sheets:{Folha1:{}}}),utils:{sheet_to_json:()=>window.importRows,encode_col:i=>String.fromCharCode(65+i)}};
 });
 await page.evaluate(names=>{window.importRows=[['Nome'],...names.map(n=>[n]),[],['Aires'],['Pereira'],['TOTAL'],['Pé de Chumbo','Ribeiro']];}, require('./fixtures/masters-roster.cjs').members.filter(p=>!['Seabra','Aires','Pereira'].includes(p.name)).map(p=>p.name));
 await page.getByLabel('Ficheiro Excel').setInputFiles({name:'Treinos.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('fixture')});
 await page.getByText(/Folha: Folha1/).waitFor();
 assert.equal(await page.locator('dialog ol li').count(),29);
 await page.getByRole('button',{name:'Confirmar e importar os 28 nomes apresentados'}).click();
 await page.getByText('É necessária uma lista de 28 nomes distintos, sem cabeçalhos ou rodapés, até 120 caracteres cada.').waitFor();
 await page.getByLabel('Última linha dos jogadores').fill('30');
 assert.equal(await page.locator('dialog ol li').count(),28);
 await page.getByRole('button',{name:'Confirmar e importar os 28 nomes apresentados'}).click();
 await page.getByText('É necessária uma lista de 28 nomes distintos, sem cabeçalhos ou rodapés, até 120 caracteres cada.').waitFor();
 assert.equal(await page.evaluate(()=>window.fixture.masters_players.length),1);
 await page.getByLabel('Última linha dos jogadores').fill('29');
 assert.equal(await page.locator('dialog ol li').count(),27);
 await page.getByRole('button',{name:'Confirmar e importar os 28 nomes apresentados'}).click();
 await page.getByText('É necessária uma lista de 28 nomes distintos, sem cabeçalhos ou rodapés, até 120 caracteres cada.').waitFor();
 await page.getByLabel('Nome adicional (se faltar no Excel)').fill('Seabra');
 assert.equal(await page.locator('dialog ol li').count(),28);
 await page.getByRole('button',{name:'Confirmar e importar os 28 nomes apresentados'}).click();
 await page.locator('#mastersData:not([hidden])').waitFor();
 assert.equal(await page.evaluate(()=>window.fixture.masters_players.length),29);
 const imported = await page.evaluate(()=>window.fixture.masters_players.slice(1));
 assert.equal(imported.filter(p=>p.sports_role==='player').length,26);
 assert.equal(imported.find(p=>p.display_name==='Seabra').playing_position,'médio');
 for (const [name,role] of [['Aires','coach'],['Pereira','president']]) {
  assert.equal(imported.find(p=>p.display_name===name).sports_role,role);
  assert.equal(imported.find(p=>p.display_name===name).attendance_eligible,null);
 }
 await page.getByText('Elegibilidade por decidir',{exact:true}).first().waitFor();
 const airesRow = page.locator('tbody tr').filter({hasText:'Aires'});
 await airesRow.getByRole('button',{name:'Conta',exact:true}).click();
 assert.equal(await page.getByLabel('Função desportiva').inputValue(),'coach');
 assert.equal(await page.getByLabel('Controlo de presenças e faltas de 1 €').inputValue(),'pending');
 await page.getByLabel('Controlo de presenças e faltas de 1 €').selectOption('no');
 await page.getByRole('button',{name:'Guardar jogador',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.fixture.masters_players.find(p=>p.display_name==='Aires').attendance_eligible),false);
 await page.getByRole('button',{name:'Importar lista Excel'}).click();
 await page.getByLabel('Ficheiro Excel').setInputFiles({name:'Treinos.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('fixture')});
 await page.getByText(/Folha: Folha1/).waitFor();
 await page.getByLabel('Última linha dos jogadores').fill('29');
 await page.getByLabel('Nome adicional (se faltar no Excel)').fill('Seabra');
 await page.getByRole('button',{name:'Confirmar e importar os 28 nomes apresentados'}).click();
 await page.getByText('Já existem nomes desta lista. Valida os duplicados antes de importar.').waitFor();
 assert.equal(await page.evaluate(()=>window.fixture.masters_players.length),29);
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.getByRole('button',{name:'Resumo semanal para WhatsApp'}).click();
 assert((await page.locator('dialog textarea').inputValue()).includes('Presentes: 1'));
 assert(!(await page.locator('dialog textarea').inputValue()).includes('Saldo'));
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 for(const width of [360,390,768,1280]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow at '+width);
 }
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
 await page.setViewportSize({width:390,height:844}); await page.screenshot({path:path.join(root,'test-results/masters-mobile.png'),fullPage:true});
 await page.evaluate(()=>window.switchUser({id:'u',app_metadata:{}}));
 await page.locator('#mastersData:not([hidden])').waitFor();
 assert.equal(await page.getByRole('button',{name:'Gerir',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Estornar',exact:true}).count(),0);
 await page.evaluate(()=>window.switchUser({id:'outsider',app_metadata:{}}));
 await page.getByText('Esta conta não tem acesso à área Masters.').waitFor();
 assert.equal(await page.locator('#mastersData').textContent(),'');
 await page.evaluate(()=>window.switchUser(null));
 await page.locator('#mastersLogin:not([hidden])').waitFor();
 assert.equal(await page.locator('#mastersData').textContent(),'');
 await page.evaluate(()=>{window.failRead=true;window.switchUser({id:'u',app_metadata:{role:'admin'}});});
 await page.getByText('Falha de rede simulada').waitFor();
 assert.equal(await page.locator('#mastersData').textContent(),'');
 assert.deepEqual(errors,[]);
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().includes('supabase')?mock+'\nwindow.supabase={createClient:()=>window.db};':''}));
 await page.goto('https://mini.test/full.html#masters-private');
 await page.locator('#mastersData:not([hidden])').waitFor();
 assert.equal(await page.locator('#masters-private').evaluate(n=>n.classList.contains('site-view-active')),true);
 assert.equal(await page.locator('#inicio').isVisible(),false);
 for(const width of [360,390,768,1280]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Integrated overflow at '+width);
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{window.fixture.masters_players[0].display_name='Jogador de teste';});
 await page.getByRole('button',{name:'Atualizar',exact:true}).click();
 await page.getByText('Jogador de teste',{exact:true}).first().waitFor();
 await page.screenshot({path:path.join(root,'test-results/masters-integrated-mobile.png'),fullPage:true});
 await page.evaluate(()=>{location.hash='area-socio';});
 await page.locator('#area-socio.site-view-active').waitFor();
 assert.equal(await page.locator('#mastersData').textContent(),'');
 assert.equal(await page.locator('#area-socio h2').innerText(),'Área de Sócio');
 await page.evaluate(()=>{location.hash='futebol';});
 await page.locator('#futebol.site-view-active').waitFor();
 assert.equal(await page.locator('#mastersData').textContent(),'');
 assert.deepEqual(errors,[]);
 console.log('Masters browser: private access, read-only player, signout clearing, XSS, partial/full payments, safe retry, valid/invalid JPG, 28-member Excel preview/import with Seabra and staff, duplicate rejection, summary, integrated navigation and 360–1280px passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
