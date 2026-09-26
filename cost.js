(() => {
const {esc,money,num,id,today}=App;
let db=App.readCost(), tab=(['pieces','orders'].includes((location.hash||'').slice(1))?(location.hash||'').slice(1):'pieces'), opened=null, search='';
const root=document.getElementById('app'), dialog=document.getElementById('editor'), form=document.getElementById('entryForm');
const piece=x=>db.pieces.find(p=>p.id===x);
const order=x=>db.orders.find(o=>o.id===x);
const allLines=()=>db.orders.flatMap(o=>o.lines.map(l=>({...l,date:o.date,store:o.store,orderId:o.id})));
const line=x=>allLines().find(l=>l.id===x);
const fmt=x=>x?esc(x):'—';
const MTYPES={dmc:'DMC 線材',thread:'自訂線',fabric:'布',tools:'物品'};
function material(mtype,mid){
  if(mtype==='dmc') return DMC.find(x=>x.c===mid) || {c:mid,n:'',h:'#cccccc'};
  const th=App.readThread();
  return (th.custom||[]).find(x=>x.id===mid) || {name:'（已刪除）',unit:''};
}
function materialLabel(l){ const m=material(l.materialType,l.materialId); return l.materialType==='dmc' ? `${m.c} ${m.n||''}` : (m.code?`${m.code} · ${m.name||''}`:m.name); }
function stockOf(l){ const th=App.readThread(); const key=l.materialType+':'+l.materialId; return num(th.stock?.[key]?.qty); }
function toast(t){const el=document.getElementById('notice');el.textContent=t;el.classList.add('on');setTimeout(()=>el.classList.remove('on'),2800)}
function persist(){try{App.writeCost(db);render()}catch(e){toast('儲存失敗，請先下載備份並釋出手機空間')}}
function show(html,callback){form.onclick=null;form.onchange=null;form.innerHTML=html+'<div class="foot"><button type="button" id="cancelDialog">取消</button><button class="primary" type="submit">儲存</button></div>';form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;try{await callback(new FormData(form));dialog.close();persist()}catch(err){toast(err.message||'儲存失敗');btn.disabled=false}};dialog.showModal();App.fitDialogs()}
form.addEventListener('click',e=>{if(e.target.id==='cancelDialog')dialog.close()});
const field=(label,name,val='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(val)}" ${extra}></label>`;
const fieldFull=(label,name,val='',type='text',extra='')=>`<div class="full">${field(label,name,val,type,extra)}</div>`;
const select=(label,name,options,value)=>`<label>${label}<select name="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const photos=(ids=[])=>`<div class="cover">${ids.map(x=>`<img data-photo="${esc(x)}" alt="實物照片">`).join('')}</div>`;
async function paintPhotos(){for(const el of document.querySelectorAll('[data-photo]')){try{const src=await App.getPhoto(el.dataset.photo);if(el.isConnected && src)el.src=src}catch(_){}}}
function cardsTitle(title,button,act){return `<div class="pagehead"><h2>${title}</h2>${button?`<button class="primary" data-act="${act}">${button}</button>`:''}</div>`}
function pName(mtype,mid){return esc(materialLabel({materialType:mtype,materialId:mid}))}
function totals(p){const material=(p.allocations||[]).reduce((s,a)=>s+(line(a.lineId)?.unitPrice||0)*num(a.percent)/100,0);const extras=(p.extras||[]).reduce((s,x)=>s+num(x.amount),0);return {material,extras,total:material+extras}}
function saleProfit(p){const s=p.sale;if(!s)return null;const c=totals(p).total;const fee=s.feeMode==='percent'?num(s.price)*num(s.feeValue)/100:num(s.feeValue);return num(s.price)+num(s.shippingCharged)-c-num(s.postage)-num(s.packaging)-fee}

/* ---------- 麵包屑 ---------- */
function paintCrumb(){
  document.querySelector('.crumbnav')?.remove();
  const items = tab==='orders' ? [{label:'材料庫',href:'shelf.html'},{label:'採購紀錄'}] : [{label:'作品',href:'cost.html#pieces'},{label:'成品紀錄'}];
  document.querySelector('header .wrap').insertAdjacentHTML('beforeend', App.breadcrumb(items));
}

/* ---------- 成品紀錄（含統計＋照片並排卡片＋點擊展開動作） ---------- */
function renderStats(){
  let paid=0,revenue=0,profit=0;
  for(const o of db.orders) paid+=o.lines.reduce((s,l)=>s+num(l.unitPrice)*num(l.qty),0)+num(o.shipping)-num(o.discount);
  for(const p of db.pieces) if(p.sale && p.status!=='取消'){revenue+=num(p.sale.price)+num(p.sale.shippingCharged);profit+=saleProfit(p)}
  return `<div class="dashboard"><div class="stat"><b>${money(paid)}</b><small>累計採購實付</small></div><div class="stat"><b>${db.pieces.length} 件</b><small>成本作品</small></div><div class="stat"><b>${money(revenue)}</b><small>已登記販售收入</small></div><div class="stat"><b>${money(profit)}</b><small>已登記作品估算利潤</small></div></div>
  <p class="muted">採購實付與作品分攤是不同口徑<button class="infobtn" data-info="採購實付是訂單當下實際付的錢；作品分攤是把材料成本依比例分到每件作品上，兩者算法不同，不能直接相減。利潤按各件作品的分攤、估算與實際販售費用計算。">i</button></p>`;
}
function renderPieces(){
  if(opened){
    const p=piece(opened); if(!p){opened=null;return renderPieces()}
    const c=totals(p),profit=saleProfit(p);
    return `${cardsTitle('成本作品')}<button class="smallbtn" data-act="closePiece">‹ 返回全部作品</button>
    <div class="piececard open" style="align-items:center">${photos(p.photos)}<div class="info"><h3>${esc(p.name)}</h3><p>${fmt(p.madeDate)} <span class="pill">${esc(p.status||'待製作')}</span></p><p>${esc(p.note||'')}</p>
    <div class="actions" style="display:flex"><button data-act="editPiece" data-id="${p.id}">編輯作品</button><button data-act="changeStatus" data-id="${p.id}">變更進度</button><button data-act="duplicatePiece" data-id="${p.id}">複製下一件</button><button class="subtle" data-act="deletePiece" data-id="${p.id}">刪除</button></div></div></div>
    <div class="costcard"><div class="pagehead"><h3>材料分攤 · ${money(c.material)}</h3><button class="smallbtn" data-act="addAllocation" data-id="${p.id}">＋ 材料</button></div>${(p.allocations||[]).map(a=>{const l=line(a.lineId);return `<div class="rowline"><b>${l?pName(l.materialType,l.materialId):'（已刪除）'}</b> · ${esc(a.percent)}% = ${money(num(l?.unitPrice)*num(a.percent)/100)}<p>購入單價 ${money(l?.unitPrice)} · ${esc(l?.date||'舊購買紀錄')} ${esc(l?.store||'')}</p><div class="actions" style="display:flex"><button data-act="editAllocation" data-id="${p.id}" data-ref="${a.id}">修改</button><button class="subtle" data-act="removeAllocation" data-id="${p.id}" data-ref="${a.id}">移除</button></div></div>`}).join('')||'<p class="muted">尚未加入材料</p>'}</div>
    <div class="costcard"><div class="pagehead"><h3>設計與雜項 · ${money(c.extras)}</h3><button class="smallbtn" data-act="addExtra" data-id="${p.id}">＋ 成本</button></div>${(p.extras||[]).map(x=>`<div class="rowline"><b>${esc(x.name)}</b> · ${money(x.amount)} <span class="pill">${esc(x.kind)}</span><div class="actions" style="display:flex"><button data-act="editExtra" data-id="${p.id}" data-ref="${x.id}">修改</button><button class="subtle" data-act="removeExtra" data-id="${p.id}" data-ref="${x.id}">移除</button></div></div>`).join('')||'<p class="muted">可在雜項自行估算人工費</p>'}<p><b>作品總成本 ${money(c.total)}</b></p></div>
    <div class="costcard"><div class="pagehead"><h3>販售與出貨</h3><button class="smallbtn" data-act="saleForm" data-id="${p.id}">${p.sale?'修改販售':'＋ 登記販售'}</button></div>${p.sale?`${['販售日期 '+fmt(p.sale.date),'平台 '+fmt(p.sale.platform),'售價 '+money(p.sale.price),'購買者 '+fmt(p.sale.buyer),'寄送 '+fmt(p.sale.shippingMethod),'買家付運費 '+money(p.sale.shippingCharged),'實際寄件運費 '+money(p.sale.postage),'包材費 '+money(p.sale.packaging),'平台抽成 '+(p.sale.feeMode==='percent'?esc(p.sale.feeValue)+'%':'固定 '+money(p.sale.feeValue)),'出貨日期 '+fmt(p.sale.shipDate),'訂單編號 '+fmt(p.sale.orderNo),'備註 '+fmt(p.sale.note)].map(t=>`<p>${t}</p>`).join('')}<p><b>估算利潤 ${money(profit)}</b></p>`:'<p class="muted">尚未登記販售</p>'}</div>`;
  }
  let arr=[...db.pieces].reverse().filter(p=>!search||p.name.includes(search));
  return `${renderStats()}${cardsTitle('成本作品','＋ 新增作品','newPiece')}<input class="listsearch" id="search" placeholder="搜尋作品名稱" value="${esc(search)}">
  ${arr.map(p=>`<button class="piececard" data-act="openPiece" data-id="${p.id}" style="cursor:pointer">
    <img class="thumb" data-photo="${esc((p.photos||[])[0]||'')}" alt="">
    <div class="info"><h3>${esc(p.name)}</h3><p>${esc(p.madeDate||'未填日期')} <span class="pill">${esc(p.status||'待製作')}</span></p><p>成本 ${money(totals(p).total)}</p></div>
  </button>`).join('')||'<div class="emptyhint">先建立第一件客製作品，再記材料與販售。</div>'}`;
}

/* ---------- 採購紀錄（材料選擇器＋就地新增＋搜尋） ---------- */
const recentPrice=(mtype,mid)=>{const l=allLines().filter(x=>x.materialType===mtype&&x.materialId===mid).sort((a,b)=>b.date.localeCompare(a.date))[0];return l?.unitPrice||''};
function matSlot(item){
  const mtype = item?.materialType || 'dmc';
  if (mtype === 'dmc') {
    return `<label>DMC 色號 *<input name="materialId" list="dmcList" value="${esc(item?.materialId||'')}" placeholder="輸入色號或名稱，例如 150"></label>
      <datalist id="dmcList">${DMC.map(x=>`<option value="${esc(x.c)}">${esc(x.n)}</option>`).join('')}</datalist>`;
  }
  const th = App.readThread();
  const opts = (th.custom||[]).filter(x=>x.type===mtype).map(x=>[x.id, x.code?`${x.code} · ${x.name||''}`:x.name]);
  return opts.length
    ? select('選擇材料','materialId',opts,item?.materialId||opts[0][0]) + `<button type="button" class="smallbtn" data-quickadd="${mtype}" style="margin:6px 0 2px">＋ 找不到？新增材料</button>`
    : `<p class="muted">還沒有${esc(MTYPES[mtype])}。</p><button type="button" class="smallbtn" data-quickadd="${mtype}">＋ 先新增一筆</button>`;
}
function quickAddMaterial(box, mtype){
  const simple = mtype==='fabric'||mtype==='tools';
  box.innerHTML = `<div class="itemform" style="background:var(--surface)">
    <label>名稱 *<input id="qaName" type="text"></label>
    ${simple?`<label>單位<input id="qaUnit" type="text" value="${mtype==='fabric'?'尺':'個'}"></label>`
      : `<label>編號 *<input id="qaCode" type="text" placeholder="例如 E3852"></label>`}
    <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="smallbtn subtle" id="qaCancel">取消</button><button type="button" class="smallbtn" id="qaSave">新增</button></div>
  </div>`;
  box.querySelector('#qaCancel').onclick=()=>{box.innerHTML=matSlot({materialType:mtype});};
  box.querySelector('#qaSave').onclick=()=>{
    const name=(box.querySelector('#qaName').value||'').trim();
    if(!name) return toast('請填名稱');
    const th=App.readThread(); th.custom=th.custom||[];
    let rec2;
    if(simple){ rec2={id:id(),type:mtype,name,unit:(box.querySelector('#qaUnit').value||'個').trim()}; }
    else { const code=(box.querySelector('#qaCode').value||'').trim(); if(!code) return toast('請填編號'); rec2={id:id(),type:'thread',code,name,h:'#8B9A8C',f:'自訂',unit:'束'}; }
    th.custom.push(rec2); App.writeThread(th);
    box.innerHTML=matSlot({materialType:mtype,materialId:rec2.id});
  };
}
function orderItem(item){
  return `<div class="itemform">
    <button type="button" class="remove" data-remove-item>移除</button>
    ${select('材料類型','materialType',Object.entries(MTYPES).map(([k,v])=>[k,v]),item?.materialType||'dmc')}
    <div class="matslot">${matSlot(item)}</div>
    <div class="formgrid">${field('單價 *','unitPrice',item?.unitPrice??0,'number','min="0" step="0.01" required')}${field('數量 *','qty',item?.qty||1,'number','min="0.01" step="0.01" required')}</div>
    <label class="check"><input type="checkbox" name="sync" ${item?.sync===false?'':'checked'}>同步入庫（材料庫也更新庫存）</label>
  </div>`;
}
function syncPurchase(l){
  if(!l.sync) return;
  const th=App.readThread(); th.stock=th.stock||{};
  const k=l.materialType+':'+l.materialId;
  const r=th.stock[k]||{qty:0,level:'full',wish:false,scrap:false,note:''};
  r.qty=num(r.qty)+num(l.qty); r.wish=false; th.stock[k]=r;
  App.writeThread(th);
}
function orderForm(o){show(`<h2>修改訂單資料</h2><div class="formgrid">${field('商店','store',o.store)}${field('訂單編號','orderNo',o.orderNo)}</div>${fieldFull('購買日期','date',o.date,'date','required')}<div class="formgrid">${field('整單運費','shipping',o.shipping,'number','min="0" step="0.01"')}${field('整單折扣','discount',o.discount,'number','min="0" step="0.01"')}</div>${field('備註','note',o.note)}`,f=>{Object.assign(o,{date:String(f.get('date')),store:String(f.get('store')),orderNo:String(f.get('orderNo')),shipping:num(f.get('shipping')),discount:num(f.get('discount')),note:String(f.get('note'))})})}
function lineForm(o,l){show(`<h2>修改購買項目</h2>${select('材料類型','materialType',Object.entries(MTYPES).map(([k,v])=>[k,v]),l.materialType)}<div class="matslot">${matSlot(l)}</div><div class="formgrid">${field('單價','unitPrice',l.unitPrice,'number','min="0" step="0.01" required')}${field('數量','qty',l.qty,'number','min="0.01" step="0.01" required')}</div>`,f=>{l.materialType=String(f.get('materialType'));l.materialId=String(f.get('materialId'));l.unitPrice=num(f.get('unitPrice'));l.qty=num(f.get('qty'));if(!l.qty)throw Error('數量需大於 0');if(!l.materialId)throw Error('請選擇材料')});
  form.onchange=e=>{if(e.target.name==='materialType'){form.querySelector('.matslot').innerHTML=matSlot({materialType:e.target.value})}};
}
function newOrder(){show(`<h2>登記整筆購買</h2>${fieldFull('購買日期 *','date',today(),'date','required')}<div class="formgrid">${field('商店','store')}${field('訂單編號','orderNo')}</div><div class="formgrid">${field('整單運費','shipping',0,'number','min="0" step="0.01"')}${field('整單折扣','discount',0,'number','min="0" step="0.01"')}</div><div id="items">${orderItem()}</div><button type="button" class="smallbtn" id="addItem">＋ 再加一項材料</button>${field('備註','note')}`,async f=>{
 const nodes=[...form.querySelectorAll('.itemform')];if(!nodes.length)throw Error('請至少加一項材料');const lines=nodes.map(n=>{const materialType=n.querySelector('[name=materialType]').value,materialId=(n.querySelector('[name=materialId]').value||'').trim(),qty=Number(n.querySelector('[name=qty]').value),unitPrice=Number(n.querySelector('[name=unitPrice]').value);if(!materialId||!Number.isFinite(qty)||qty<=0||!Number.isFinite(unitPrice)||unitPrice<0)throw Error('材料、數量或單價不正確');if(materialType==='dmc'&&!DMC.some(x=>x.c===materialId))throw Error('找不到這個 DMC 色號：'+materialId);return {id:id(),materialType,materialId,qty,unitPrice,sync:n.querySelector('[name=sync]').checked}});
 db.orders.push({id:id(),date:String(f.get('date')),store:String(f.get('store')||''),orderNo:String(f.get('orderNo')||''),shipping:num(f.get('shipping')),discount:num(f.get('discount')),note:String(f.get('note')||''),lines});for(const l of lines)syncPurchase(l);
 tab='orders';
 });form.onclick=e=>{if(e.target.id==='addItem'){form.querySelector('#items').insertAdjacentHTML('beforeend',orderItem());paintPhotos()};if(e.target.matches('[data-remove-item]'))e.target.closest('.itemform').remove();const qa=e.target.closest('[data-quickadd]');if(qa)quickAddMaterial(qa.closest('.itemform').querySelector('.matslot'),qa.dataset.quickadd)};
 form.onchange=e=>{if(e.target.name==='materialType'){const n=e.target.closest('.itemform');n.querySelector('.matslot').innerHTML=matSlot({materialType:e.target.value})}}}
function renderOrders(){
  const list=[...db.orders].sort((a,b)=>b.date.localeCompare(a.date)).filter(o=>!search||[o.store,o.orderNo,...o.lines.map(l=>materialLabel(l))].join(' ').toLowerCase().includes(search.toLowerCase()));
  return `${cardsTitle('採購紀錄','＋ 登記購買','newOrder')}<input class="listsearch" id="search" placeholder="搜尋商店、訂單編號或材料" value="${esc(search)}">
  ${list.map(o=>{let subtotal=o.lines.reduce((s,l)=>s+num(l.qty)*num(l.unitPrice),0);return `<div class="costcard"><h3>${esc(o.store||'未填商店')} · ${esc(o.date)}</h3><p>訂單 ${fmt(o.orderNo)} · 實付 ${money(subtotal+num(o.shipping)-num(o.discount))}<button class="infobtn" data-info="商品小計 ${money(subtotal)}，加運費 ${money(o.shipping)}，扣折扣 ${money(o.discount)}。">i</button></p>${o.lines.map(l=>`<div class="rowline">${pName(l.materialType,l.materialId)} · ${num(l.qty)} × ${money(l.unitPrice)}<button class="smallbtn" style="margin-left:8px" data-act="editLine" data-id="${o.id}" data-ref="${l.id}">修改</button></div>`).join('')}<p>${esc(o.note||'')}</p><div class="actions"><button data-act="editOrder" data-id="${o.id}">修改訂單資料</button></div></div>`}).join('')||'<div class="emptyhint">記下第一次購買，材料庫會跟著同步入庫。</div>'}`;
}

function render(){
  paintCrumb();
  root.innerHTML=`<div class="sectiontabs">${[['pieces','成品紀錄'],['orders','採購紀錄']].map(([t,n])=>`<button data-tab="${t}" class="${t===tab?'active':''}">${n}</button>`).join('')}</div>`+(tab==='pieces'?renderPieces():renderOrders());
  paintPhotos();
  App.initNav(tab==='pieces'?'projects':'materials');
}
function pieceForm(p){p=p||{};show(`<h2>${p.id?'編輯成本作品':'新增成本作品'}</h2>${field('作品名稱 *','name',p.name,'text','required')}${fieldFull('製作日期','madeDate',p.madeDate||today(),'date')}<label>作品照片（至多兩張）<input name="photos" type="file" accept="image/*" multiple></label>${photos(p.photos)}${p.photos?.length?'<label class="check"><input name="clearPhotos" type="checkbox">移除原有照片（可再選新照片）</label>':''}<label>備註<textarea name="note">${esc(p.note||'')}</textarea></label>`,async f=>{const name=String(f.get('name')||'').trim();if(!name)throw Error('請填作品名稱');let pics=f.get('clearPhotos')?[]:[...(p.photos||[])];pics=await App.saveFiles(form.querySelector('[name=photos]').files,pics);Object.assign(p,{id:p.id||id(),name,madeDate:String(f.get('madeDate')||''),photos:pics,note:String(f.get('note')||''),allocations:p.allocations||[],extras:p.extras||[],status:p.status||'待製作'});if(!db.pieces.some(x=>x.id===p.id))db.pieces.push(p);opened=p.id;tab='pieces'})}
function allocationForm(p,a){a=a||{};if(!db.orders.length){toast('請先建立採購紀錄');tab='orders';render();return}
const lines=allLines().sort((x,y)=>y.date.localeCompare(x.date));const pid=a.lineId?line(a.lineId)?.materialId:lines[0]?.materialId;
show(`<h2>${a.id?'修改材料':'加入材料'}</h2>${select('哪一次購買','lineId',lines.map(l=>[l.id,`${materialLabel(l)} · ${l.date} ${l.store||'商店未填'} · ${money(l.unitPrice)}`]),a.lineId||lines[0]?.id)}${field('單一單位使用比例 %','percent',a.percent??100,'number','min="0.01" step="0.01" required')}<p class="muted">一單位的單價 × 比例。可再次加入同材料，不限制各筆百分比總和。</p>`,f=>{const l=line(String(f.get('lineId'))),percent=Number(f.get('percent'));if(!l||!Number.isFinite(percent)||percent<=0)throw Error('請選購買紀錄並填大於 0 的比例');Object.assign(a,{id:a.id||id(),lineId:l.id,percent});if(!p.allocations.some(x=>x.id===a.id))p.allocations.push(a)})}
function extraForm(p,x){x=x||{};show(`<h2>設計／雜項成本</h2>${select('類型','kind',[['設計成本','設計成本'],['雜項成本','雜項成本']],x.kind||'雜項成本')}${field('名稱 *（例：估算人工、客製打版）','name',x.name,'text','required')}${field('估算金額 *','amount',x.amount||0,'number','min="0" step="0.01" required')}`,f=>{const name=String(f.get('name')||'').trim();if(!name)throw Error('請填名稱');Object.assign(x,{id:x.id||id(),kind:String(f.get('kind')),name,amount:num(f.get('amount'))});if(!p.extras.some(z=>z.id===x.id))p.extras.push(x)})}
function statusForm(p){show(`<h2>變更作品進度</h2>${select('訂單狀態','status',['待製作','製作中','待出貨','已寄出','完成','取消'].map(x=>[x,x]),p.status)}`,f=>{p.status=String(f.get('status'))})}
function saleForm(p){const s=p.sale||{};show(`<h2>販售與出貨 · ${esc(p.name)}</h2>${select('訂單狀態','status',['待製作','製作中','待出貨','已寄出','完成','取消'].map(x=>[x,x]),p.status)}${fieldFull('販售日期','date',s.date||today(),'date')}<div class="formgrid">${field('販售平台','platform',s.platform)}${field('購買者（選填）','buyer',s.buyer)}</div><div class="formgrid">${field('售價','price',s.price||0,'number','min="0" step="0.01"')}${field('買家支付的運費','shippingCharged',s.shippingCharged||0,'number','min="0" step="0.01"')}</div><div class="formgrid">${field('實際寄件運費','postage',s.postage||0,'number','min="0" step="0.01"')}${field('包材費','packaging',s.packaging||0,'number','min="0" step="0.01"')}</div><div class="formgrid">${select('平台抽成計算','feeMode',[['fixed','固定金額'],['percent','售價百分比']],s.feeMode||'fixed')}${field('抽成金額或百分比','feeValue',s.feeValue||0,'number','min="0" step="0.01"')}</div><div class="formgrid">${field('寄送方式','shippingMethod',s.shippingMethod)}${field('訂單編號','orderNo',s.orderNo)}</div>${fieldFull('出貨日期','shipDate',s.shipDate,'date')}<label>備註<textarea name="note">${esc(s.note||'')}</textarea></label>`,f=>{p.status=String(f.get('status'));p.sale={date:String(f.get('date')),platform:String(f.get('platform')||''),buyer:String(f.get('buyer')||''),price:num(f.get('price')),shippingCharged:num(f.get('shippingCharged')),postage:num(f.get('postage')),packaging:num(f.get('packaging')),feeMode:String(f.get('feeMode')),feeValue:num(f.get('feeValue')),shippingMethod:String(f.get('shippingMethod')||''),shipDate:String(f.get('shipDate')||''),orderNo:String(f.get('orderNo')||''),note:String(f.get('note')||'')}})}

root.addEventListener('click',async e=>{
  const tglCard=e.target.closest('.piececard[data-act="openPiece"]');
  const t=e.target.closest('[data-act],[data-tab]');if(!t)return;
  if(t.dataset.tab){tab=t.dataset.tab;opened=null;search='';history.replaceState(null,'','#'+tab);render();return}
  const a=t.dataset.act,k=t.dataset.id,p=piece(k),ref=t.dataset.ref;
  if(a==='newOrder')return newOrder();if(a==='editOrder')return orderForm(order(k));if(a==='editLine')return lineForm(order(k),order(k).lines.find(x=>x.id===ref));
  if(a==='changeStatus')return statusForm(p);if(a==='newPiece')return pieceForm();if(a==='openPiece'){opened=k;render();return}if(a==='closePiece'){opened=null;render();return}if(a==='editPiece')return pieceForm(p);
  if(a==='duplicatePiece'){const copy={...structuredClone(p),id:id(),name:p.name+'（新的一件）',madeDate:today(),allocations:p.allocations.map(x=>({...x,id:id()})),extras:p.extras.map(x=>({...x,id:id()})),sale:null,status:'待製作'};db.pieces.push(copy);opened=copy.id;persist();toast('已複製，可調整這件的成本');return}
  if(a==='deletePiece'){if(confirm('刪除這件作品及其成本與販售紀錄？')){db.pieces=db.pieces.filter(x=>x.id!==k);opened=null;persist()}return}
  if(a==='addAllocation')return allocationForm(p);if(a==='editAllocation')return allocationForm(p,p.allocations.find(x=>x.id===ref));if(a==='removeAllocation'){p.allocations=p.allocations.filter(x=>x.id!==ref);persist();return}
  if(a==='addExtra')return extraForm(p);if(a==='editExtra')return extraForm(p,p.extras.find(x=>x.id===ref));if(a==='removeExtra'){p.extras=p.extras.filter(x=>x.id!==ref);persist();return}if(a==='saleForm')return saleForm(p);
});
root.addEventListener('input',e=>{if(e.target.id==='search'){search=e.target.value;const caret=e.target.selectionStart;render();const x=document.getElementById('search');x?.focus();x?.setSelectionRange(caret,caret)}});
render();
})();
