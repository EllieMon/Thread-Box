

/* ---------- 儲存層：優先用瀏覽器本機儲存，不支援時退回記憶體 ---------- */
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
const KINDS = [
  { id: 'moul', label: '六股棉', full: 'Mouliné 六股棉線' },
  { id: 'other', label: '自訂', full: '自訂線材' }
];
const kindOf = id => KINDS.find(k => k.id === id) || { id, label: id, full: id };
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

let db = Store.load() || { stock: {}, custom: [], projects: [], projLayout: 'bar', v: 1 };
if (!db.stock) db.stock = {};
if (!db.custom) db.custom = [];
if (!db.projects) db.projects = [];
if (!db.projLayout) db.projLayout = 'bar';
// 清掉已停用線種留下的資料，避免查不到線種而出錯
(() => {
  const valid = KINDS.map(k => k.id);
  let dirty = false;
  Object.keys(db.stock).forEach(id => {
    if (!valid.includes(id.slice(0, id.indexOf(':')))) { delete db.stock[id]; dirty = true; }
  });
  db.projects.forEach(p => {
    const n = p.colors.length;
    p.colors = p.colors.filter(it => valid.includes(it.k));
    if (p.colors.length !== n) dirty = true;
  });
  if (dirty) Store.save(db);
})();

let view = 'shelf';          // shelf | wish | backup
{
  const h = (location.hash || '').slice(1);
  if (['shelf', 'proj', 'wish', 'backup'].includes(h)) view = h;
}
let kind = 'moul';
let q = '';
let famFilter = null;
let stateFilter = 'all';     // all | have | low | scrap | none | wish
let openKey = null;
let projOpen = null, projPick = false;
let pickKind = 'moul', pickFam = null, pickQ = '';
let buyQty = {};   // 待買清單上暫存的「要入幾束」，不寫進儲存

const save = () => Store.save(db);
const key = (k, c) => k + ':' + c;
const rec = (k, c) => db.stock[key(k, c)] || null;
function setRec(k, c, patch) {
  const id = key(k, c);
  const cur = db.stock[id] || { skeins: 0, level: 'full', wish: false, scrap: false, note: '' };
  const next = { ...cur, ...patch };
  if (!next.skeins && !next.wish && !next.scrap && !next.note) delete db.stock[id];
  else db.stock[id] = next;
  save();
}

// 自訂線改名時，順便把「成本與販售」裡連結到這個色號的商品一起改過去
function syncRenameToProducts(oldCode, newCode) {
  try {
    const costDb = App.readCost();
    let touched = 0;
    (costDb.products || []).forEach(pr => {
      if (pr.thread === 'other' && pr.color === oldCode) { pr.color = newCode; touched++; }
    });
    if (touched) App.writeCost(costDb);
  } catch (_) { /* 成本資料還沒建立過也沒關係，忽略即可 */ }
}
// 自訂線刪除時，解除商品端的連結，避免商品對到不存在的色號；回傳受影響的商品數
function unlinkFromProducts(code) {
  try {
    const costDb = App.readCost();
    let touched = 0;
    (costDb.products || []).forEach(pr => {
      if (pr.thread === 'other' && pr.color === code) { pr.thread = ''; pr.color = ''; touched++; }
    });
    if (touched) App.writeCost(costDb);
    return touched;
  } catch (_) { return 0; }
}

/* ---------- 色卡資料 ---------- */
function palette() {
  if (kind === 'other') return db.custom;
  return DMC;
}
function sortedPalette() {
  const p = palette().slice();
  if (kind === 'other') return p;
  return p.sort((a, b) => {
    const na = parseInt(a.c, 10), nb = parseInt(b.c, 10);
    if (isNaN(na) && isNaN(nb)) return a.c.localeCompare(b.c);
    if (isNaN(na)) return -1;
    if (isNaN(nb)) return 1;
    return na - nb;
  });
}
function matches(x) {
  const r = rec(kind, x.c);
  if (famFilter && x.f !== famFilter) return false;
  if (stateFilter === 'have' && !(r && r.skeins > 0)) return false;
  if (stateFilter === 'low' && !(r && r.skeins > 0 && r.level === 'low')) return false;
  if (stateFilter === 'scrap' && !(r && r.scrap)) return false;
  if (stateFilter === 'none' && r && (r.skeins > 0 || r.scrap)) return false;
  if (stateFilter === 'wish' && !(r && r.wish)) return false;
  if (q) {
    const s = q.toLowerCase().trim();
    if (!(x.c.toLowerCase().includes(s) || (x.n || '').toLowerCase().includes(s)
      || (x.b || '').toLowerCase().includes(s))) return false;
  }
  return true;
}
const wishList = () => Object.entries(db.stock).filter(([, v]) => v.wish)
  .map(([id, v]) => {
    const i = id.indexOf(':'), k = id.slice(0, i), c = id.slice(i + 1);
    const src = k === 'other' ? db.custom : DMC;
    const col = src.find(x => x.c === c) || { c, n: '', h: '#ccc', f: '' };
    return { k, c, col, v };
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
  const r = parseInt(hx.slice(0, 2), 16) / 255,
        g = parseInt(hx.slice(2, 4), 16) / 255,
        b = parseInt(hx.slice(4, 6), 16) / 255;
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

function findColor(k, c) {
  const src = k === 'other' ? db.custom : DMC;
  return src.find(x => x.c === c) || { c, n: '', h: '#cccccc', f: '自訂' };
}
const proj = id => db.projects.find(p => p.id === id);
function projStat(p) {
  let miss = 0, todo = 0;
  p.colors.forEach(it => {
    const r = rec(it.k, it.c);
    if (r && r.skeins > 0) return;
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



/* ---------- 自製對話框（不用系統彈窗） ---------- */
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


function customForm(edit) {
  const o = edit || { c: '', n: '', b: '', h: '#8B9A8C' };
  showModal(`<h3>${edit ? '編輯自訂線' : '新增自訂線'}</h3>
    <p>金蔥線、亮線、俄羅斯刺繡用線，或其他廠牌的線都可以放這裡。</p>
    <div class="field"><label>編號</label><input id="cCode" type="text" placeholder="例如 E3852" value="${esc(o.c)}"></div>
    <div class="field"><label>廠牌（可留空）</label><input id="cBrand" type="text" placeholder="例如 Anchor、Madeira、Cosmo" value="${esc(o.b || '')}"></div>
    <div class="field"><label>名稱或說明（可留空）</label><input id="cName" type="text" placeholder="例如 金蔥 · 淺金" value="${esc(o.n || '')}"></div>
    <div class="field"><label>顏色</label><input id="cHex" type="color" value="${esc(o.h)}"></div>
    <div class="mrow"><button class="no" data-m="no">取消</button>
    <button class="yes" data-m="ok">${edit ? '儲存' : '新增'}</button></div>`, () => {
    const c = (document.getElementById('cCode').value || '').trim();
    const b = (document.getElementById('cBrand').value || '').trim();
    const n = (document.getElementById('cName').value || '').trim();
    const h = (document.getElementById('cHex').value || '#BFBFBF').toLowerCase();
    if (!c) return toast('請先填編號');
    if (db.custom.some(x => x.c === c && (!edit || x.c !== edit.c))) return toast('這個編號已經有了');
    const rec2 = { c, n, b, h, f: famOfHex(h) };
    if (edit) {
      const i = db.custom.findIndex(x => x.c === edit.c);
      db.custom[i] = rec2;
      if (c !== edit.c) {          // 換編號時，庫存與作品裡的引用一起搬
        const oldId = key('other', edit.c);
        if (db.stock[oldId]) { db.stock[key('other', c)] = db.stock[oldId]; delete db.stock[oldId]; }
        db.projects.forEach(p => p.colors.forEach(it => {
          if (it.k === 'other' && it.c === edit.c) it.c = c;
        }));
        syncRenameToProducts(edit.c, c);
      }
      save(); openKey = c; render(); openSheet(c);
    } else {
      db.custom.push(rec2);
      save(); render(); openSheet(c);
    }
  });
}

/* ---------- 畫面：色卡總覽 ---------- */
function renderShelf() {
  const states = [['all', '全部'], ['have', '有庫存'], ['low', '快用完'], ['scrap', '有殘線'], ['none', '還沒有'], ['wish', '待買']];

  let h = `
  <div class="searchrow"><div class="search">
    <input id="q" type="search" inputmode="search" placeholder="找色號、色名或廠牌" value="${esc(q)}">
    ${q ? '<button class="clr" id="qclr" aria-label="清除">✕</button>' : ''}
  </div></div>
  <div class="chips">
    ${states.map(s => `<button class="chip" data-st="${s[0]}" aria-pressed="${stateFilter === s[0]}">${s[1]}</button>`).join('')}
  </div>
  <div class="chips">
    <button class="chip" data-fam="" aria-pressed="${!famFilter}">全色系</button>
    ${FAMS.map(f => `<button class="chip" data-fam="${esc(f[0])}" aria-pressed="${famFilter === f[0]}"><span class="dot" style="background:${f[1]}"></span>${f[0]}</button>`).join('')}
  </div>
  <div id="shelfBody">${shelfBody()}</div>`;
  return h;
}

// 色票列表獨立成一塊，打字搜尋時只更新這裡，輸入框不會被重建（iOS 鍵盤才不會收起來）
function shelfBody() {
  const list = sortedPalette().filter(matches);
  const kindObj = kindOf(kind);
  let h = `<div class="count"><span>${kindObj.full} · ${list.length} 色</span>
    ${kind === 'other' ? '<button id="addCustom">＋ 新增自訂線</button>' : ''}</div>`;

  if (!list.length) {
    h += kind === 'other' && !db.custom.length
      ? `<div class="empty"><b>還沒有自訂線材</b>金蔥線、亮線、俄羅斯刺繡用線，或其他廠牌的線都可以加在這裡。</div>`
      : `<div class="empty"><b>這個條件下沒有色號</b>換個色系或清掉搜尋字看看。</div>`;
  } else {
    h += '<div class="capgrid">' + list.map(x => {
      const r = rec(kind, x.c);
      const has = r && r.skeins > 0;
      const dark = lumOf(x) < 0.58;
      const tags = [];
      if (has && r.level === 'low') tags.push('<i class="low">快用完</i>');
      else if (has) tags.push(`<i>${levelLabel(r.level)}</i>`);
      if (r && r.scrap) tags.push('<i>殘線</i>');
      if (r && r.wish) tags.push('<i>待買</i>');
      if (!tags.length) tags.push('<i class="none">—</i>');
      return `<button class="cap" data-c="${esc(x.c)}" title="${esc(x.c)} ${esc(x.n || '')}"
        style="background:${FAMTINT[x.f] || '#EAE7E3'}">
        <span class="chip${has ? '' : ' zero'}"
          style="background:${esc(x.h)};color:${dark ? '#fff' : '#2C2825'}"><em>${has ? r.skeins : 0}</em></span>
        <span class="body">
          <b>${esc(x.c)}</b>
          <span class="tags">${tags.join('')}</span>
        </span>
      </button>`;
    }).join('') + '</div>';
  }
  return h;
}



// 挑色的結果區也獨立，理由同 shelfBody
function pickBody() {
  const p = proj(projOpen);
  if (!p) return '';
  const src = (pickKind === 'other' ? db.custom : DMC).filter(x => {
    if (pickFam && x.f !== pickFam) return false;
    if (pickQ) {
      const q2 = pickQ.toLowerCase().trim();
      if (!(x.c.toLowerCase().includes(q2) || (x.n || '').toLowerCase().includes(q2)
        || (x.b || '').toLowerCase().includes(q2))) return false;
    }
    return true;
  });
  const chosen = new Set(p.colors.map(it => it.k + ':' + it.c));
  return `<div class="count"><span>已選 ${p.colors.length} 色 · 這裡有 ${src.length} 色</span></div>`
    + (src.length ? `<div class="pickgrid">${src.map(x => {
        const on = chosen.has(pickKind + ':' + x.c);
        return `<button class="pick${on ? ' on' : ''}" data-pick="${esc(x.c)}"
          style="background:${esc(x.h)};color:${lumOf(x) < 0.58 ? '#fff' : '#2C2825'}">${esc(x.c)}</button>`;
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
        const sw = p.colors.slice(0, 4).map(it => `<span style="background:${esc(findColor(it.k, it.c).h)}"></span>`).join('');
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
    <div class="kinds" style="margin-top:0">${KINDS.map(k =>
      `<button data-pk="${k.id}" aria-selected="${pickKind === k.id}">${k.label}</button>`).join('')}</div>
    <div class="searchrow"><div class="search">
      <input id="pq" type="search" placeholder="找色號" value="${esc(pickQ)}"></div></div>
    <div class="chips">
      <button class="chip" data-pf="" aria-pressed="${!pickFam}">全色系</button>
      ${FAMS.map(f => `<button class="chip" data-pf="${esc(f[0])}" aria-pressed="${pickFam === f[0]}"><span class="dot" style="background:${f[1]}"></span>${f[0]}</button>`).join('')}
    </div>
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
      const x = findColor(it.k, it.c);
      const r = rec(it.k, it.c);
      const dark = lumOf(x) < 0.58;
      const tag = (r && r.skeins > 0) ? '' : '<span class="miss">缺</span>';
      return { x, dark, tag, it };
    });
    h += db.projLayout === 'bar'
      ? cells.map((o, i) => `<button class="pbar" data-idx="${i}" data-drop="${esc(o.it.k)}|${esc(o.it.c)}"
          style="background:${esc(o.x.h)};color:${o.dark ? '#fff' : '#2C2825'}">
          <b>${esc(o.x.c)}</b>${o.tag}</button>`).join('')
      : `<div class="pgrid">${cells.map((o, i) => `<button class="pcell" data-idx="${i}" data-drop="${esc(o.it.k)}|${esc(o.it.c)}"
          style="background:${esc(o.x.h)};color:${o.dark ? '#fff' : '#2C2825'}">
          ${o.tag}<b>${esc(o.x.c)}</b></button>`).join('')}</div>`;
  }

  return h;
}

/* ---------- 畫面：待買清單 ---------- */
function renderWish() {
  const list = wishList();
  let h = `<div class="panel"><h2>待買清單</h2>
    <p>買回來之後，先調整每一色要入幾束，再按「入庫」；或一次按最下面的「全部入庫」。</p>`;
  if (!list.length) {
    h += `<div class="empty"><b>清單是空的</b>逛店前先來這裡看一眼，就不會又買到重複的線了。</div></div>`;
    return h;
  }
  h += list.map(it => {
    const id = it.k + ':' + it.col.c;
    const n = buyQty[id] || 1;
    return `<div class="row">
      <div class="patch" style="background:${esc(it.col.h)}"></div>
      <div class="txt"><b>${esc(it.col.c)}</b>
        <small>${esc([kindOf(it.k).label, it.col.b, it.col.n].filter(Boolean).join(' · '))}</small></div>
      <div class="qty">
        <button data-bq="${esc(id)}|-1" aria-label="少一束">−</button>
        <span>${n}</span>
        <button data-bq="${esc(id)}|1" aria-label="多一束">＋</button>
      </div>
      <button class="act" data-bought="${esc(it.k)}|${esc(it.col.c)}">入庫</button>
    </div>`;
  }).join('');
  h += `<button class="btn" id="buyAll" style="margin-top:16px">全部入庫（${list.length} 色）</button>
    <button class="btn ghost" id="clearWish">清空整張清單</button></div>`;
  return h;
}

/* ---------- 畫面：備份與統計 ---------- */
function renderBackup() {
  const all = Object.values(db.stock);
  const owned = all.filter(x => x.skeins > 0);
  const skeins = owned.reduce((s, x) => s + x.skeins, 0);
  const low = owned.filter(x => x.level === 'low').length;
  const scrap = all.filter(x => x.scrap).length;

  return `
  <div class="panel"><h2>我的線況</h2>
    <div class="row"><div class="txt"><b>${owned.length} 色</b><small>目前手上有的顏色</small></div></div>
    <div class="row"><div class="txt"><b>${skeins} 束</b><small>全部加起來的束數</small></div></div>
    <div class="row"><div class="txt"><b>${low} 色</b><small>標記為快用完</small></div></div>
    <div class="row"><div class="txt"><b>${scrap} 色</b><small>有殘線可以先用</small></div></div>
    <div class="row"><div class="txt"><b>${wishList().length} 色</b><small>在待買清單裡</small></div></div>
  </div>

  <div class="panel"><h2>備份</h2>
    <p>資料存在這支手機的瀏覽器裡。請定期下載備份；照片也會包含在檔案裡。可選擇備份檔，或貼上舊版備份文字來還原。</p>
    <button class="btn" id="doExport">下載完整備份（含照片）</button>
    <input type="file" id="backupFile" accept=".json,application/json" style="margin:12px 0;width:100%">
    <textarea id="ioBox" placeholder="可在這裡貼上舊版或新版備份文字。"></textarea>
    <button class="btn ghost" id="doImport">從上面的文字還原</button>
  </div>

  <div class="panel"><h2>全部清除</h2>
    <p>會刪掉所有庫存、待買與自訂線材，而且無法復原。記得先備份。</p>
    <button class="btn warn" id="doReset">清除線材與配色紀錄</button>
  </div>

  ${Store.persistent ? '' : `<div class="panel"><h2>提醒</h2><p>目前這個環境不支援本機儲存，關掉頁面資料就會消失。把這個檔案放到你自己的網址上打開，就能正常存檔了。</p></div>`}`;
}

/* ---------- 詳細面板 ---------- */
function openSheet(code) {
  const src = kind === 'other' ? db.custom : DMC;
  const x = src.find(i => i.c === code);
  if (!x) return;
  openKey = code;
  const r = rec(kind, code) || { skeins: 0, level: 'full', wish: false, scrap: false, note: '' };

  document.getElementById('sheetBody').innerHTML = `
    <div class="hero">
      <div class="patch" style="background:${esc(x.h)}"></div>
      <div class="t"><b>${esc(x.c)}</b><small>${esc([x.b, x.n].filter(Boolean).join(' · ') || '自訂線材')}</small>
      <em>${esc(kindOf(kind).full)}${x.f ? ' · ' + esc(x.f) : ''}</em></div>
    </div>

    <div class="block"><div class="lab">有幾束</div>
      <div class="stepper">
        <button data-step="-1" aria-label="減一束">−</button>
        <div class="n" id="nSk">${r.skeins}<span>束</span></div>
        <button data-step="1" aria-label="加一束">＋</button>
      </div>
    </div>

    <div class="block"><div class="lab">剩下大概多少</div>
      <div class="seg">${LEVELS.map(l => `<button data-lv="${l[0]}" aria-pressed="${r.level === l[0]}">${l[1]}</button>`).join('')}</div>
    </div>

    <div class="block"><div class="lab">標記（不影響上面的束數）</div>
      <div class="toggles">
        <button data-tg="scrap" class="scrap" aria-pressed="${!!r.scrap}"><b>有殘線</b><small>零頭還能用</small></button>
        <button class="wish" data-tg="wish" aria-pressed="${!!r.wish}"><b>${r.wish ? '已在待買' : '加入待買'}</b><small>下次補貨</small></button>
      </div>
    </div>

    <div class="block"><div class="lab">備註</div>
      <textarea class="note" id="noteBox" placeholder="例如：8m 一束、放在第二層鐵盒、留給聖誕圖">${esc(r.note)}</textarea>
    </div>

    ${kind === 'other' ? '<button class="btn ghost" id="editCustom">編輯這個自訂線</button><button class="btn warn" id="delCustom">刪掉這個自訂線</button>' : ''}
    <button class="btn ghost" id="closeSheetBottom">收起來</button>`;

  document.getElementById('scrim').classList.add('on');
  document.getElementById('sheet').classList.add('on');
  App.fitDialogs();
}
function closeSheet() {
  const nb = document.getElementById('noteBox');
  if (nb && openKey !== null) setRec(kind, openKey, { note: nb.value });
  document.getElementById('scrim').classList.remove('on');
  document.getElementById('sheet').classList.remove('on');
  openKey = null;
  render();
}

/* ---------- 主渲染 ---------- */
function render() {
  const kindsEl = document.getElementById('kinds');
  kindsEl.style.display = view === 'shelf' ? 'flex' : 'none';
  kindsEl.innerHTML = KINDS.map(k =>
    `<button role="tab" data-kind="${k.id}" aria-selected="${kind === k.id}">${k.label}</button>`).join('');

  const wn = wishList().length;
  const iconImgs = { shelf: 'assets/thread-library.webp', proj: 'assets/embroidery-project.webp', wish: 'assets/material-list.webp' };
  const backupSvg = '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M4 17v2h16v-2"/>';
  const tabs = [['shelf', '色卡'], ['proj', '配色'], ['wish', '待買'], ['backup', '備份']];
  document.getElementById('nav').innerHTML = tabs.map(t =>
    `<button data-view="${t[0]}" aria-selected="${view === t[0]}">
      ${t[0] === 'backup' ? `<svg viewBox="0 0 24 24">${backupSvg}</svg>` : `<img class="navicon" src="${iconImgs[t[0]]}" alt="">`}${t[1]}
      ${t[0] === 'wish' && wn ? `<span class="badge">${wn}</span>` : ''}
    </button>`).join('');

  document.getElementById('sub').textContent =
    view === 'shelf' ? 'DMC 繡線庫存' : view === 'proj' ? '配色紀錄' : view === 'wish' ? '下次要補的線' : '統計與備份';

  const m = document.getElementById('main');
  m.innerHTML = view === 'shelf' ? renderShelf()
    : view === 'proj' ? renderProj()
    : view === 'wish' ? renderWish() : renderBackup();
}

/* ---------- 事件 ---------- */
document.addEventListener('click', e => {
  if (Date.now() - lastDragEnd < 450) return;   // 忽略拖曳結束後的那次點擊
  const t = e.target;
  const hit = s => t.closest(s);

  // --- 對話框 ---
  const mb = hit('[data-m]');
  if (mb) {
    if (mb.dataset.m === 'ok') { const cb = modalCb; hideModal(); if (cb) cb(); }
    else hideModal();
    return;
  }
  if (t.id === 'mscrim') return hideModal();

  const kb = hit('[data-kind]');
  if (kb) { kind = kb.dataset.kind; stateFilter = 'all'; famFilter = null; return render(); }

  const vb = hit('[data-view]');
  if (vb) { view = vb.dataset.view; return render(); }

  // --- 配色紀錄 ---
  const pc = hit('[data-proj]');
  if (pc) { projOpen = pc.dataset.proj || null; projPick = false; return render(); }
  const pl = hit('[data-pl]');
  if (pl) { db.projLayout = pl.dataset.pl; save(); return render(); }
  const pk = hit('[data-pk]');
  if (pk) { pickKind = pk.dataset.pk; pickFam = null; return render(); }
  const pf = hit('[data-pf]');
  if (pf) { pickFam = pf.dataset.pf || null; return render(); }
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
    const i = p.colors.findIndex(o => o.k === pickKind && o.c === c);
    if (i >= 0) p.colors.splice(i, 1); else p.colors.push({ k: pickKind, c });
    save(); return render();
  }
  const drop = hit('[data-drop]');
  if (drop && projOpen) {
    const [k, c] = drop.dataset.drop.split('|');
    askConfirm('從配色紀錄移除？', `${esc(c)} 會從這份配色紀錄中拿掉，庫存紀錄不受影響。`, '移除', true, () => {
      const p = proj(projOpen);
      p.colors = p.colors.filter(o => !(o.k === k && o.c === c));
      save(); render();
    });
    return;
  }
  if (hit('#renameProj') && projOpen) {
    const p = proj(projOpen);
    askText('改名字', '', '配色紀錄名稱', p.name, '儲存', name => {
      if (name) { p.name = name; save(); render(); }
    });
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
    p.colors.forEach(it => {
      const r = rec(it.k, it.c);
      if (r && r.skeins > 0) return;
      setRec(it.k, it.c, { wish: true }); n++;
    });
    toast('已加入 ' + n + ' 色到待買清單'); return render();
  }

  const sw = hit('.cap');
  if (sw) return openSheet(sw.dataset.c);

  const st = hit('[data-st]');
  if (st) { stateFilter = st.dataset.st; return render(); }

  const fm = hit('[data-fam]');
  if (fm) { famFilter = fm.dataset.fam || null; return render(); }

  if (hit('#qclr')) { q = ''; return render(); }

  // 詳細面板
  const step = hit('[data-step]');
  if (step && openKey !== null) {
    const r = rec(kind, openKey) || { skeins: 0 };
    const n = Math.max(0, (r.skeins || 0) + Number(step.dataset.step));
    setRec(kind, openKey, { skeins: n });
    document.getElementById('nSk').innerHTML = n + '<span>束</span>';
    return;
  }
  const lv = hit('[data-lv]');
  if (lv && openKey !== null) {
    setRec(kind, openKey, { level: lv.dataset.lv });
    lv.parentElement.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', b === lv));
    return;
  }
  const tg = hit('[data-tg]');
  if (tg && openKey !== null) {
    const f = tg.dataset.tg;
    const cur = (rec(kind, openKey) || {})[f];
    setRec(kind, openKey, { [f]: !cur });
    tg.setAttribute('aria-pressed', String(!cur));
    if (f === 'wish') {
      tg.querySelector('b').textContent = !cur ? '已在待買' : '加入待買';
      toast(!cur ? '已加入待買清單' : '已從待買清單移除');
    }
    if (f === 'scrap') toast(!cur ? '已標記有殘線' : '已取消殘線標記');
    return;
  }
  if (hit('#closeSheet, #closeSheetBottom') || t.id === 'scrim') return closeSheet();
  if (hit('#delCustom') && openKey !== null) {
    const k0 = openKey;
    askConfirm('刪掉這個自訂線？', `${esc(k0)} 的庫存紀錄也會一起消失。`, '刪掉', true, () => {
      db.custom = db.custom.filter(x => x.c !== k0);
      delete db.stock[key('other', k0)];
      save(); openKey = null;
      document.getElementById('scrim').classList.remove('on');
      document.getElementById('sheet').classList.remove('on');
      const touched = unlinkFromProducts(k0);
      if (touched) toast(`已刪除，並解除 ${touched} 項商品的線盒連結（庫存數字已保留，可到商品頁重新設定）`);
      render();
    });
    return;
  }

  // 待買
  const bq = hit('[data-bq]');
  if (bq) {
    const parts = bq.dataset.bq.split('|');
    const id = parts[0], d = Number(parts[1]);
    buyQty[id] = Math.max(1, (buyQty[id] || 1) + d);
    return render();
  }
  const bought = hit('[data-bought]');
  if (bought) {
    const [k, c] = bought.dataset.bought.split('|');
    const id = k + ':' + c;
    const n = buyQty[id] || 1;
    const r = db.stock[id] || { skeins: 0 };
    db.stock[id] = { ...r, wish: false, skeins: (r.skeins || 0) + n, level: 'full' };
    delete buyQty[id];
    save(); toast(c + ' 入庫 ' + n + ' 束'); return render();
  }
  if (hit('#buyAll')) {
    const list = wishList();
    if (!list.length) return;
    const lines = list.map(it => {
      const id = it.k + ':' + it.col.c;
      return `<b>${esc(it.col.c)}</b> × ${buyQty[id] || 1} 束`;
    }).join('<br>');
    showModal(`<h3>全部入庫</h3><p>確認照下面的數量加進庫存，並從待買清單移除：</p>
      <div class="buylist">${lines}</div>
      <div class="mrow"><button class="no" data-m="no">再看看</button>
      <button class="yes" data-m="ok">確定入庫</button></div>`, () => {
      let total = 0;
      list.forEach(it => {
        const id = it.k + ':' + it.col.c;
        const n = buyQty[id] || 1;
        const r = db.stock[id] || { skeins: 0 };
        db.stock[id] = { ...r, wish: false, skeins: (r.skeins || 0) + n, level: 'full' };
        delete buyQty[id];
        total += n;
      });
      save(); toast('已入庫 ' + total + ' 束'); render();
    });
    return;
  }
  if (hit('#clearWish')) {
    askConfirm('清空待買清單？', '清單上的色號會全部移除，庫存不受影響。', '清空', true, () => {
      Object.keys(db.stock).forEach(id => { if (db.stock[id].wish) db.stock[id] = { ...db.stock[id], wish: false }; });
      Object.keys(db.stock).forEach(id => {
        const v = db.stock[id];
        if (!v.skeins && !v.wish && !v.scrap && !v.note) delete db.stock[id];
      });
      save(); render();
    });
    return;
  }

  // 自訂線
  if (hit('#addCustom')) return customForm(null);
  if (hit('#editCustom') && openKey !== null) return customForm(db.custom.find(x => x.c === openKey));

  // 備份
  if (hit('#doExport')) {
    (async()=>{try{const txt=await App.backup();const box=document.getElementById('ioBox');box.value=txt;App.download('線盒完整備份-'+App.today()+'.json',txt);toast('完整備份已下載，包含照片');}catch(e){toast('備份失敗，請再試一次')}})();return;
  }
  if (hit('#doImport')) {
    const raw=document.getElementById('ioBox').value.trim();if(!raw)return toast('請貼上備份內容');
    try {const o=JSON.parse(raw);if(o.format!=='embroidery-app-v1' && (!o.stock || typeof o.stock!=='object'))throw Error();
      askConfirm('還原備份？','目前所有紀錄會由備份取代。請先備份現況。','還原',false,()=>{
        (async()=>{try{
          if(o.format==='embroidery-app-v1'){await App.restore(raw);db=Store.load();}
          else {db={stock:o.stock||{},custom:o.custom||[],projects:o.projects||[],projLayout:o.projLayout||'bar',v:1};save();}
          toast('還原完成');render();
        }catch(e){toast('還原失敗，請檢查備份')}})();
      });
    }catch(e){toast('備份內容無法辨識')}return;
  }
  if (hit('#doReset')) {
    askConfirm('清除線盒資料？', '線材、配色紀錄、待買、自訂線材會刪除；成本與日曆資料保留。', '清除', true, () => {
      db = { stock: {}, custom: [], projects: [], projLayout: 'bar', v: 1 };
      save(); toast('已全部清除'); render();
    });
    return;
  }
});

document.addEventListener('change', e => {if(e.target.id==='backupFile' && e.target.files[0])e.target.files[0].text().then(t=>{document.getElementById('ioBox').value=t;toast('已讀取備份，按還原確認')});});
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

/* ---------- 長壓拖曳排序 ---------- */
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

// 拖曳時直接搬移 DOM，不重畫整頁，手指按住的元素才不會被銷毀
function syncOrder(container) {
  const nodes = Array.prototype.slice.call(container.querySelectorAll('[data-drop]'));
  const p = proj(projOpen);
  if (!p) return;
  p.colors = nodes.map(n => {
    const parts = n.dataset.drop.split('|');
    return { k: parts[0], c: parts[1] };
  });
  nodes.forEach((n, i) => n.setAttribute('data-idx', String(i)));
}

function dragMove(e) {
  if (!dragS) return;
  const pt = pointOf(e);
  if (!dragS.on) {
    if (Math.hypot(pt.clientX - dragS.x, pt.clientY - dragS.y) > 10) {
      clearTimeout(dragS.timer); dragS = null;
    }
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
  if (moved) render();   // 只有真的拖過才重畫
}
document.addEventListener('touchstart', dragStart, { passive: true });
document.addEventListener('touchmove', dragMove, { passive: false });
document.addEventListener('touchend', dragEnd);
document.addEventListener('touchcancel', dragEnd);
document.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', dragMove);
document.addEventListener('mouseup', dragEnd);

render();

