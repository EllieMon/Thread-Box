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

  // ---------- 上次備份時間（純粹存在 localStorage，不算材料/成本資料） ----------
  const LASTBACKUP_KEY = 'stitchly-lastbackup';
  function getLastBackup(){ try { return localStorage.getItem(LASTBACKUP_KEY) || null; } catch (_) { return null; } }
  function setLastBackup(){ try { localStorage.setItem(LASTBACKUP_KEY, new Date().toISOString()); } catch (_) {} }
  function backupOverdueDays(){ const t = getLastBackup(); if (!t) return Infinity; return Math.floor((Date.now() - new Date(t).getTime()) / 86400000); }
  function isBackupOverdue(){ return backupOverdueDays() >= 7; }

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
      const dlg = e.target.closest && e.target.closest('dialog[open]');
      if (dlg && ['TEXTAREA','INPUT','SELECT'].includes(e.target.tagName)) {
        const foot = dlg.querySelector('.foot');
        if (foot) foot.classList.add('unstick');
      }
      const inFloating = e.target.closest && e.target.closest('dialog[open], .modal.on, .sheet.on, .popcard.on');
      if (inFloating) setTimeout(() => { try { e.target.scrollIntoView({block:'center', behavior:'smooth'}); } catch (_) {} }, 80);
    });
    document.addEventListener('focusout', e => {
      const dlg = e.target.closest && e.target.closest('dialog[open]');
      if (dlg) { const foot = dlg.querySelector('.foot'); if (foot) foot.classList.remove('unstick'); }
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

  function killAutoFocus(dialogEl){
    const h = dialogEl && (dialogEl.querySelector('h2') || dialogEl.querySelector('h3'));
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: true }); } catch (_) { h.focus(); }
  }

  // ---------- 客製日期／時間選擇器（下拉選單取代原生 date/time，避免撐版） ----------
  const pad2 = n => String(n).padStart(2, '0');
  const daysInMonth = (y, m) => new Date(Number(y), Number(m), 0).getDate();
  function dateField(label, name, val) {
    const d = val ? new Date(val + 'T00:00:00') : new Date();
    const y = val ? Number(val.slice(0, 4)) : d.getFullYear();
    const m = val ? Number(val.slice(5, 7)) : d.getMonth() + 1;
    const day = val ? Number(val.slice(8, 10)) : d.getDate();
    const yearOpts = []; for (let yy = y - 4; yy <= y + 6; yy++) yearOpts.push(yy);
    const dayN = daysInMonth(y, m);
    return `<div class="datefield" data-datefield="${name}"><label>${label}</label>
      <input type="hidden" name="${name}" value="${esc(val || '')}">
      <div class="dsel">
        <select class="dy">${yearOpts.map(yy => `<option value="${yy}" ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}</select>
        <select class="dm">${Array.from({length:12},(_,i)=>i+1).map(mm => `<option value="${mm}" ${mm === m ? 'selected' : ''}>${mm}月</option>`).join('')}</select>
        <select class="dd">${Array.from({length:dayN},(_,i)=>i+1).map(dd => `<option value="${dd}" ${dd === day ? 'selected' : ''}>${dd}日</option>`).join('')}</select>
      </div></div>`;
  }
  function timeSelects(h, mi) {
    return `<select class="th">${Array.from({length:24},(_,i)=>i).map(hh => `<option value="${hh}" ${hh === h ? 'selected' : ''}>${pad2(hh)}時</option>`).join('')}</select>
      <select class="tm">${Array.from({length:60},(_,i)=>i).map(mm => `<option value="${mm}" ${mm === mi ? 'selected' : ''}>${pad2(mm)}分</option>`).join('')}</select>`;
  }
  function timeField(label, name, val, opts = {}) {
    const optional = !!opts.optional;
    const hasVal = !!val;
    const [h, mi] = (val || '09:00').split(':').map(Number);
    return `<div class="timefield" data-timefield="${name}"><label>${label}</label>
      <input type="hidden" name="${name}" value="${esc(val || '')}">
      ${optional ? `<label class="check" style="margin-bottom:7px"><input type="checkbox" class="tf-toggle" ${hasVal ? 'checked' : ''}>指定時間（不勾就是不指定）</label>` : ''}
      <div class="dsel"${optional && !hasVal ? ' style="display:none"' : ''}>${timeSelects(h, mi)}</div></div>`;
  }
  function datetimeField(label, name, val) {
    const datePart = val ? val.slice(0, 10) : today();
    const timePart = val ? val.slice(11, 16) : '09:00';
    const d = new Date(datePart + 'T00:00:00');
    const y = Number(datePart.slice(0, 4)), m = Number(datePart.slice(5, 7)), day = Number(datePart.slice(8, 10));
    const [h, mi] = timePart.split(':').map(Number);
    const yearOpts = []; for (let yy = y - 4; yy <= y + 6; yy++) yearOpts.push(yy);
    const dayN = daysInMonth(y, m);
    return `<div class="datetimefield" data-datetimefield="${name}"><label>${label}</label>
      <input type="hidden" name="${name}" value="${esc(val || '')}">
      <div class="dsel">
        <select class="dy">${yearOpts.map(yy => `<option value="${yy}" ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}</select>
        <select class="dm">${Array.from({length:12},(_,i)=>i+1).map(mm => `<option value="${mm}" ${mm === m ? 'selected' : ''}>${mm}月</option>`).join('')}</select>
        <select class="dd">${Array.from({length:dayN},(_,i)=>i+1).map(dd => `<option value="${dd}" ${dd === day ? 'selected' : ''}>${dd}日</option>`).join('')}</select>
      </div>
      <div class="dsel">${timeSelects(h, mi)}</div></div>`;
  }
  function refreshDayOptions(grp) {
    const ySel = grp.querySelector('.dy'), mSel = grp.querySelector('.dm'), dSel = grp.querySelector('.dd');
    if (!ySel || !mSel || !dSel) return;
    const y = Number(ySel.value), m = Number(mSel.value), cur = Number(dSel.value);
    const n = daysInMonth(y, m);
    if (dSel.options.length !== n) {
      const keep = Math.min(cur, n);
      dSel.innerHTML = Array.from({length:n},(_,i)=>i+1).map(dd => `<option value="${dd}" ${dd === keep ? 'selected' : ''}>${dd}日</option>`).join('');
    }
  }
  function syncHiddenDate(grp) {
    refreshDayOptions(grp);
    const y = grp.querySelector('.dy').value, m = pad2(grp.querySelector('.dm').value), d = pad2(grp.querySelector('.dd').value);
    grp.querySelector('input[type=hidden]').value = `${y}-${m}-${d}`;
  }
  function syncHiddenTime(grp) {
    const h = pad2(grp.querySelector('.th').value), mi = pad2(grp.querySelector('.tm').value);
    grp.querySelector('input[type=hidden]').value = `${h}:${mi}`;
  }
  function syncHiddenDatetime(grp) {
    refreshDayOptions(grp);
    const y = grp.querySelector('.dy').value, m = pad2(grp.querySelector('.dm').value), d = pad2(grp.querySelector('.dd').value);
    const h = pad2(grp.querySelector('.th').value), mi = pad2(grp.querySelector('.tm').value);
    grp.querySelector('input[type=hidden]').value = `${y}-${m}-${d}T${h}:${mi}`;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('change', e => {
      if (e.target.classList && e.target.classList.contains('tf-toggle')) {
        const grp = e.target.closest('[data-timefield]');
        const dsel = grp.querySelector('.dsel');
        if (e.target.checked) { dsel.style.display = ''; syncHiddenTime(grp); }
        else { dsel.style.display = 'none'; grp.querySelector('input[type=hidden]').value = ''; }
        return;
      }
      if (!e.target.matches('select')) return;
      const dg = e.target.closest('[data-datefield]'); if (dg) return syncHiddenDate(dg);
      const tg = e.target.closest('[data-timefield]'); if (tg) return syncHiddenTime(tg);
      const dtg = e.target.closest('[data-datetimefield]'); if (dtg) return syncHiddenDatetime(dtg);
    });
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
  function openNavSheet(g){
    document.getElementById('navsheetBody').innerHTML = `<h3>${g.label}</h3><div class="navsheetlist">` +
      g.children.map(c => `<a href="${c.href}">${navIconTag(c.icon)}<span>${c.label}</span></a>`).join('') +
      '</div>';
    document.getElementById('navscrim').classList.add('on');
    document.getElementById('navsheet').classList.add('on');
    fitDialogs();
  }
  // activeGroupKey: 'materials' | 'projects' | 'calendar' | 'backup' | null（首頁傳 null）
  function initNav(activeGroupKey){
    ensureNavDom(); ensureInfoPop();
    const overdue = isBackupOverdue();
    document.getElementById('navbtns').innerHTML = NAV_GROUPS.map(g =>
      `<button data-group="${g.key}" aria-current="${g.key===activeGroupKey?'page':'false'}">${navIconTag(g.icon)}<span>${g.label}${g.key==='backup'&&overdue?'<i class="navdot"></i>':''}</span></button>`
    ).join('');
    document.querySelectorAll('#navbtns [data-group]').forEach(btn => {
      btn.onclick = () => {
        const g = NAV_GROUPS.find(x => x.key === btn.dataset.group);
        if (g.children) openNavSheet(g); else location.href = g.href;
      };
    });
  }

  return {
    THREAD_KEY, COST_KEY, readThread, writeThread, readCost, writeCost,
    id, esc, money, today, num,
    photoDB, getPhoto, delPhoto, saveFiles, backup, restore, download,
    fitDialogs, ensureInfoPop, breadcrumb, initNav, killAutoFocus,
    dateField, timeField, datetimeField,
    getLastBackup, setLastBackup, backupOverdueDays, isBackupOverdue
  };
})();
