/* ---------- 儲存層 ---------- */
const Store = (() => {
  const KEY = App.THREAD_KEY;
  let ok = true, mem = null;
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); }
  catch (e) { ok = false; }
  return {
    persistent: ok,
    load() {
      try {
        const raw = ok ? localStorage.getItem(KEY) : mem;
        if (!raw) return null;
        const o = JSON.parse(raw);
        return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
      } catch (e) { return null; }
    },
    save(obj) {
      const raw = JSON.stringify(obj);
      try { ok ? localStorage.setItem(KEY, raw) : (mem = raw); } catch (e) {}
    }
  };
})();

/* ---------- 狀態 ---------- */
const TYPES = [
  { id: 'dmc', label: 'DMC', full: 'DMC 六股棉線', simple: false },
  { id: 'thread', label: '自訂線', full: '自訂線材', simple: false },
  { id: 'fabric', label: '布', full: '布料', simple: true },
  { id: 'tools', label: '物品', full: '其他物品', simple: true }
];
const typeOf = id => TYPES.find(t => t.id === id) || { id, label: id, full: id, simple: true };
const FAMS = [
  ['白/米', '#F3EDE2'], ['黃', '#E8C55B'], ['橘', '#D98A4E'], ['紅', '#BC3A47'],
  ['粉', '#DDA0AC'], ['紫', '#8F7BA8'], ['藍', '#5D7BA8'], ['綠', '#79996B'],
  ['褐', '#98785C'], ['黑/灰', '#635D59']
];
const LEVELS = [['full', '滿'], ['half', '半'], ['low', '快用完']];
const FAMTINT = {
  '白/米': '#EFE9DF', '黃': '#F5EDD5', '橘': '#F6E5D5', '紅': '#F3DBDC',
  '粉': '#F6E2E6', '紫': '#E9E3EF', '藍': '#DEE7F0', '綠': '#E1ECDF',
  '褐': '#EEE4D8', '黑/灰': '#E6E3E0', '自訂': '#EAE7E3'
};
const STATES = [['have', '有庫存'], ['low', '快用完'], ['scrap', '有殘線'], ['none', '還沒有'], ['wish', '待買']];
const MTYPES = { dmc: 'DMC 線材', thread: '自訂線', fabric: '布', tools: '物品' };

let db = Store.load() || { stock: {}, custom: [], projects: [], projLayout: 'bar', v: 2 };
if (!db.stock) db.stock = {};
if (!db.custom) db.custom = [];
if (!db.projects) db.projects = [];
let costDb = App.readCost();
const saveCost = () => App.writeCost(costDb);

let view = 'shelf';          // shelf(總覽) | purchases(採購紀錄) | wish(預購物品)
{
  const h = (location.hash || '').slice(1);
  if (['shelf', 'purchases', 'wish'].includes(h)) view = h;
}
let type = 'dmc';
let q = '';
let statusSel = new Set();
let familySel = new Set();
let filterOpen = false;
let openKey = null;
let buyQty = {};
let search = '';

const save = () => Store.save(db);
const key = (t, c) => t + ':' + c;
const rec = (t, c) => db.stock[key(t, c)] || null;
function setRec(t, c, patch) {
  const id = key(t, c);
  const cur = db.stock[id] || { qty: 0, level: 'full', wish: false, scrap: false, note: '', photos: [] };
  const next = { ...cur, ...patch };
  if (!next.qty && !next.wish && !next.scrap && !next.note && !(next.photos && next.photos.length)) delete db.stock[id];
  else db.stock[id] = next;
  save();
}

/* ---------- 品項資料 ---------- */
function palette(t) { return t === 'dmc' ? DMC : db.custom.filter(x => x.type === t); }
function sortedPalette(t) {
  const p = palette(t).slice();
  if (t !== 'dmc') return p.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));
  return p.sort((a, b) => {
    const na = parseInt(a.c, 10), nb = parseInt(b.c, 10);
    if (isNaN(na) && isNaN(nb)) return a.c.localeCompare(b.c);
    if (isNaN(na)) return -1;
    if (isNaN(nb)) return 1;
    return na - nb;
  });
}
function idOf(t, x) { return t === 'dmc' ? x.c : x.id; }
function codeLabel(t, x) { return t === 'dmc' ? x.c : (x.code || x.name); }
function matchesStatus(r, sel) {
  if (!sel.size) return true;
  if (sel.has('have') && r && r.qty > 0) return true;
  if (sel.has('low') && r && r.qty > 0 && r.level === 'low') return true;
  if (sel.has('scrap') && r && r.scrap) return true;
  if (sel.has('none') && !(r && (r.qty > 0 || r.scrap))) return true;
  if (sel.has('wish') && r && r.wish) return true;
  return false;
}
function matches(x, t) {
  const r = rec(t, idOf(t, x));
  if (!matchesStatus(r, statusSel)) return false;
  if ((t === 'dmc' || t === 'thread') && familySel.size && !familySel.has(x.f)) return false;
  if (q) {
    const s = q.toLowerCase().trim();
    const hay = [x.c, x.n, x.b, x.name, x.brand, x.note].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(s)) return false;
  }
  return true;
}
const wishList = () => Object.entries(db.stock).filter(([, v]) => v.wish)
  .map(([sid, v]) => {
    const i = sid.indexOf(':'), t = sid.slice(0, i), c = sid.slice(i + 1);
    return { t, c, col: findColor(t, c), v };
  });

/* ---------- 小工具 ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1700);
}
function famOfHex(hex) {
  const hx = (hex || '#bfbfbf').replace('#', '');
  const r = parseInt(hx.slice(0, 2), 16) / 255, g = parseInt(hx.slice(2, 4), 16) / 255, b = parseInt(hx.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.10) return l < 0.80 ? '黑/灰' : '白/米';
  if (l > 0.90 && sat < 0.35) return '白/米';
  let h;
  if (d === 0) h = 0;
  else if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  if (h < 12 || h >= 345) return '紅';
  if (h < 40) return '橘';
  if (h < 68) return '黃';
  if (h < 160) return '綠';
  if (h < 255) return '藍';
  if (h < 290) return '紫';
  return '粉';
}
function findColor(t, c) {
  if (t === 'dmc') return DMC.find(x => x.c === c) || { c, n: '', h: '#cccccc', f: '自訂' };
  const x = db.custom.find(i => i.id === c);
  return x || { c: c, n: '', h: '#cccccc', f: '自訂', name: '（已刪除）' };
}
function materialLabel(t, c) { const x = findColor(t, c); return t === 'dmc' ? `${x.c} ${x.n || ''}` : (x.code ? `${x.code} · ${x.name || ''}` : x.name); }
function lumOf(x) {
  if (typeof x.l === 'number') return x.l;
  const hx = (x.h || '#bfbfbf').replace('#', '');
  const r = parseInt(hx.slice(0, 2), 16), g = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const levelLabel = l => (LEVELS.find(x => x[0] === l) || LEVELS[0])[1];
async function paintPhotos() { for (const el of document.querySelectorAll('[data-photo]')) { try { const src = await App.getPhoto(el.dataset.photo); if (el.isConnected && src) el.src = src; } catch (_) {} } }

/* ---------- 自製對話框（簡短：確認、單欄輸入） ---------- */
let modalCb = null;
function showModal(html, cb) {
  modalCb = cb || null;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('mscrim').classList.add('on');
  document.getElementById('modal').classList.add('on');
  App.fitDialogs();
  setTimeout(() => { const f = document.querySelector('#modal input'); if (f) f.focus(); }, 60);
}
function hideModal() {
  modalCb = null;
  document.getElementById('mscrim').classList.remove('on');
  document.getElementById('modal').classList.remove('on');
}
function askConfirm(title, body, okText, danger, onYes) {
  showModal(`<h3>${esc(title)}</h3><p>${body}</p>
    <div class="mrow"><button class="no" data-m="no">取消</button>
    <button class="yes${danger ? ' danger' : ''}" data-m="ok">${esc(okText)}</button></div>`, onYes);
}

/* ---------- 對話框（豐富表單：新增/編輯品項、登記購買） ---------- */
const dialog = document.getElementById('editor'), form = document.getElementById('entryForm');
function show(html, callback) {
  form.onclick = null; form.onchange = null;
  form.innerHTML = html + '<div class="foot"><button type="button" id="cancelDialog2">取消</button><button class="primary" type="submit">儲存</button></div>';
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await callback(new FormData(form)); dialog.close(); save(); saveCost(); render(); }
    catch (err) { toast(err.message || '儲存失敗'); btn.disabled = false; }
  };
  dialog.showModal(); App.fitDialogs();
}
form.addEventListener('click', e => { if (e.target.id === 'cancelDialog2') dialog.close(); });
const field = (label, name, val = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(val)}" ${extra}></label>`;
const fieldFull = (label, name, val = '', type = 'text', extra = '') => `<div class="full">${field(label, name, val, type, extra)}</div>`;
const select = (label, name, options, value) => `<label>${label}<select name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;

/* ---------- 新增／編輯品項（線材完整版、布／物品簡化版；均可附照片） ---------- */
function photosBlock(pics) {
  return `<div class="field"><label>照片（至多兩張）</label>
    <div class="cover">${(pics || []).map(p => `<span style="position:relative;display:inline-block"><img data-photo="${esc(p)}" alt=""><button type="button" class="xbtn" data-delphoto="${esc(p)}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;font-size:11px">✕</button></span>`).join('')}</div>
    ${(pics || []).length < 2 ? `<input type="file" id="iPhotos" accept="image/*" multiple>` : '<p class="muted">已達兩張上限，先移除才能再加。</p>'}</div>`;
}
function itemForm(t, edit) {
  const simple = typeOf(t).simple;
  const pics = edit ? (rec(t, edit.id)?.photos || []) : [];
  if (simple) {
    const o = edit || { name: '', unit: t === 'fabric' ? '尺' : '個' };
    showModal(`<h3>${edit ? '編輯' : '新增'}${esc(typeOf(t).label)}</h3>
      <div class="field"><label>名稱</label><input id="iName" type="text" placeholder="例如：格紋棉布、羊眼繡框" value="${esc(o.name)}"></div>
      <div class="field"><label>計量單位</label><input id="iUnit" type="text" value="${esc(o.unit || '個')}"></div>
      ${edit ? photosBlock(pics) : ''}
      <div class="mrow"><button class="no" data-m="no">取消</button>
      <button class="yes" data-m="ok">${edit ? '儲存' : '新增'}</button></div>`, async () => {
      const name = (document.getElementById('iName').value || '').trim();
      const unit = (document.getElementById('iUnit').value || '個').trim();
      if (!name) return toast('請先填名稱');
      let id2;
      if (edit) { edit.name = name; edit.unit = unit; id2 = edit.id; }
      else { const rec2 = { id: App.id(), type: t, name, unit }; db.custom.push(rec2); id2 = rec2.id; }
      const fEl = document.getElementById('iPhotos');
      if (fEl && fEl.files && fEl.files.length) {
        try { const newPics = await App.saveFiles(fEl.files, pics); setRec(t, id2, { photos: newPics }); }
        catch (_) { toast('照片儲存失敗，其餘資料已存'); }
      }
      save(); openKey = id2; render(); openSheet(t, id2);
    });
    return;
  }
  const o = edit || { code: '', name: '', brand: '', h: '#8B9A8C', unit: '束' };
  showModal(`<h3>${edit ? '編輯自訂線' : '新增自訂線'}</h3>
    <p>金蔥線、亮線、俄羅斯刺繡用線，或其他廠牌的線都可以放這裡。</p>
    <div class="field"><label>編號</label><input id="cCode" type="text" placeholder="例如 E3852" value="${esc(o.code)}"></div>
    <div class="field"><label>廠牌（可留空）</label><input id="cBrand" type="text" placeholder="例如 Anchor、Madeira、Cosmo" value="${esc(o.brand || '')}"></div>
    <div class="field"><label>名稱或說明（可留空）</label><input id="cName" type="text" placeholder="例如 金蔥 · 淺金" value="${esc(o.name || '')}"></div>
    <div class="field"><label>顏色</label><input id="cHex" type="color" value="${esc(o.h)}"></div>
    ${edit ? photosBlock(pics) : ''}
    <div class="mrow"><button class="no" data-m="no">取消</button>
    <button class="yes" data-m="ok">${edit ? '儲存' : '新增'}</button></div>`, async () => {
    const code = (document.getElementById('cCode').value || '').trim();
    const brand = (document.getElementById('cBrand').value || '').trim();
    const name = (document.getElementById('cName').value || '').trim();
    const h = (document.getElementById('cHex').value || '#BFBFBF').toLowerCase();
    if (!code) return toast('請先填編號');
    if (db.custom.some(x => x.type === 'thread' && x.code === code && (!edit || x.id !== edit.id))) return toast('這個編號已經有了');
    let id2;
    if (edit) { Object.assign(edit, { code, brand, name, h, f: famOfHex(h) }); id2 = edit.id; }
    else { const rec2 = { id: App.id(), type: 'thread', code, brand, name, h, f: famOfHex(h), unit: '束' }; db.custom.push(rec2); id2 = rec2.id; }
    const fEl = document.getElementById('iPhotos');
    if (fEl && fEl.files && fEl.files.length) {
      try { const newPics = await App.saveFiles(fEl.files, pics); setRec('thread', id2, { photos: newPics }); }
      catch (_) { toast('照片儲存失敗，其餘資料已存'); }
    }
    save(); openKey = id2; render(); openSheet('thread', id2);
  });
}

/* ---------- 畫面：材料總覽 ---------- */
function sectionTabs() {
  return `<div class="sectiontabs">${[['shelf', '總覽'], ['purchases', '採購紀錄'], ['wish', '預購物品']].map(([v, n]) =>
    `<button data-gov="${v}" class="${view === v ? 'active' : ''}">${n}</button>`).join('')}</div>`;
}
function typeTabs() {
  return `<div class="kinds" id="kinds" role="tablist">${TYPES.map(t =>
    `<button role="tab" data-type="${t.id}" aria-selected="${type === t.id}">${t.label}</button>`).join('')}</div>`;
}
function filterButton() {
  const n = statusSel.size + familySel.size;
  return `<div class="popanchor"><button class="filterbtn" id="openFilter">篩選${n ? ` · <b>${n}</b>` : ''}</button>
    <div class="popcard${filterOpen ? ' on' : ''}" id="filterPop">
      <h4>狀態（可複選）</h4>
      <div class="optrow">${STATES.map(s => `<label class="opt" data-checked="${statusSel.has(s[0])}"><input type="checkbox" data-fstatus="${s[0]}" ${statusSel.has(s[0]) ? 'checked' : ''}>${s[1]}</label>`).join('')}</div>
      ${(type === 'dmc' || type === 'thread') ? `<h4>色系（可複選）</h4><div class="optrow">${FAMS.map(f => `<label class="opt" data-checked="${familySel.has(f[0])}"><input type="checkbox" data-ffam="${esc(f[0])}" ${familySel.has(f[0]) ? 'checked' : ''}><span class="dot" style="background:${f[1]}"></span>${f[0]}</label>`).join('')}</div>` : ''}
      <div class="closebar" id="closeFilter">完成</div>
    </div></div>`;
}
function renderShelf() {
  let h = `<div class="searchrow"><div class="search">
    <input id="q" type="search" inputmode="search" placeholder="找色號、色名或廠牌" value="${esc(q)}">
    ${q ? '<button class="clr" id="qclr" aria-label="清除">✕</button>' : ''}
  </div></div>
  <div style="margin:11px 0 3px">${filterButton()}</div>
  <div id="shelfBody">${shelfBody()}</div>`;
  return h;
}
function shelfBody() {
  const list = sortedPalette(type).filter(x => matches(x, type));
  const t = typeOf(type);
  let h = `<div class="count"><span>${t.full} · ${list.length} 項</span>
    <button id="addItem">＋ 新增${t.label}</button></div>`;
  if (!list.length) {
    h += (palette(type).length === 0)
      ? `<div class="empty"><b>還沒有${t.label}</b>點上面「新增」建立第一筆。</div>`
      : `<div class="empty"><b>這個條件下沒有品項</b>換個篩選條件或清掉搜尋字看看。</div>`;
  } else if (t.simple) {
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:9px">' + list.map(x => {
      const r = rec(type, x.id); const has = r && r.qty > 0;
      const thumb = r && r.photos && r.photos[0];
      return `<button class="cap" data-open="${esc(x.id)}" style="background:var(--surface)">
        <span class="chip${has ? '' : ' zero'}" style="${thumb ? '' : 'background:var(--line-soft);color:var(--ink)'}">${thumb ? `<img data-photo="${esc(thumb)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : `<em>${has ? r.qty : 0}</em>`}</span>
        <span class="body"><b>${esc(x.name)}</b><span class="tags"><i class="none">${has?r.qty:0} ${esc(x.unit || '個')}</i></span></span>
      </button>`;
    }).join('') + '</div>';
  } else {
    h += '<div class="capgrid">' + list.map(x => {
      const xid = idOf(type, x);
      const r = rec(type, xid);
      const has = r && r.qty > 0;
      const dark = lumOf(x) < 0.58;
      const tags = [];
      if (has && r.level === 'low') tags.push('<i class="low">快用完</i>');
      else if (has) tags.push(`<i>${levelLabel(r.level)}</i>`);
      if (r && r.scrap) tags.push('<i>殘線</i>');
      if (r && r.wish) tags.push('<i>待買</i>');
      if (!tags.length) tags.push('<i class="none">—</i>');
      return `<button class="cap" data-open="${esc(xid)}" title="${esc(codeLabel(type, x))} ${esc(x.n || x.name || '')}"
        style="background:${FAMTINT[x.f] || '#EAE7E3'}">
        <span class="chip${has ? '' : ' zero'}"
          style="background:${esc(x.h)};color:${dark ? '#fff' : '#2C2825'}"><em>${has ? r.qty : 0}</em></span>
        <span class="body">
          <b>${esc(codeLabel(type, x))}</b>
          <span class="tags">${tags.join('')}</span>
        </span>
      </button>`;
    }).join('') + '</div>';
  }
  return h;
}

/* ---------- 畫面：待買清單（預購物品） ---------- */
function renderWish() {
  const list = wishList();
  let h = `<p class="muted">買回來之後，先調整每一項要入幾份，再按「入庫」；或一次按最下面的「全部入庫」。</p>`;
  if (!list.length) {
    h += `<div class="empty"><b>清單是空的</b>逛店前先來這裡看一眼，就不會又買到重複的材料了。</div>`;
    return h;
  }
  h += list.map(it => {
    const sid = it.t + ':' + it.c;
    const n = buyQty[sid] || 1;
    const unit = it.t === 'dmc' ? '束' : (it.col.unit || '份');
    return `<div class="row">
      <div class="patch" style="background:${esc(it.col.h || '#e8e4de')}"></div>
      <div class="txt"><b>${esc(codeLabel(it.t, it.col))}</b>
        <small>${esc([typeOf(it.t).label, it.col.brand, it.col.n || it.col.name].filter(Boolean).join(' · '))}</small></div>
      <div class="qty">
        <button data-bq="${esc(sid)}|-1" aria-label="少一份">−</button>
        <span>${n}</span>
        <button data-bq="${esc(sid)}|1" aria-label="多一份">＋</button>
      </div>
      <button class="act" data-bought="${esc(it.t)}|${esc(it.c)}">入庫</button>
    </div>`;
  }).join('');
  h += `<button class="btn" id="buyAll" style="margin-top:16px">全部入庫（${list.length} 項）</button>
    <button class="btn ghost" id="clearWish">清空整張清單</button>`;
  return h;
}

/* ---------- 畫面：採購紀錄（材料選擇器＋就地新增＋搜尋） ---------- */
const allLines = () => costDb.orders.flatMap(o => o.lines.map(l => ({ ...l, date: o.date, store: o.store, orderId: o.id })));
const line = x => allLines().find(l => l.id === x);
const order = x => costDb.orders.find(o => o.id === x);
const money = n => App.money(n), num = n => App.num(n), today = () => App.today();
function matSlot(item) {
  const mtype = item?.materialType || 'dmc';
  if (mtype === 'dmc') {
    return `<label>DMC 色號 *<input name="materialId" list="dmcList" value="${esc(item?.materialId || '')}" placeholder="輸入色號或名稱，例如 150"></label>
      <datalist id="dmcList">${DMC.map(x => `<option value="${esc(x.c)}">${esc(x.n)}</option>`).join('')}</datalist>`;
  }
  const opts = db.custom.filter(x => x.type === mtype).map(x => [x.id, x.code ? `${x.code} · ${x.name || ''}` : x.name]);
  return opts.length
    ? select('選擇材料', 'materialId', opts, item?.materialId || opts[0][0]) + `<button type="button" class="smallbtn" data-quickadd="${mtype}" style="margin:6px 0 2px">＋ 找不到？新增材料</button>`
    : `<p class="muted">還沒有${esc(MTYPES[mtype])}。</p><button type="button" class="smallbtn" data-quickadd="${mtype}">＋ 先新增一筆</button>`;
}
function quickAddMaterial(box, mtype) {
  const simple = mtype === 'fabric' || mtype === 'tools';
  box.innerHTML = `<div class="itemform" style="background:var(--surface)">
    <label>名稱 *<input id="qaName" type="text"></label>
    ${simple ? `<label>單位<input id="qaUnit" type="text" value="${mtype === 'fabric' ? '尺' : '個'}"></label>`
      : `<label>編號 *<input id="qaCode" type="text" placeholder="例如 E3852"></label>`}
    <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="smallbtn subtle" id="qaCancel">取消</button><button type="button" class="smallbtn" id="qaSave">新增</button></div>
  </div>`;
  box.querySelector('#qaCancel').onclick = () => { box.innerHTML = matSlot({ materialType: mtype }); };
  box.querySelector('#qaSave').onclick = () => {
    const name = (box.querySelector('#qaName').value || '').trim();
    if (!name) return toast('請填名稱');
    let rec2;
    if (simple) { rec2 = { id: App.id(), type: mtype, name, unit: (box.querySelector('#qaUnit').value || '個').trim() }; }
    else { const code = (box.querySelector('#qaCode').value || '').trim(); if (!code) return toast('請填編號'); rec2 = { id: App.id(), type: 'thread', code, name, h: '#8B9A8C', f: '自訂', unit: '束' }; }
    db.custom.push(rec2); save();
    box.innerHTML = matSlot({ materialType: mtype, materialId: rec2.id });
  };
}
function orderItem(item) {
  return `<div class="itemform">
    <button type="button" class="remove" data-remove-item>移除</button>
    ${select('材料類型', 'materialType', Object.entries(MTYPES).map(([k, v]) => [k, v]), item?.materialType || 'dmc')}
    <div class="matslot">${matSlot(item)}</div>
    <div class="formgrid">${field('單價 *', 'unitPrice', item?.unitPrice ?? 0, 'number', 'min="0" step="0.01" required')}${field('數量 *', 'qty', item?.qty || 1, 'number', 'min="0.01" step="0.01" required')}</div>
    <label class="check"><input type="checkbox" name="sync" ${item?.sync === false ? '' : 'checked'}>同步入庫（材料庫也更新庫存）</label>
  </div>`;
}
function syncPurchase(l) { if (!l.sync) return; setRec(l.materialType, l.materialId, { qty: (rec(l.materialType, l.materialId)?.qty || 0) + num(l.qty), wish: false }); }
function orderForm(o) { show(`<h2>修改訂單資料</h2><div class="formgrid">${field('商店', 'store', o.store)}${field('訂單編號', 'orderNo', o.orderNo)}</div>${fieldFull('購買日期', 'date', o.date, 'date', 'required')}<div class="formgrid">${field('整單運費', 'shipping', o.shipping, 'number', 'min="0" step="0.01"')}${field('整單折扣', 'discount', o.discount, 'number', 'min="0" step="0.01"')}</div>${field('備註', 'note', o.note)}`, f => { Object.assign(o, { date: String(f.get('date')), store: String(f.get('store')), orderNo: String(f.get('orderNo')), shipping: num(f.get('shipping')), discount: num(f.get('discount')), note: String(f.get('note')) }); }); }
function lineForm(o, l) {
  show(`<h2>修改購買項目</h2>${select('材料類型', 'materialType', Object.entries(MTYPES).map(([k, v]) => [k, v]), l.materialType)}<div class="matslot">${matSlot(l)}</div><div class="formgrid">${field('單價', 'unitPrice', l.unitPrice, 'number', 'min="0" step="0.01" required')}${field('數量', 'qty', l.qty, 'number', 'min="0.01" step="0.01" required')}</div>`, f => { l.materialType = String(f.get('materialType')); l.materialId = String(f.get('materialId')); l.unitPrice = num(f.get('unitPrice')); l.qty = num(f.get('qty')); if (!l.qty) throw Error('數量需大於 0'); if (!l.materialId) throw Error('請選擇材料'); });
  form.onchange = e => { if (e.target.name === 'materialType') { form.querySelector('.matslot').innerHTML = matSlot({ materialType: e.target.value }); } };
  form.onclick = e => { const qa = e.target.closest('[data-quickadd]'); if (qa) quickAddMaterial(form.querySelector('.matslot'), qa.dataset.quickadd); };
}
function newOrder() {
  show(`<h2>登記整筆購買</h2>${fieldFull('購買日期 *', 'date', today(), 'date', 'required')}<div class="formgrid">${field('商店', 'store')}${field('訂單編號', 'orderNo')}</div><div class="formgrid">${field('整單運費', 'shipping', 0, 'number', 'min="0" step="0.01"')}${field('整單折扣', 'discount', 0, 'number', 'min="0" step="0.01"')}</div><div id="items">${orderItem()}</div><button type="button" class="smallbtn" id="addItem">＋ 再加一項材料</button>${field('備註', 'note')}`, async f => {
    const nodes = [...form.querySelectorAll('.itemform')]; if (!nodes.length) throw Error('請至少加一項材料');
    const lines = nodes.map(n => { const materialType = n.querySelector('[name=materialType]').value, materialId = (n.querySelector('[name=materialId]').value || '').trim(), qty = Number(n.querySelector('[name=qty]').value), unitPrice = Number(n.querySelector('[name=unitPrice]').value); if (!materialId || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) throw Error('材料、數量或單價不正確'); if (materialType === 'dmc' && !DMC.some(x => x.c === materialId)) throw Error('找不到這個 DMC 色號：' + materialId); return { id: App.id(), materialType, materialId, qty, unitPrice, sync: n.querySelector('[name=sync]').checked }; });
    costDb.orders.push({ id: App.id(), date: String(f.get('date')), store: String(f.get('store') || ''), orderNo: String(f.get('orderNo') || ''), shipping: num(f.get('shipping')), discount: num(f.get('discount')), note: String(f.get('note') || ''), lines });
    for (const l of lines) syncPurchase(l);
    view = 'purchases';
  });
  form.onclick = e => { if (e.target.id === 'addItem') { form.querySelector('#items').insertAdjacentHTML('beforeend', orderItem()); paintPhotos(); } if (e.target.matches('[data-remove-item]')) e.target.closest('.itemform').remove(); const qa = e.target.closest('[data-quickadd]'); if (qa) quickAddMaterial(qa.closest('.itemform').querySelector('.matslot'), qa.dataset.quickadd); };
  form.onchange = e => { if (e.target.name === 'materialType') { const n = e.target.closest('.itemform'); n.querySelector('.matslot').innerHTML = matSlot({ materialType: e.target.value }); } };
}
function renderOrders() {
  const list = [...costDb.orders].sort((a, b) => b.date.localeCompare(a.date)).filter(o => !search || [o.store, o.orderNo, ...o.lines.map(l => materialLabel(l.materialType, l.materialId))].join(' ').toLowerCase().includes(search.toLowerCase()));
  return `<div class="pagehead"><h2>採購紀錄</h2><button class="primary" data-act="newOrder">＋ 登記購買</button></div>
  <input class="listsearch" id="search" placeholder="搜尋商店、訂單編號或材料" value="${esc(search)}">
  ${list.map(o => { let subtotal = o.lines.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0); return `<div class="costcard"><h3>${esc(o.store || '未填商店')} · ${esc(o.date)}</h3><p>訂單 ${o.orderNo ? esc(o.orderNo) : '—'} · 實付 ${money(subtotal + num(o.shipping) - num(o.discount))}<button class="infobtn" data-info="商品小計 ${money(subtotal)}，加運費 ${money(o.shipping)}，扣折扣 ${money(o.discount)}。">i</button></p>${o.lines.map(l => `<div class="rowline">${esc(materialLabel(l.materialType, l.materialId))} · ${num(l.qty)} × ${money(l.unitPrice)}<button class="smallbtn" style="margin-left:8px" data-act="editLine" data-id="${o.id}" data-ref="${l.id}">修改</button></div>`).join('')}<p>${esc(o.note || '')}</p><div class="actions" style="display:flex"><button data-act="editOrder" data-id="${o.id}">修改訂單資料</button></div></div>`; }).join('') || '<div class="emptyhint">記下第一次購買，材料庫會跟著同步入庫。</div>'}`;
}

/* ---------- 詳細面板 ---------- */
function openSheet(t, code) {
  type = t;
  const x = t === 'dmc' ? DMC.find(i => i.c === code) : db.custom.find(i => i.id === code);
  if (!x) return;
  openKey = code;
  const r = rec(t, code) || { qty: 0, level: 'full', wish: false, scrap: false, note: '', photos: [] };
  const simple = typeOf(t).simple;

  document.getElementById('sheetBody').innerHTML = `
    <div class="hero">
      ${simple ? '' : `<div class="patch" style="background:${esc(x.h)}"></div>`}
      <div class="t"><b>${esc(simple ? x.name : codeLabel(t, x))}</b><small>${esc(simple ? (x.unit||'個') : ([x.brand || x.b, x.name || x.n].filter(Boolean).join(' · ') || '自訂線材'))}</small>
      ${simple ? '' : `<em>${esc(typeOf(t).full)}${x.f ? ' · ' + esc(x.f) : ''}</em>`}</div>
    </div>

    <div class="block"><div class="lab">有幾${simple ? esc(x.unit || '個') : '束'}</div>
      <div class="stepper">
        <button data-step="-1" aria-label="減少">−</button>
        <div class="n" id="nSk">${r.qty}<span>${simple ? esc(x.unit || '個') : '束'}</span></div>
        <button data-step="1" aria-label="增加">＋</button>
      </div>
    </div>

    ${simple ? '' : `<div class="block"><div class="lab">剩下大概多少</div>
      <div class="seg">${LEVELS.map(l => `<button data-lv="${l[0]}" aria-pressed="${r.level === l[0]}">${l[1]}</button>`).join('')}</div>
    </div>
    <div class="block"><div class="lab">標記（不影響上面的數量）</div>
      <div class="toggles">
        <button data-tg="scrap" class="scrap" aria-pressed="${!!r.scrap}"><b>有殘線</b><small>零頭還能用</small></button>
        <button class="wish" data-tg="wish" aria-pressed="${!!r.wish}"><b>${r.wish ? '已在待買' : '加入待買'}</b><small>下次補貨</small></button>
      </div>
    </div>`}
    ${simple ? `<div class="block"><div class="lab">標記</div>
      <div class="toggles"><button class="wish" data-tg="wish" aria-pressed="${!!r.wish}"><b>${r.wish ? '已在待買' : '加入待買'}</b><small>下次補貨</small></button></div>
    </div>` : ''}

    <div class="block"><div class="lab">照片（至多兩張）</div>
      <div class="cover">${(r.photos||[]).map(p=>`<span style="position:relative;display:inline-block"><img data-photo="${esc(p)}" alt=""><button type="button" class="xbtn" data-delphoto="${esc(p)}" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;font-size:11px">✕</button></span>`).join('')}</div>
      ${(r.photos||[]).length < 2 ? `<input type="file" id="matPhotoInput" accept="image/*" multiple>` : '<p class="muted">已達兩張上限，先移除才能再加。</p>'}
    </div>

    <div class="block"><div class="lab">備註</div>
      <textarea class="note" id="noteBox" placeholder="例如：放在第二層鐵盒、留給聖誕圖">${esc(r.note)}</textarea>
    </div>

    ${t !== 'dmc' ? `<button class="btn ghost" id="editCustom">編輯這筆</button><button class="btn warn" id="delCustom">刪掉這筆</button>` : ''}
    <button class="btn ghost" id="closeSheetBottom">收起來</button>`;

  document.getElementById('scrim').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  App.fitDialogs();
  paintPhotos();
}
function closeSheet() {
  const nb = document.getElementById('noteBox');
  if (nb && openKey !== null) setRec(type, openKey, { note: nb.value });
  document.getElementById('scrim').classList.remove('on');
  document.getElementById('sheet').classList.remove('on');
  openKey = null;
  render();
}

/* ---------- 主渲染 ---------- */
function render() {
  history.replaceState(null, '', '#' + view);
  const crumb = view === 'purchases' ? [{label:'材料庫',href:'shelf.html'},{label:'採購紀錄'}]
    : view === 'wish' ? [{label:'材料庫',href:'shelf.html'},{label:'預購物品'}]
    : [{label:'材料庫',href:'shelf.html'},{label:'總覽'}];
  document.querySelector('.crumbnav')?.remove();
  document.querySelector('header .wrap').insertAdjacentHTML('beforeend', App.breadcrumb(crumb));

  const m = document.getElementById('main');
  m.innerHTML = sectionTabs() + (view === 'shelf' ? typeTabs() + renderShelf() : view === 'purchases' ? renderOrders() : renderWish());
  paintPhotos();
  App.initNav('materials');
}

/* ---------- 事件 ---------- */
document.addEventListener('click', async e => {
  const t = e.target;
  const hit = s => t.closest(s);

  const mb = hit('[data-m]');
  if (mb) { if (mb.dataset.m === 'ok') { const cb = modalCb; hideModal(); if (cb) cb(); } else hideModal(); return; }
  if (t.id === 'mscrim') return hideModal();

  const gov = hit('[data-gov]');
  if (gov) { view = gov.dataset.gov; search = ''; return render(); }

  const tb = hit('[data-type]');
  if (tb) { type = tb.dataset.type; statusSel = new Set(); familySel = new Set(); filterOpen = false; return render(); }

  if (hit('#openFilter')) { filterOpen = !filterOpen; return render(); }
  if (hit('#closeFilter')) { filterOpen = false; return render(); }
  const fs = hit('[data-fstatus]');
  if (fs) { const k = fs.dataset.fstatus; statusSel.has(k) ? statusSel.delete(k) : statusSel.add(k); return render(); }
  const ff = hit('[data-ffam]');
  if (ff) { const k = ff.dataset.ffam; familySel.has(k) ? familySel.delete(k) : familySel.add(k); return render(); }
  if (filterOpen && !hit('#filterPop') && !hit('#openFilter')) { filterOpen = false; return render(); }

  const op = hit('[data-open]');
  if (op) return openSheet(type, op.dataset.open);

  if (hit('#qclr')) { q = ''; return render(); }
  if (hit('#addItem')) return itemForm(type, null);

  const delph = hit('[data-delphoto]');
  if (delph && openKey !== null) {
    const key0 = delph.dataset.delphoto;
    try { await App.delPhoto(key0); } catch (_) {}
    const r = rec(type, openKey) || { photos: [] };
    setRec(type, openKey, { photos: (r.photos || []).filter(p => p !== key0) });
    return openSheet(type, openKey);
  }

  const step = hit('[data-step]');
  if (step && openKey !== null) {
    const r = rec(type, openKey) || { qty: 0 };
    const n = Math.max(0, (r.qty || 0) + Number(step.dataset.step));
    setRec(type, openKey, { qty: n });
    document.getElementById('nSk').firstChild.textContent = n;
    return;
  }
  const lv = hit('[data-lv]');
  if (lv && openKey !== null) { setRec(type, openKey, { level: lv.dataset.lv }); lv.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === lv)); return; }
  const tg = hit('[data-tg]');
  if (tg && openKey !== null) {
    const f = tg.dataset.tg;
    const cur = (rec(type, openKey) || {})[f];
    setRec(type, openKey, { [f]: !cur });
    tg.setAttribute('aria-pressed', String(!cur));
    if (f === 'wish') { tg.querySelector('b').textContent = !cur ? '已在待買' : '加入待買'; toast(!cur ? '已加入待買清單' : '已從待買清單移除'); }
    if (f === 'scrap') toast(!cur ? '已標記有殘線' : '已取消殘線標記');
    return;
  }
  if (hit('#closeSheet, #closeSheetBottom') || t.id === 'scrim') return closeSheet();
  if (hit('#delCustom') && openKey !== null) {
    const k0 = openKey;
    askConfirm('刪掉這一筆？', `${esc(k0)} 的庫存紀錄也會一起消失。`, '刪掉', true, () => {
      db.custom = db.custom.filter(x => x.id !== k0);
      delete db.stock[key(type, k0)];
      save(); openKey = null;
      document.getElementById('scrim').classList.remove('on');
      document.getElementById('sheet').classList.remove('on');
      render();
    });
    return;
  }
  if (hit('#editCustom') && openKey !== null) return itemForm(type, db.custom.find(x => x.id === openKey));

  const bq = hit('[data-bq]');
  if (bq) { const parts = bq.dataset.bq.split('|'); const sid = parts[0], d = Number(parts[1]); buyQty[sid] = Math.max(1, (buyQty[sid] || 1) + d); return render(); }
  const bought = hit('[data-bought]');
  if (bought) {
    const [tt, cc] = bought.dataset.bought.split('|');
    const n = buyQty[tt + ':' + cc] || 1;
    setRec(tt, cc, { wish: false, qty: (rec(tt, cc)?.qty || 0) + n, level: 'full' });
    delete buyQty[tt + ':' + cc];
    toast(cc + ' 入庫 ' + n); return render();
  }
  if (hit('#buyAll')) {
    const list = wishList();
    if (!list.length) return;
    const lines = list.map(it => { const sid = it.t + ':' + it.c; return `<b>${esc(codeLabel(it.t, it.col))}</b> × ${buyQty[sid] || 1}`; }).join('<br>');
    showModal(`<h3>全部入庫</h3><p>確認照下面的數量加進庫存，並從待買清單移除：</p>
      <div class="buylist">${lines}</div>
      <div class="mrow"><button class="no" data-m="no">再看看</button>
      <button class="yes" data-m="ok">確定入庫</button></div>`, () => {
      let total = 0;
      list.forEach(it => { const n = buyQty[it.t + ':' + it.c] || 1; setRec(it.t, it.c, { wish: false, qty: (rec(it.t, it.c)?.qty || 0) + n, level: 'full' }); delete buyQty[it.t + ':' + it.c]; total += n; });
      toast('已入庫 ' + total + ' 項'); render();
    });
    return;
  }
  if (hit('#clearWish')) {
    askConfirm('清空待買清單？', '清單上的項目會全部移除，庫存不受影響。', '清空', true, () => {
      Object.keys(db.stock).forEach(sid => { if (db.stock[sid].wish) db.stock[sid] = { ...db.stock[sid], wish: false }; });
      Object.keys(db.stock).forEach(sid => { const v = db.stock[sid]; if (!v.qty && !v.wish && !v.scrap && !v.note && !(v.photos && v.photos.length)) delete db.stock[sid]; });
      save(); render();
    });
    return;
  }

  const act = hit('[data-act]');
  if (act) {
    const a = act.dataset.act, id0 = act.dataset.id, ref = act.dataset.ref;
    if (a === 'newOrder') return newOrder();
    if (a === 'editOrder') return orderForm(order(id0));
    if (a === 'editLine') return lineForm(order(id0), order(id0).lines.find(x => x.id === ref));
  }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'matPhotoInput' && openKey !== null) {
    const r = rec(type, openKey) || { photos: [] };
    try { const newPics = await App.saveFiles(e.target.files, r.photos || []); setRec(type, openKey, { photos: newPics }); openSheet(type, openKey); }
    catch (_) { toast('照片儲存失敗'); }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { q = e.target.value; const el = document.getElementById('shelfBody'); if (el) el.innerHTML = shelfBody(); else render(); }
  if (e.target.id === 'search') { search = e.target.value; const caret = e.target.selectionStart; render(); const x = document.getElementById('search'); x?.focus(); x?.setSelectionRange(caret, caret); }
});

render();
