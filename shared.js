/* 線盒與成本頁共用的本機資料及照片備份。所有頁面須放在同一個 GitHub Pages 網址。 */
window.App = (() => {
  const COST_KEY = 'thread-box-cost-v1';
  const THREAD_KEY = 'thread-box-v1';
  const empty = () => ({v:1, products:[], orders:[], pieces:[], sessions:[], plans:[], categories:['繡線','布料','繡框','針具','包材','其他']});
  function readCost(){
    try {
      const d=JSON.parse(localStorage.getItem(COST_KEY));
      return d && Array.isArray(d.products) ? {...empty(),...d} : empty();
    } catch (_) {return empty();}
  }
  function writeCost(d){localStorage.setItem(COST_KEY,JSON.stringify(d)); window.dispatchEvent(new Event('app-data-change'));}
  const emptyThread = () => ({stock:{}, custom:[], projects:[], projLayout:'bar', v:1});
  function readThread(){
    try {
      const d=JSON.parse(localStorage.getItem(THREAD_KEY));
      return d && typeof d==='object' && !Array.isArray(d) ? {...emptyThread(),...d} : emptyThread();
    } catch (_) {return emptyThread();}
  }
  function writeThread(d){localStorage.setItem(THREAD_KEY,JSON.stringify(d)); window.dispatchEvent(new Event('app-data-change'));}
  const id=()=>crypto.randomUUID?.() || 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'NT$ '+Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});
  const today=()=>new Date().toLocaleDateString('sv-SE');
  const num=x=>Math.max(0,Number(x)||0);
  function photoDB(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('thread-box-photos-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('photos');
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });}
  async function allPhotos(){const db=await photoDB();return new Promise((res,rej)=>{
    const t=db.transaction('photos'),s=t.objectStore('photos'),keys=s.getAllKeys(),values=s.getAll();
    t.oncomplete=()=>{db.close();res(keys.result.map((k,i)=>[k,values.result[i]]))};
    t.onerror=()=>{db.close();rej(t.error)};
  });}
  async function putPhoto(key,value){const db=await photoDB();return new Promise((res,rej)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').put(value,key);t.oncomplete=()=>{db.close();res(key)};t.onerror=()=>rej(t.error)});}
  async function getPhoto(key){if(!key)return '';const db=await photoDB();return new Promise((res,rej)=>{const t=db.transaction('photos'),q=t.objectStore('photos').get(key);q.onsuccess=()=>res(q.result||'');q.onerror=()=>rej(q.error);t.oncomplete=()=>db.close()});}
  async function delPhoto(key){const db=await photoDB();return new Promise((res,rej)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').delete(key);t.oncomplete=()=>{db.close();res()};t.onerror=()=>rej(t.error)});}
  function compress(file){return new Promise((res,rej)=>{const reader=new FileReader();reader.onerror=()=>rej(reader.error);reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1200/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.72))};img.onerror=()=>rej(Error('無法讀取照片'));img.src=reader.result};reader.readAsDataURL(file)});}
  async function saveFiles(files, existing=[]){const ids=[...existing];for(const f of [...files].slice(0,Math.max(0,2-ids.length))){const k=id();await putPhoto(k,await compress(f));ids.push(k)}return ids;}
  async function backup(){return JSON.stringify({format:'embroidery-app-v1',created:new Date().toISOString(),thread:JSON.parse(localStorage.getItem(THREAD_KEY)||'null')||{stock:{},custom:[],projects:[],projLayout:'bar',v:1},cost:readCost(),photos:await allPhotos()});}
  async function restore(raw){const obj=JSON.parse(raw);if(obj.format!=='embroidery-app-v1'||!obj.thread||!Array.isArray(obj.cost?.products)||!Array.isArray(obj.photos))throw Error('備份格式不正確');
    // 先確認照片寫入成功，再取代文字紀錄，避免部分還原。
    const db=await photoDB();await new Promise((res,rej)=>{const t=db.transaction('photos','readwrite'),s=t.objectStore('photos');s.clear();for(const [k,v] of obj.photos)s.put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)});db.close();
    localStorage.setItem(THREAD_KEY,JSON.stringify(obj.thread));writeCost(obj.cost);
  }
  function download(name,body,type='application/json'){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([body],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)}
  // 鍵盤彈出時，iOS 不會自動縮小 vh 高度計算，對話框/浮動視窗的底部按鈕容易被鍵盤蓋住；
  // 這裡改用 visualViewport 的即時高度，動態夾住開啟中的浮動視窗高度。
  function fitDialogs(){
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.querySelectorAll('dialog[open], .modal.on, .sheet.on').forEach(el => {
      el.style.maxHeight = Math.max(200, Math.round(h * 0.92)) + 'px';
      if (!el.style.overflowY) el.style.overflowY = 'auto';
    });
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitDialogs);
    window.visualViewport.addEventListener('scroll', fitDialogs);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('focusin', e => {
      const inFloating = e.target.closest && e.target.closest('dialog[open], .modal.on, .sheet.on');
      if (inFloating) setTimeout(() => { try { e.target.scrollIntoView({block:'center', behavior:'smooth'}); } catch (_) {} }, 80);
    });
  }
  return {THREAD_KEY,readCost,writeCost,readThread,writeThread,id,esc,money,today,num,photoDB,getPhoto,delPhoto,saveFiles,backup,restore,download,fitDialogs};
})();
