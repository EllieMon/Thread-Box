/* Stitchly｜繡日 共用模組。所有頁面須放在同一個 GitHub Pages 網址。
   v2：材料（線材/布/物品）與常買商品合併成同一份資料，備份只有一個入口。 */
window.App = (() => {
  const THREAD_KEY = 'stitchly-materials-v1'; // 材料：庫存＋自訂線／布／物品＋配色紀錄
  const COST_KEY = 'stitchly-cost-v1';        // 成本：採購訂單／作品／工時／排程
  const emptyThread = () => ({ stock:{}, custom:[], projects:[], projLayout:'bar', v:2 });
  const emptyCost = () => ({ orders:[], pieces:[], sessions:[], plans:[], v:2 });

  function readThread(){
    try { const d=JSON.parse(localStorage.getItem(THREAD_KEY)); return d && typeof d==='object' && !Array.isArray(d) ? {...emptyThread(),...d} : emptyThread(); }
    catch (_) { return emptyThread(); }
  }
  function writeThread(d){ localStorage.setItem(THREAD_KEY, JSON.stringify(d)); window.dispatchEvent(new Event('app-data-change')); }
  function readCost(){
    try { const d=JSON.parse(localStorage.getItem(COST_KEY)); return d && Array.isArray(d.orders) ? {...emptyCost(),...d} : emptyCost(); }
    catch (_) { return emptyCost(); }
  }
  function writeCost(d){ localStorage.setItem(COST_KEY, JSON.stringify(d)); window.dispatchEvent(new Event('app-data-change')); }

  const id = () => crypto.randomUUID?.() || 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => 'NT$ '+Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});
  const today = () => new Date().toLocaleDateString('sv-SE');
  const num = x => Math.max(0, Number(x)||0);

  // ---------- 照片（IndexedDB） ----------
  function photoDB(){ return new Promise((resolve,reject)=>{
    const req=indexedDB.open('stitchly-photos-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('photos');
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });}
  async function allPhotos(){ const db=await photoDB(); return new Promise((res,rej)=>{
    const t=db.transaction('photos'),s=t.objectStore('photos'),keys=s.getAllKeys(),values=s.getAll();
    t.oncomplete=()=>{db.close();res(keys.result.map((k,i)=>[k,values.result[i]]))};
    t.onerror=()=>{db.close();rej(t.error)};
  });}
  async function putPhoto(key,value){ const db=await photoDB(); return new Promise((res,rej)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').put(value,key);t.oncomplete=()=>{db.close();res(key)};t.onerror=()=>rej(t.error)});}
  async function getPhoto(key){ if(!key)return ''; const db=await photoDB(); return new Promise((res,rej)=>{const t=db.transaction('photos'),q=t.objectStore('photos').get(key);q.onsuccess=()=>res(q.result||'');q.onerror=()=>rej(q.error);t.oncomplete=()=>db.close()});}
  async function delPhoto(key){ const db=await photoDB(); return new Promise((res,rej)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').delete(key);t.oncomplete=()=>{db.close();res()};t.onerror=()=>rej(t.error)});}
  function compress(file){ return new Promise((res,rej)=>{const reader=new FileReader();reader.onerror=()=>rej(reader.error);reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1200/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.72))};img.onerror=()=>rej(Error('無法讀取照片'));img.src=reader.result};reader.readAsDataURL(file)});}
  async function saveFiles(files, existing=[]){ const ids=[...existing]; for(const f of [...files].slice(0,Math.max(0,2-ids.length))){const k=id();await putPhoto(k,await compress(f));ids.push(k)} return ids; }

  // ---------- 單一備份入口：材料＋成本＋照片，一次打包 ----------
  async function backup(){ return JSON.stringify({ format:'stitchly-v2', created:new Date().toISOString(), thread:readThread(), cost:readCost(), photos:await allPhotos() }); }
  async function restore(raw){
    const obj = JSON.parse(raw);
    if (obj.format !== 'stitchly-v2' || !obj.thread || !Array.isArray(obj.cost?.orders) || !Array.isArray(obj.photos)) throw Error('備份格式不正確');
    const db = await photoDB();
    await new Promise((res,rej)=>{ const t=db.transaction('photos','readwrite'), s=t.objectStore('photos'); s.clear(); for (const [k,v] of obj.photos) s.put(v,k); t.oncomplete=res; t.onerror=()=>rej(t.error); });
    db.close();
    writeThread(obj.thread); writeCost(obj.cost);
  }
  function download(name, body, type='application/json'){ const a=document.createElement('a'); const u=URL.createObjectURL(new Blob([body],{type})); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),10000); }

  // ---------- 鍵盤彈出時，動態夾住浮動視窗高度，避免按鈕被蓋住 ----------
  function fitDialogs(){
    const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight;
    document.querySelectorAll('dialog[open], .modal.on, .sheet.on, .popcard.on').forEach(el => {
      el.style.maxHeight = Math.max(200, Math.round(h*0.92)) + 'px';
      if (!el.style.overflowY) el.style.overflowY = 'auto';
    });
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitDialogs);
    window.visualViewport.addEventListener('scroll', fitDialogs);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('focusin', e => {
      const inFloating = e.target.closest && e.target.closest('dialog[open], .modal.on, .sheet.on, .popcard.on');
      if (inFloating) setTimeout(() => { try { e.target.scrollIntoView({block:'center', behavior:'smooth'}); } catch (_) {} }, 80);
    });
  }

  // ---------- ⓘ 說明泡泡：任何 [data-info] 元素點下去，彈出對應文字，點外面收起 ----------
  function ensureInfoPop(){
    if (document.getElementById('infopop')) return;
    const p = document.createElement('div'); p.id = 'infopop'; p.className = 'infopop';
    document.body.appendChild(p);
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-info]');
      if (t) {
        const r = t.getBoundingClientRect();
        p.textContent = t.dataset.info;
        p.style.top = Math.round(r.bottom + 8 + window.scrollY) + 'px';
        const left = Math.min(window.innerWidth - 270, Math.max(10, r.left + window.scrollX - 90));
        p.style.left = Math.round(left) + 'px';
        p.classList.add('on');
        e.stopPropagation();
        return;
      }
      if (!e.target.closest('#infopop')) p.classList.remove('on');
    });
    window.addEventListener('scroll', () => p.classList.remove('on'), true);
  }

  // ---------- 可點擊麵包屑 ----------
  // items: [{label, href}]，最後一項不給 href（代表目前頁面）
  function breadcrumb(items){
    return '<nav class="crumbnav">' + items.map((it,i) => i < items.length-1
      ? `<a href="${it.href}">${esc(it.label)}</a><span class="sep">›</span>`
      : `<span class="cur">${esc(it.label)}</span>`).join('') + '</nav>';
  }

  // ---------- 全站統一的底部導覽：材料庫／作品／日曆／備份 四個固定圖示，前兩個往上滑出子選單 ----------
  const NAV_GROUPS = [
    {key:'materials', label:'材料庫', icon:'materials', href:'shelf.html', children:[
      {key:'overview', label:'總覽', icon:'overview', href:'shelf.html'},
      {key:'purchases', label:'採購紀錄', icon:'purchases', href:'shelf.html#purchases'},
      {key:'preorders', label:'預購物品', icon:'preorders', href:'shelf.html#wish'}
    ]},
    {key:'projects', label:'作品', icon:'projects', href:'cost.html#pieces', children:[
      {key:'palette', label:'配色', icon:'palette', href:'cost.html#palette'},
      {key:'finished', label:'成品紀錄', icon:'finished', href:'cost.html#pieces'}
    ]},
    {key:'calendar', label:'日曆', icon:'calendar', href:'calendar.html', children:null},
    {key:'backup', label:'備份', icon:'backup', href:'backup.html', children:null}
  ];
  const navIconTag = i => `<img class="navicon" src="assets/${i}.webp" alt="">`;
  function ensureNavDom(){
    if (document.getElementById('navbar')) return;
    const bar = document.createElement('nav'); bar.id = 'navbar';
    bar.innerHTML = '<div class="wrap" id="navbtns"></div>';
    const scrim = document.createElement('div'); scrim.id = 'navscrim'; scrim.className = 'scrim';
    const sheet = document.createElement('div'); sheet.id = 'navsheet'; sheet.className = 'sheet';
    sheet.innerHTML = '<div class="sheethead"><span class="grab"></span><button class="xbtn" id="navsheetClose" aria-label="關閉">✕</button></div><div class="inner" id="navsheetBody"></div>';
    document.body.appendChild(scrim); document.body.appendChild(sheet); document.body.appendChild(bar);
    const close = () => { scrim.classList.remove('on'); sheet.classList.remove('on'); };
    scrim.addEventListener('click', close);
    document.getElementById('navsheetClose').addEventListener('click', close);
  }
  function openNavSheet(g, wishCount){
    document.getElementById('navsheetBody').innerHTML = `<h3>${g.label}</h3><div class="navsheetlist">` +
      g.children.map(c => `<a href="${c.href}">${navIconTag(c.icon)}<span>${c.label}${c.key==='preorders'&&wishCount?`<i class="badge">${wishCount}</i>`:''}</span></a>`).join('') +
      '</div>';
    document.getElementById('navscrim').classList.add('on');
    document.getElementById('navsheet').classList.add('on');
    fitDialogs();
  }
  // activeGroupKey: 'materials' | 'projects' | 'calendar' | 'backup' | null（首頁傳 null）
  function initNav(activeGroupKey){
    ensureNavDom(); ensureInfoPop();
    let wishCount = 0;
    try { wishCount = Object.values(readThread().stock || {}).filter(v => v.wish).length; } catch (_) {}
    document.getElementById('navbtns').innerHTML = NAV_GROUPS.map(g =>
      `<button data-group="${g.key}" aria-current="${g.key===activeGroupKey?'page':'false'}">${navIconTag(g.icon)}<span>${g.label}${g.key==='materials'&&wishCount?`<i class="badge">${wishCount}</i>`:''}</span></button>`
    ).join('');
    document.querySelectorAll('#navbtns [data-group]').forEach(btn => {
      btn.onclick = () => {
        const g = NAV_GROUPS.find(x => x.key === btn.dataset.group);
        if (g.children) openNavSheet(g, wishCount); else location.href = g.href;
      };
    });
  }

  return {
    THREAD_KEY, COST_KEY, readThread, writeThread, readCost, writeCost,
    id, esc, money, today, num,
    photoDB, getPhoto, delPhoto, saveFiles, backup, restore, download,
    fitDialogs, ensureInfoPop, breadcrumb, initNav
  };
})();
