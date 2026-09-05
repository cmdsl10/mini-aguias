// UI tests with a deterministic Supabase double. Real RLS tests: content-rls.sql.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mock = `
window.fixture={club_history:[{id:'main',title:'História dos Mini-Águias',body:'História inicial',published:true}],gallery_items:[]};
const uploaded=new Map();
class Query {
 constructor(table){this.table=table;this.filters=[];this.orders=[];this.action='read';}
 select(){return this;} eq(k,v){this.filters.push(x=>x[k]===v);return this;} neq(k,v){this.filters.push(x=>x[k]!==v);return this;}
 gte(){return this;} order(k){this.orders.push(k);return this;} limit(){return this;}
 maybeSingle(){this.one=true;return this;} single(){this.one=true;return this;}
 insert(v){this.action='insert';this.value=v;return this;} upsert(v){this.action='upsert';this.value=v;return this;}
 update(v){this.action='update';this.value=v;return this;} delete(){this.action='delete';return this;}
 then(resolve,reject){return Promise.resolve().then(()=>{
 let rows=window.fixture[this.table]||[];let selected=rows.filter(x=>this.filters.every(f=>f(x)));
 if(this.action==='insert'){selected=[{created_at:new Date().toISOString(),...this.value}];rows.push(...selected);}
 if(this.action==='upsert'){selected=[this.value];rows=rows.filter(x=>x.id!==this.value.id).concat(selected);}
 if(this.action==='update')selected.forEach(x=>Object.assign(x,this.value));
 if(this.action==='delete')rows=rows.filter(x=>!selected.includes(x));
 window.fixture[this.table]=rows;
 if(this.action==='read')selected.sort((a,b)=>{for(const k of this.orders){if(a[k]<b[k])return -1;if(a[k]>b[k])return 1;}return 0;});
 return {data:JSON.parse(JSON.stringify(this.one?selected[0]||null:selected)),error:null};
 }).then(resolve,reject);}
}
window.supabase={createClient:()=>({from:t=>new Query(t),rpc:async()=>({data:[],error:null}),auth:{getUser:async()=>({data:{user:{app_metadata:{role:'admin'}}}}),onAuthStateChange:()=>{}},storage:{from:()=>({upload:async(p,f)=>{if(window.failUpload)return {error:{message:'Upload de teste falhou'}};uploaded.set(p,f);return {data:{path:p}};},download:async p=>({data:uploaded.get(p)||new Blob(['test'],{type:'image/png'})}),remove:async paths=>{paths.forEach(p=>uploaded.delete(p));return {data:[]};}})}})};
`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:mock});
  if(url.hostname!=='mini.test')return route.abort();
  const filename=path.join(root,url.pathname==='/'?'index.html':url.pathname);
  if(!fs.existsSync(filename))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.png')?'image/png':'text/html',body:fs.readFileSync(filename)});
 });
 await page.goto('https://mini.test');
 await page.locator('#historyForm input[name=title]').waitFor();
 await page.waitForFunction(()=>document.querySelector('#historyForm input[name=title]').value==='História dos Mini-Águias');
 const history=page.locator('#historyForm');
 await history.locator('[name=title]').fill('A nossa história');await history.locator('[name=body]').fill('Fundação\n\nMemória <script>alert(1)</script>');
 await history.getByRole('button',{name:'Guardar história'}).click();
 await page.waitForFunction(()=>document.querySelector('#historyContent').textContent.includes('A nossa história'));
 assert.equal(await page.locator('#historyContent script').count(),0);
 await page.locator('#newMemory').click();
 const form=page.locator('#memoryForm');await form.locator('[name=title]').fill('Jogo de estreia');await form.locator('[name=description]').fill('Duas fotografias\nUm grande dia.');await form.locator('[name=category]').fill('Jogos');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1cAAAAASUVORK5CYII=','base64');
 await form.locator('[name=images]').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:png},{name:'two.png',mimeType:'image/png',buffer:png}]);
 await form.getByRole('button',{name:'Guardar memória',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#memoryList').textContent.includes('Rascunho'));
 assert(!await page.locator('#galleryGrid').textContent().then(t=>t.includes('Jogo de estreia')));
 await page.locator('#memoryList').getByRole('button',{name:'Publicar',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#galleryGrid img').length===2);
 await page.locator('#memoryList').getByRole('button',{name:'Editar',exact:true}).click();
 await form.locator('[name=title]').fill('Vitória');await form.locator('[name=sort_order]').fill('2');
 await page.locator('#memoryPhotoList').getByRole('button',{name:'Retirar fotografia'}).first().click();
 await form.getByRole('button',{name:'Guardar memória',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#galleryGrid').textContent.includes('Vitória')&&document.querySelectorAll('#galleryGrid img').length===1);
 await page.locator('#newMemory').click();await form.locator('[name=title]').fill('Primeira memória');await form.locator('[name=sort_order]').fill('1');await form.locator('[name=published]').check();
 await form.getByRole('button',{name:'Guardar memória',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#galleryGrid h3')?.textContent==='Primeira memória');
 await page.locator('#newMemory').click();await form.locator('[name=title]').fill('Falha recuperável');
 await form.locator('[name=images]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});await page.evaluate(()=>window.failUpload=true);
 await form.getByRole('button',{name:'Guardar memória',exact:true}).click();await page.locator('#contentStatus .error').waitFor();
 assert.equal(await form.locator('[name=title]').inputValue(),'Falha recuperável');await page.evaluate(()=>window.failUpload=false);await page.locator('#cancelMemory').click();
 for(const width of [360,390,768,1280]){
  await page.setViewportSize({width,height:900});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,id:el.id,class:el.className,width:el.getBoundingClientRect().width})).slice(0,25)));
  assert.equal(overflow,false,'Horizontal overflow at '+width);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('.content-admin').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(root,'../qa-mobile.png'),fullPage:true});
 const victory=page.locator('.memory-row').filter({hasText:'Vitória'});
 await victory.getByRole('button',{name:'Despublicar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#galleryGrid').textContent.includes('Vitória'));
 await victory.getByRole('button',{name:'Apagar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#memoryList').textContent.includes('Vitória'));
 assert.deepEqual(errors,[]);console.log('PASS: history, safe text, draft, multi-photo upload, edit/remove photo, publish/unpublish, ordering, delete, upload recovery, mobile 360/390/768 and desktop 1280; no page errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
