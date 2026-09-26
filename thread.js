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

let db = Store.load() || { stock: {}, custom: [], projects: [], projLayout: 'bar', v: 2 };
if (!db.stock) db.stock = {};
if (!db.custom) db.custom = [];
if (!db.projects) db.projects = [];
if (!db.projLayout) db.projLayout = 'bar';

let view = 'shelf';          // shelf | proj | wish
{
  const h = (location.hash || '').slice(1);
  if (['shelf', 'proj', 'wish'].includes(h)) view = h;
}
let type = 'dmc';
let q = '';
let statusSel = new Set();   // 可複選：有庫存/快用完/有殘線/還沒有/待買
let familySel = new Set();   // 可複選：色系（僅 dmc/自訂線）
let filterOpen = false;
let openKey = null;
let projOpen = null, projPick = false;
let pickType = 'dmc', pickFamilySel = new Set(), pickQ = '';
let buyQty = {};

const save = () => Store.save(db);
const key = (t, c) => t + ':' + c;
const rec = (t, c) => db.stock[key(t, c)] || null;
function setRec(t, c, patch) {
  const id = key(t, c);
  const cur = db.stock[id] || { qty: 0, level: 'full', wish: false, scrap: false, note: '' };
  const next = { ...cur, ...patch };
  if (!next.qty && !next.wish && !next.scrap && !next.note) delete db.stock[id];
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
const proj = pid => db.projects.find(p => p.id === pid);
function projStat(p) {
  let miss = 0, todo = 0;
  p.colors.forEach(it => {
    const r = rec(it.t, it.c);
    if (r && r.qty > 0) return;
    miss++;
    if (!(r && r.wish)) todo++;
  });
  return { miss, todo };
}
function lumOf(x) {
  if (typeof x.l === 'number') return x.l;
  const hx = (x.h || '#bfbfbf').replace('#', '');
  const r = parseInt(hx.slice(0, 2), 16), g = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const levelLabel = l => (LEVELS.find(x => x[0] === l) || LEVELS[0])[1];

/* ---------- 自製對話框 ---------- */
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
function askText(title, hint, placeholder, value, okText, onOk) {
  showModal(`<h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}
    <div class="field"><input id="mText" type="text" placeholder="${esc(placeholder)}" value="${esc(value)}"></div>
    <div class="mrow"><button class="no" data-m="no">取消</button>
    <button class="yes" data-m="ok">${esc(okText)}</button></div>`,
    () => onOk((document.getElementById('mText').value || '').trim()));
}

/* ---------- 新增／編輯品項（線材完整版、布／物品簡化版） ---------- */
function itemForm(t, edit) {
  const simple = typeOf(t).simple;
  if (simple) {
    const o = edit || { name: '', unit: t === 'fabric' ? '尺' : '個' };
    showModal(`<h3>${edit ? '編輯' : '新增'}${esc(typeOf(t).label)}</h3>
      <div class="field"><label>名稱</label><input id="iName" type="text" placeholder="例如：格紋棉布、羊眼繡框" value="${esc(o.name)}"></div>
      <div class="field"><label>計量單位</label><input id="iUnit" type="text" value="${esc(o.unit || '個')}"></div>
      <div class="mrow"><button class="no" data-m="no">取消</button>
      <button class="yes" data-m="ok">${edit ? '儲存' : '新增'}</button></div>`, () => {
      const name = (document.getElementById('iName').value || '').trim();
      const unit = (document.getElementById('iUnit').value || '個').trim();
      if (!name) return toast('請先填名稱');
      if (edit) { edit.name = name; edit.unit = unit; save(); openKey = edit.id; }
      else { const rec2 = { id: App.id(), type: t, name, unit }; db.custom.push(rec2); save(); openKey = rec2.id; }
      render(); openSheet(t, openKey);
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
    <div class="mrow"><button class="no" data-m="no">取消</button>
    <button class="yes" data-m="ok">${edit ? '儲存' : '新增'}</button></div>`, () => {
    const code = (document.getElementById('cCode').value || '').trim();
    const brand = (document.getElementById('cBrand').value || '').trim();
    const name = (document.getElementById('cName').value || '').trim();
    const h = (document.getElementById('cHex').value || '#BFBFBF').toLowerCase();
    if (!code) return toast('請先填編號');
    if (db.custom.some(x => x.type === 'thread' && x.code === code && (!edit || x.id !== edit.id))) return toast('這個編號已經有了');
    if (edit) { Object.assign(edit, { code, brand, name, h, f: famOfHex(h) }); save(); openKey = edit.id; }
    else { const rec2 = { id: App.id(), type: 'thread', code, brand, name, h, f: famOfHex(h), unit: '束' }; db.custom.push(rec2); save(); openKey = rec2.id; }
    render(); openSheet('thread', openKey);
  });
}

/* ---------- 畫面：材料總覽 ---------- */
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
    h += '<div class="pgrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:9px">' + list.map(x => {
      const r = rec(type, x.id); const has = r && r.qty > 0;
      return `<button class="cap" data-open="${esc(x.id)}" style="background:var(--surface)">
        <span class="chip${has ? '' : ' zero'}" style="background:var(--line-soft);color:var(--ink)"><em>${has ? r.qty : 0}</em></span>
        <span class="body"><b>${esc(x.name)}</b><span class="tags"><i class="none">${esc(x.unit || '個')}</i></span></span>
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

function pickBody() {
  const p = proj(projOpen);
  if (!p) return '';
  const src = (pickType === 'thread' ? db.custom.filter(x => x.type === 'thread') : DMC).filter(x => {
    if (pickFamilySel.size && !pickFamilySel.has(x.f)) return false;
    if (pickQ) {
      const s = pickQ.toLowerCase().trim();
      const c = idOf(pickType, x);
      if (!(String(c).toLowerCase().includes(s) || (x.n || x.name || '').toLowerCase().includes(s) || (x.b || x.brand || '').toLowerCase().includes(s))) return false;
    }
    return true;
  });
  const chosen = new Set(p.colors.map(it => it.t + ':' + it.c));
  return `<div class="count"><span>已選 ${p.colors.length} 色 · 這裡有 ${src.length} 色</span></div>`
    + (src.length ? `<div class="pickgrid">${src.map(x => {
        const c = idOf(pickType, x);
        const on = chosen.has(pickType + ':' + c);
        return `<button class="pick${on ? ' on' : ''}" data-pick="${esc(c)}"
          style="background:${esc(x.h)};color:${lumOf(x) < 0.58 ? '#fff' : '#2C2825'}">${esc(codeLabel(pickType, x))}</button>`;
      }).join('')}</div>` : `<div class="empty"><b>這個條件下沒有色號</b>換個色系試試。</div>`);
}

/* ---------- 畫面：配色紀錄 ---------- */
function renderProj() {
  if (!projOpen) {
    let h = `<div class="panel"><h2>配色紀錄</h2>
      <p>把想用的線挑進同一個作品，放在一起看整組配色順不順眼。缺哪幾色也會一併幫你標出來。</p>`;
    if (!db.projects.length) {
      h += `<div class="empty"><b>還沒有配色紀錄</b>先開一個，名字隨意，之後都能改。</div>`;
    } else {
      h += db.projects.map(p => {
        const sw = p.colors.slice(0, 4).map(it => `<span style="background:${esc(findColor(it.t, it.c).h)}"></span>`).join('');
        const st = projStat(p);
        return `<button class="projcard" data-proj="${esc(p.id)}">
          <span class="mini${sw ? '' : ' none'}">${sw}</span>
          <span class="txt"><b>${esc(p.name)}</b>
            <small>${p.colors.length} 色${st.miss ? ` · 缺 ${st.miss} 色` : p.colors.length ? ' · 都有貨' : ''}</small></span>
          <span class="go">›</span></button>`;
      }).join('');
    }
    h += `<button class="btn" id="newProj" style="margin-top:14px">＋ 新增配色紀錄</button></div>`;
    return h;
  }

  const p = proj(projOpen);
  if (!p) { projOpen = null; return renderProj(); }

  if (projPick) {
    return `<div class="crumb stick"><h2>挑顏色 · ${esc(p.name)}</h2>
      <button class="done" id="donePick">完成${p.colors.length ? `（${p.colors.length} 色）` : ''}</button></div>
    <div class="kinds" style="margin-top:0">${[['dmc','DMC'],['thread','自訂線']].map(k =>
      `<button data-pk="${k[0]}" aria-selected="${pickType === k[0]}">${k[1]}</button>`).join('')}</div>
    <div class="searchrow"><div class="search">
      <input id="pq" type="search" placeholder="找色號" value="${esc(pickQ)}"></div></div>
    <div style="margin:9px 0 3px"><div class="popanchor"><button class="filterbtn" id="openPickFilter">色系${pickFamilySel.size ? ` · <b>${pickFamilySel.size}</b>` : ''}</button>
      <div class="popcard${filterOpen ? ' on' : ''}" id="pickFilterPop">
        <h4>色系（可複選）</h4>
        <div class="optrow">${FAMS.map(f => `<label class="opt" data-checked="${pickFamilySel.has(f[0])}"><input type="checkbox" data-pfam="${esc(f[0])}" ${pickFamilySel.has(f[0]) ? 'checked' : ''}><span class="dot" style="background:${f[1]}"></span>${f[0]}</label>`).join('')}</div>
        <div class="closebar" id="closePickFilter">完成</div>
      </div></div></div>
    <div id="pickBody">${pickBody()}</div>`;
  }

  const st = projStat(p);
  let h = `<div class="crumb"><button data-proj="">‹ 配色紀錄</button><h2>${esc(p.name)}</h2>
    <span class="viewtog">
      <button data-pl="bar" aria-selected="${db.projLayout === 'bar'}">色條</button>
      <button data-pl="grid" aria-selected="${db.projLayout === 'grid'}">色塊</button>
    </span></div>
  <div class="ptools">
    <button class="main" id="pickColors">＋ 挑顏色</button>
    ${st.todo ? `<button class="wish" id="wishMissing">缺 ${st.todo} 色 · 加進待買</button>`
      : st.miss ? `<button class="wish" disabled>缺 ${st.miss} 色 · 已在待買</button>` : ''}
    <button id="renameProj">改名</button>
    <button class="danger" id="delProj">刪除此配色紀錄</button>
  </div>`;

  if (!p.colors.length) {
    h += `<div class="empty"><b>還沒挑任何顏色</b>按下面的按鈕，依色系一次看完一整排。</div>`;
  } else {
    h += `<p class="tipline">長壓色票可以拖曳排序；點一下則是從配色紀錄移除。</p>`;
    const cells = p.colors.map(it => {
      const x = findColor(it.t, it.c);
      const r = rec(it.t, it.c);
      const dark = lumOf(x) < 0.58;
      const tag = (r && r.qty > 0) ? '' : '<span class="miss">缺</span>';
      return { x, dark, tag, it };
    });
    h += db.projLayout === 'bar'
      ? cells.map((o, i) => `<button class="pbar" data-idx="${i}" data-drop="${esc(o.it.t)}|${esc(o.it.c)}"
          style="background:${esc(o.x.h)};color:${o.dark ? '#fff' : '#2C2825'}">
          <b>${esc(codeLabel(o.it.t, o.x))}</b>${o.tag}</button>`).join('')
      : `<div class="pgrid">${cells.map((o, i) => `<button class="pcell" data-idx="${i}" data-drop="${esc(o.it.t)}|${esc(o.it.c)}"
          style="background:${esc(o.x.h)};color:${o.dark ? '#fff' : '#2C2825'}">
          ${o.tag}<b>${esc(codeLabel(o.it.t, o.x))}</b></button>`).join('')}</div>`;
  }

  return h;
}

/* ---------- 畫面：待買清單（預購物品） ---------- */
function renderWish() {
  const list = wishList();
  let h = `<div class="panel"><h2>預購物品</h2>
    <p>買回來之後，先調整每一項要入幾份，再按「入庫」；或一次按最下面的「全部入庫」。</p>`;
  if (!list.length) {
    h += `<div class="empty"><b>清單是空的</b>逛店前先來這裡看一眼，就不會又買到重複的材料了。</div></div>`;
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
    <button class="btn ghost" id="clearWish">清空整張清單</button></div>`;
  return h;
}

/* ---------- 詳細面板 ---------- */
function openSheet(t, code) {
  type = t; // 保持分頁一致
  const x = t === 'dmc' ? DMC.find(i => i.c === code) : db.custom.find(i => i.id === code);
  if (!x) return;
  openKey = code;
  const r = rec(t, code) || { qty: 0, level: 'full', wish: false, scrap: false, note: '' };
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

    <div class="block"><div class="lab">備註</div>
      <textarea class="note" id="noteBox" placeholder="例如：放在第二層鐵盒、留給聖誕圖">${esc(r.note)}</textarea>
    </div>

    ${t !== 'dmc' ? `<button class="btn ghost" id="editCustom">編輯這筆</button><button class="btn warn" id="delCustom">刪掉這筆</button>` : ''}
    <button class="btn ghost" id="closeSheetBottom">收起來</button>`;

  document.getElementById('scrim').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  App.fitDialogs();
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
  const crumb = view === 'proj' ? [{label:'作品',href:'cost.html#pieces'},{label:'配色'}]
    : view === 'wish' ? [{label:'材料庫',href:'shelf.html'},{label:'預購物品'}]
    : [{label:'材料庫',href:'shelf.html'},{label:'總覽'}];
  document.querySelector('.crumbnav')?.remove();
  document.querySelector('header .wrap').insertAdjacentHTML('beforeend', App.breadcrumb(crumb));

  const m = document.getElementById('main');
  m.innerHTML = view === 'shelf' ? typeTabs() + renderShelf()
    : view === 'proj' ? renderProj() : renderWish();

  App.initNav(view === 'proj' ? 'projects' : 'materials');
}

/* ---------- 事件 ---------- */
document.addEventListener('click', e => {
  if (Date.now() - lastDragEnd < 450) return;
  const t = e.target;
  const hit = s => t.closest(s);

  const mb = hit('[data-m]');
  if (mb) {
    if (mb.dataset.m === 'ok') { const cb = modalCb; hideModal(); if (cb) cb(); }
    else hideModal();
    return;
  }
  if (t.id === 'mscrim') return hideModal();

  const tb = hit('[data-type]');
  if (tb) { type = tb.dataset.type; statusSel = new Set(); familySel = new Set(); filterOpen = false; return render(); }

  if (hit('#openFilter')) { filterOpen = !filterOpen; return render(); }
  if (hit('#closeFilter')) { filterOpen = false; return render(); }
  const fs = hit('[data-fstatus]');
  if (fs) { const k = fs.dataset.fstatus; statusSel.has(k) ? statusSel.delete(k) : statusSel.add(k); return render(); }
  const ff = hit('[data-ffam]');
  if (ff) { const k = ff.dataset.ffam; familySel.has(k) ? familySel.delete(k) : familySel.add(k); return render(); }
  if (filterOpen && !hit('#filterPop') && !hit('#openFilter')) { filterOpen = false; return render(); }

  if (hit('#openPickFilter')) { filterOpen = !filterOpen; return render(); }
  if (hit('#closePickFilter')) { filterOpen = false; return render(); }
  const pf = hit('[data-pfam]');
  if (pf) { const k = pf.dataset.pfam; pickFamilySel.has(k) ? pickFamilySel.delete(k) : pickFamilySel.add(k); return render(); }

  const op = hit('[data-open]');
  if (op) return openSheet(type, op.dataset.open);

  if (hit('#qclr')) { q = ''; return render(); }
  if (hit('#addItem')) return itemForm(type, null);

  const step = hit('[data-step]');
  if (step && openKey !== null) {
    const r = rec(type, openKey) || { qty: 0 };
    const n = Math.max(0, (r.qty || 0) + Number(step.dataset.step));
    setRec(type, openKey, { qty: n });
    document.getElementById('nSk').firstChild.textContent = n;
    return;
  }
  const lv = hit('[data-lv]');
  if (lv && openKey !== null) {
    setRec(type, openKey, { level: lv.dataset.lv });
    lv.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === lv));
    return;
  }
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
  if (bq) {
    const parts = bq.dataset.bq.split('|');
    const sid = parts[0], d = Number(parts[1]);
    buyQty[sid] = Math.max(1, (buyQty[sid] || 1) + d);
    return render();
  }
  const bought = hit('[data-bought]');
  if (bought) {
    const [tt, cc] = bought.dataset.bought.split('|');
    const sid = tt + ':' + cc;
    const n = buyQty[sid] || 1;
    const r = db.stock[sid] || { qty: 0 };
    db.stock[sid] = { ...r, wish: false, qty: (r.qty || 0) + n, level: 'full' };
    delete buyQty[sid];
    save(); toast(cc + ' 入庫 ' + n); return render();
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
      list.forEach(it => {
        const sid = it.t + ':' + it.c;
        const n = buyQty[sid] || 1;
        const r = db.stock[sid] || { qty: 0 };
        db.stock[sid] = { ...r, wish: false, qty: (r.qty || 0) + n, level: 'full' };
        delete buyQty[sid];
        total += n;
      });
      save(); toast('已入庫 ' + total + ' 項'); render();
    });
    return;
  }
  if (hit('#clearWish')) {
    askConfirm('清空待買清單？', '清單上的項目會全部移除，庫存不受影響。', '清空', true, () => {
      Object.keys(db.stock).forEach(sid => { if (db.stock[sid].wish) db.stock[sid] = { ...db.stock[sid], wish: false }; });
      Object.keys(db.stock).forEach(sid => { const v = db.stock[sid]; if (!v.qty && !v.wish && !v.scrap && !v.note) delete db.stock[sid]; });
      save(); render();
    });
    return;
  }

  // 配色
  const pc = hit('[data-proj]');
  if (pc) { projOpen = pc.dataset.proj || null; projPick = false; return render(); }
  const pl = hit('[data-pl]');
  if (pl) { db.projLayout = pl.dataset.pl; save(); return render(); }
  const pk = hit('[data-pk]');
  if (pk) { pickType = pk.dataset.pk; pickFamilySel = new Set(); return render(); }
  if (hit('#newProj')) {
    askText('新增配色紀錄', '之後隨時可以改名字。', '例如：聖誕小屋、媽媽的桌巾', '', '建立', name => {
      if (!name) return;
      const id = 'p' + Date.now().toString(36);
      db.projects.push({ id, name, colors: [] });
      save(); projOpen = id; projPick = true; render();
    });
    return;
  }
  if (hit('#pickColors')) { projPick = true; pickQ = ''; return render(); }
  if (hit('#donePick')) { projPick = false; return render(); }
  const pick = hit('[data-pick]');
  if (pick && projOpen) {
    const p = proj(projOpen), c = pick.dataset.pick;
    const i = p.colors.findIndex(o => o.t === pickType && o.c === c);
    if (i >= 0) p.colors.splice(i, 1); else p.colors.push({ t: pickType, c });
    save(); return render();
  }
  const drop = hit('[data-drop]');
  if (drop && projOpen) {
    const [tt, c] = drop.dataset.drop.split('|');
    askConfirm('從配色紀錄移除？', `${esc(c)} 會從這份配色紀錄中拿掉，庫存紀錄不受影響。`, '移除', true, () => {
      const p = proj(projOpen);
      p.colors = p.colors.filter(o => !(o.t === tt && o.c === c));
      save(); render();
    });
    return;
  }
  if (hit('#renameProj') && projOpen) {
    const p = proj(projOpen);
    askText('改名字', '', '配色紀錄名稱', p.name, '儲存', name => { if (name) { p.name = name; save(); render(); } });
    return;
  }
  if (hit('#delProj') && projOpen) {
    const p = proj(projOpen);
    askConfirm('刪掉這份配色紀錄？', `「${esc(p.name)}」的配色會消失，庫存和待買清單不受影響。`, '刪掉', true, () => {
      db.projects = db.projects.filter(o => o.id !== projOpen);
      save(); projOpen = null; render();
    });
    return;
  }
  if (hit('#wishMissing') && projOpen) {
    const p = proj(projOpen);
    let n = 0;
    p.colors.forEach(it => { const r = rec(it.t, it.c); if (r && r.qty > 0) return; setRec(it.t, it.c, { wish: true }); n++; });
    toast('已加入 ' + n + ' 項到待買清單'); return render();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') {
    q = e.target.value;
    const el = document.getElementById('shelfBody');
    if (el) el.innerHTML = shelfBody(); else render();
  }
  if (e.target.id === 'pq') {
    pickQ = e.target.value;
    const el = document.getElementById('pickBody');
    if (el) el.innerHTML = pickBody(); else render();
  }
});

/* ---------- 長壓拖曳排序（配色） ---------- */
let dragS = null, lastDragEnd = 0;
function pointOf(e) { return e.touches && e.touches[0] ? e.touches[0] : e; }
function dragStart(e) {
  if (!projOpen || projPick || view !== 'proj') return;
  const sw = e.target.closest && e.target.closest('[data-idx]');
  if (!sw) return;
  const pt = pointOf(e);
  dragS = { el: sw, x: pt.clientX, y: pt.clientY, on: false, timer: null };
  dragS.timer = setTimeout(() => {
    if (!dragS) return;
    dragS.on = true;
    document.body.classList.add('dragmode');
    dragS.el.classList.add('dragging');
    if (navigator.vibrate) navigator.vibrate(12);
  }, 420);
}
function syncOrder(container) {
  const nodes = Array.prototype.slice.call(container.querySelectorAll('[data-drop]'));
  const p = proj(projOpen);
  if (!p) return;
  p.colors = nodes.map(n => { const parts = n.dataset.drop.split('|'); return { t: parts[0], c: parts[1] }; });
  nodes.forEach((n, i) => n.setAttribute('data-idx', String(i)));
}
function dragMove(e) {
  if (!dragS) return;
  const pt = pointOf(e);
  if (!dragS.on) {
    if (Math.hypot(pt.clientX - dragS.x, pt.clientY - dragS.y) > 10) { clearTimeout(dragS.timer); dragS = null; }
    return;
  }
  e.preventDefault();
  const under = document.elementFromPoint(pt.clientX, pt.clientY);
  const tgt = under && under.closest && under.closest('[data-idx]');
  if (!tgt || tgt === dragS.el) return;
  const container = dragS.el.parentElement;
  if (!container || tgt.parentElement !== container) return;
  const before = tgt.compareDocumentPosition(dragS.el) & Node.DOCUMENT_POSITION_FOLLOWING;
  container.insertBefore(dragS.el, before ? tgt : tgt.nextSibling);
  syncOrder(container);
}
function dragEnd() {
  if (!dragS) return;
  clearTimeout(dragS.timer);
  const moved = dragS.on;
  if (moved) {
    dragS.el.classList.remove('dragging');
    document.body.classList.remove('dragmode');
    lastDragEnd = Date.now();
    save();
    toast('順序已更新');
  }
  dragS = null;
  if (moved) render();
}
document.addEventListener('touchstart', dragStart, { passive: true });
document.addEventListener('touchmove', dragMove, { passive: false });
document.addEventListener('touchend', dragEnd);
document.addEventListener('touchcancel', dragEnd);
document.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', dragMove);
document.addEventListener('mouseup', dragEnd);

render();
