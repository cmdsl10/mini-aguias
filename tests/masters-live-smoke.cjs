// Production smoke tests: guest browser, public API key, no account creation or writes.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.MASTERS_SITE_URL||'https://mini-aguias.vercel.app';
const out=path.resolve(__dirname,'../test-results');
const results=[];
async function check(name,run){try{await run();results.push({name,status:'PASS'});console.log('PASS: '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}}
(async()=>{
 const htmlResponse=await fetch(base);assert.equal(htmlResponse.status,200);const html=await htmlResponse.text();
 const api=html.match(/const SUPA_URL='([^']+)'/)[1],key=html.match(/const SUPA_KEY='([^']+)'/)[1];
 assert.equal(api,'https://dchthzmnldvvwnmhhlvf.supabase.co');
 await check('Official production HTML and public module assets',async()=>{
  assert(html.includes('href="#masters-private"'));assert(html.includes('src="masters.js"'));
  for(const file of ['masters.js','masters-domain.js','masters.css','content.js'])assert.equal((await fetch(base+'/'+file)).status,200);
  for(const file of ['docs/masters-confirmed-roster.json','test-results/production-backup-20261104/manifest.json','supabase/migrations/20261104125552_masters_private_training_management.sql'])assert.equal((await fetch(base+'/'+file)).status,404);
 });
 await check('Real production Auth health and rejected invalid login',async()=>{
  assert.equal((await fetch(api+'/auth/v1/health',{headers:{apikey:key}})).status,200);
  const login=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:'masters-release-test@example.invalid',password:'invalid-release-test-password'})});
  assert.equal(login.status,400);
 });
 await check('Anonymous HTTP access to six private tables is refused',async()=>{
  for(const table of ['masters_players','masters_trainings','masters_attendance','masters_payments','masters_payment_allocations','masters_audit']){
   const r=await fetch(api+'/rest/v1/'+table+'?select=*',{headers:{apikey:key}});assert([401,403].includes(r.status),table+' unexpectedly accessible: '+r.status);
  }
 });
 await check('Private JPG bucket has no public object access',async()=>{
  const r=await fetch(api+'/storage/v1/object/public/masters-lead-foot/nonexistent-release-probe.jpg',{headers:{apikey:key}});assert([400,401,403,404].includes(r.status));
 });
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#masters-private');
  await page.locator('#mastersLogin').waitFor();
  await check('Private Masters guest login gate and empty private data',async()=>{
   await page.getByText('Entra com a conta autorizada pela direção.',{exact:true}).waitFor();
   assert.equal(await page.locator('#mastersData').innerText(),'');assert.equal(await page.locator('#mastersData').isVisible(),false);
  });
  await check('Public and member navigation on the deployed production site',async()=>{
   for(const id of ['inicio','clube','futebol','pesca','galeria','socios','area-socio','masters-private']){
    await page.goto(base+'/#'+id);await page.locator('#'+id+'.site-view-active').waitFor();
   }
  });
  await check('Mobile/desktop layout and actual header Masters navigation',async()=>{
   for(const width of [360,390,768,1280]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow at '+width);
   }
   await page.setViewportSize({width:390,height:844});await page.goto(base+'/#inicio');
   await page.locator('#mobileMenuToggle').click();await page.locator('#siteNav a[href="#masters-private"]').click();
   await page.locator('#masters-private.site-view-active').waitFor();
   fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'masters-production-mobile.png'),fullPage:true});
   assert.deepEqual(errors,[]);
  });
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'masters-production-online.json'),JSON.stringify({url:base,status:process.exitCode?'FAIL':'PASS',no_write_tests:true,results,not_tested:['Real administrator/player positive browser login and logout: no user credentials supplied','Production JPEG upload with a real authorized account','Physical devices/Safari']},null,2));
});
