(() => {
const {esc,money,num,id,today}=App;
let db=App.readCost(), tab=(['palette','pieces'].includes((location.hash||'').slice(1))?(location.hash||'').slice(1):'pieces'), opened=null, search='';
let thDb = App.readThread();
const saveTh = () => App.writeThread(thDb);
const root=document.getElementById('app'), dialog=document.getElementById('editor'), form=document.getElementById('entryForm');
const piece=x=>db.pieces.find(p=>p.id===x);
const allLines=()=>db.orders.flatMap(o=>o.lines.map(l=>({...l,date:o.date,store:o.store,orderId:o.id})));
const line=x=>allLines().find(l=>l.id===x);
const fmt=x=>x?esc(x):'—';
function materialLabel(mtype,mid){ const x=findColor(mtype,mid); return mtype==='dmc' ? `${x.c} ${x.n||''}` : (x.code?`${x.code} · ${x.name||''}`:x.name); }
function toast(t){const el=document.getElementById('notice');el.textContent=t;el.classList.add('on');setTimeout(()=>el.classList.remove('on'),2800)}
function persist(){try{App.writeCost(db);render()}catch(e){toast('儲存失敗，請先下載備份並釋出手機空間')}}
function show(html,callback){form.onclick=null;form.onchange=null;form.innerHTML=html+'<div class="foot"><button type="button" id="cancelDialog">取消</button><button class="primary" type="submit">儲存</button></div>';form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;try{await callback(new FormData(form));dialog.close();persist()}catch(err){toast(err.message||'儲存失敗');btn.disabled=false}};dialog.showModal();App.fitDialogs();App.killAutoFocus(dialog)}
form.addEventListener('click',e=>{if(e.target.id==='cancelDialog')dialog.close()});
const field=(label,name,val='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(val)}" ${extra}></label>`;
const fieldFull=(label,name,val='',type='text',extra='')=>`<div class="full">${field(label,name,val,type,extra)}</div>`;
const select=(label,name,options,value)=>`<label>${label}<select name="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const photos=(ids=[])=>`<div class="cover">${ids.map(x=>`<img data-photo="${esc(x)}" alt="實物照片">`).join('')}</div>`;
async function paintPhotos(){for(const el of document.querySelectorAll('[data-photo]')){try{const src=await App.getPhoto(el.dataset.photo);if(el.isConnected && src)el.src=src}catch(_){}}}
function cardsTitle(title,button,act){return `<div class="pagehead"><h2>${title}</h2>${button?`<button class="primary" data-act="${act}">${button}</button>`:''}</div>`}
function pName(mtype,mid){return esc(materialLabel(mtype,mid))}
const WARN_STATUS=['取消','待出貨'];
const statusPillCls=st=>WARN_STATUS.includes(st||'待製作')?'pill warn':'pill';
function totals(p){const material=(p.allocations||[]).reduce((s,a)=>s+(line(a.lineId)?.unitPrice||0)*num(a.percent)/100,0);const extras=(p.extras||[]).reduce((s,x)=>s+num(x.amount),0);return {material,extras,total:material+extras}}
function saleProfit(p){const s=p.sale;if(!s)return null;const c=totals(p).total;const fee=s.feeMode==='percent'?num(s.price)*num(s.feeValue)/100:num(s.feeValue);return num(s.price)+num(s.shippingCharged)-c-num(s.postage)-num(s.packaging)-fee}

/* ---------- 配色相關資料（存在材料庫 thDb 裡） ---------- */
const FAMS=[['白/米','#F3EDE2'],['黃','#E8C55B'],['橘','#D98A4E'],['紅','#BC3A47'],['粉','#DDA0AC'],['紫','#8F7BA8'],['藍','#5D7BA8'],['綠','#79996B'],['褐','#98785C'],['黑/灰','#635D59']];
function idOf(t,x){return t==='dmc'?x.c:x.id}
function codeLabel(t,x){return t==='dmc'?x.c:(x.code||x.name)}
function findColor(t,c){ if(t==='dmc') return DMC.find(x=>x.c===c)||{c,n:'',h:'#cccccc',f:'自訂'}; const x=(thDb.custom||[]).find(i=>i.id===c); return x||{c,n:'',h:'#cccccc',f:'自訂',name:'（已刪除）'}; }
function lumOf(x){ if(typeof x.l==='number')return x.l; const hx=(x.h||'#bfbfbf').replace('#',''); const r=parseInt(hx.slice(0,2),16),g=parseInt(hx.slice(2,4),16),b=parseInt(hx.slice(4,6),16); return (0.2126*r+0.7152*g+0.0722*b)/255; }
function recTh(t,c){ return thDb.stock?.[t+':'+c] || null; }
function setRecTh(t,c,patch){ thDb.stock=thDb.stock||{}; const k=t+':'+c; const cur=thDb.stock[k]||{qty:0,level:'full',wish:false,scrap:false,note:''}; thDb.stock[k]={...cur,...patch}; saveTh(); }
const proj=pid=>(thDb.projects||[]).find(p=>p.id===pid);
function projStat(p){ let miss=0,todo=0; p.colors.forEach(it=>{const r=recTh(it.t,it.c); if(r&&r.qty>0)return; miss++; if(!(r&&r.wish))todo++;}); return {miss,todo}; }
let projOpen=null, projPick=false, pickType='dmc', pickFamilySel=new Set(), pickQ='';

function pickBody(){
  const p=proj(projOpen); if(!p)return '';
  const src=(pickType==='thread'?(thDb.custom||[]).filter(x=>x.type==='thread'):DMC).filter(x=>{
    if(pickFamilySel.size && !pickFamilySel.has(x.f)) return false;
    if(pickQ){ const s=pickQ.toLowerCase().trim(); const c=idOf(pickType,x); if(!(String(c).toLowerCase().includes(s)||(x.n||x.name||'').toLowerCase().includes(s)||(x.b||x.brand||'').toLowerCase().includes(s))) return false; }
    return true;
  });
  const chosen=new Set(p.colors.map(it=>it.t+':'+it.c));
  return `<div class="count"><span>已選 ${p.colors.length} 色 · 這裡有 ${src.length} 色</span></div>`
    + (src.length ? `<div class="pickgrid">${src.map(x=>{ const c=idOf(pickType,x); const on=chosen.has(pickType+':'+c); return `<button class="pick${on?' on':''}" data-pick="${esc(c)}" style="background:${esc(x.h)};color:${lumOf(x)<0.58?'#fff':'#2C2825'}">${esc(codeLabel(pickType,x))}</button>`; }).join('')}</div>` : `<div class="empty"><b>這個條件下沒有色號</b>換個色系試試。</div>`);
}
function renderPalette(){
  if(!projOpen){
    let h=`<div class="panel"><h2>配色紀錄</h2><p>把想用的線挑進同一個作品，放在一起看整組配色順不順眼。缺哪幾色也會一併幫你標出來。</p>`;
    if(!(thDb.projects||[]).length){ h+=`<div class="empty"><b>還沒有配色紀錄</b>先開一個，名字隨意，之後都能改。</div>`; }
    else { h += thDb.projects.map(p=>{ const sw=p.colors.slice(0,4).map(it=>`<span style="background:${esc(findColor(it.t,it.c).h)}"></span>`).join(''); const st=projStat(p); return `<button class="projcard" data-proj="${esc(p.id)}"><span class="mini${sw?'':' none'}">${sw}</span><span class="txt"><b>${esc(p.name)}</b><small>${p.colors.length} 色${st.miss?` · 缺 ${st.miss} 色`:p.colors.length?' · 都有貨':''}</small></span><span class="go">›</span></button>`; }).join(''); }
    h+=`<button class="btn" id="newProj" style="margin-top:14px">＋ 新增配色紀錄</button></div>`;
    return h;
  }
  const p=proj(projOpen); if(!p){projOpen=null;return renderPalette();}
  if(projPick){
    return `<div class="crumb stick"><h2>挑顏色 · ${esc(p.name)}</h2><button class="done" id="donePick">完成${p.colors.length?`（${p.colors.length} 色）`:''}</button></div>
    <div class="kinds" style="margin-top:0">${[['dmc','DMC'],['thread','自訂線']].map(k=>`<button data-pk="${k[0]}" aria-selected="${pickType===k[0]}">${k[1]}</button>`).join('')}</div>
    <div class="searchrow"><div class="search"><input id="pq" type="search" placeholder="找色號" value="${esc(pickQ)}"></div></div>
    <div style="margin:9px 0 3px"><div class="popanchor"><button class="filterbtn" id="openPickFilter">色系${pickFamilySel.size?` · <b>${pickFamilySel.size}</b>`:''}</button>
      <div class="popcard${pickFilterOpen?' on':''}" id="pickFilterPop"><h4>色系（可複選）</h4><div class="optrow">${FAMS.map(f=>`<label class="opt" data-checked="${pickFamilySel.has(f[0])}"><input type="checkbox" data-pfam="${esc(f[0])}" ${pickFamilySel.has(f[0])?'checked':''}><span class="dot" style="background:${f[1]}"></span>${f[0]}</label>`).join('')}</div><div class="closebar" id="closePickFilter">完成</div></div></div></div>
    <div id="pickBody">${pickBody()}</div>`;
  }
  const st=projStat(p);
  let h=`<div class="crumb"><button data-proj="">‹ 配色紀錄</button><h2>${esc(p.name)}</h2><span class="viewtog"><button data-pl="bar" aria-selected="${thDb.projLayout==='bar'}">色條</button><button data-pl="grid" aria-selected="${thDb.projLayout==='grid'}">色塊</button></span></div>
  <div class="ptools"><button class="main" id="pickColors">＋ 挑顏色</button>${st.todo?`<button class="wish" id="wishMissing">缺 ${st.todo} 色 · 加進待買</button>`:st.miss?`<button class="wish" disabled>缺 ${st.miss} 色 · 已在待買</button>`:''}<button id="renameProj">改名</button><button class="danger" id="delProj">刪除此配色紀錄</button></div>`;
  if(!p.colors.length){ h+=`<div class="empty"><b>還沒挑任何顏色</b>按下面的按鈕，依色系一次看完一整排。</div>`; }
  else {
    h+=`<p class="tipline">長壓色票可以拖曳排序；點一下則是從配色紀錄移除。</p>`;
    const cells=p.colors.map(it=>{ const x=findColor(it.t,it.c); const r=recTh(it.t,it.c); const dark=lumOf(x)<0.58; const tag=(r&&r.qty>0)?'':'<span class="miss">缺</span>'; return {x,dark,tag,it}; });
    h += thDb.projLayout==='bar'
      ? cells.map((o,i)=>`<button class="pbar" data-idx="${i}" data-drop="${esc(o.it.t)}|${esc(o.it.c)}" style="background:${esc(o.x.h)};color:${o.dark?'#fff':'#2C2825'}"><b>${esc(codeLabel(o.it.t,o.x))}</b>${o.tag}</button>`).join('')
      : `<div class="pgrid">${cells.map((o,i)=>`<button class="pcell" data-idx="${i}" data-drop="${esc(o.it.t)}|${esc(o.it.c)}" style="background:${esc(o.x.h)};color:${o.dark?'#fff':'#2C2825'}">${o.tag}<b>${esc(codeLabel(o.it.t,o.x))}</b></button>`).join('')}</div>`;
  }
  return h;
}
let pickFilterOpen=false;

/* ---------- 麵包屑 ---------- */
function paintCrumb(){
  document.querySelector('.crumbnav')?.remove();
  const items = tab==='palette' ? [{label:'作品',href:'cost.html#pieces'},{label:'配色'}] : [{label:'作品',href:'cost.html#pieces'},{label:'成品紀錄'}];
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
    <div class="piececard open" style="align-items:center">
    <button class="cardel" data-act="deletePiece" data-id="${p.id}">刪除</button>
    ${photos(p.photos)}<div class="info"><h3>${esc(p.name)}</h3><p>${fmt(p.madeDate)} <span class="${statusPillCls(p.status)}">${esc(p.status||'待製作')}</span><button class="editstatusbtn" data-act="changeStatus" data-id="${p.id}" aria-label="變更進度" title="變更進度">✎</button></p><p>${esc(p.note||'')}</p>
    <div class="actions" style="display:flex"><button data-act="editPiece" data-id="${p.id}">編輯</button><button data-act="duplicatePiece" data-id="${p.id}">複製</button></div></div></div>
    <div class="costcard"><div class="pagehead"><h3>材料分攤 · ${money(c.material)}</h3><button class="smallbtn" data-act="addAllocation" data-id="${p.id}">＋ 材料</button></div>${(p.allocations||[]).map(a=>{const l=line(a.lineId);return `<div class="rowline"><button class="cardel" data-act="removeAllocation" data-id="${p.id}" data-ref="${a.id}">移除</button><b>${l?pName(l.materialType,l.materialId):'（已刪除）'}</b> · ${esc(a.percent)}% = ${money(num(l?.unitPrice)*num(a.percent)/100)}<p>購入單價 ${money(l?.unitPrice)} · ${esc(l?.date||'舊購買紀錄')} ${esc(l?.store||'')}</p><div class="actions" style="display:flex"><button data-act="editAllocation" data-id="${p.id}" data-ref="${a.id}">修改</button></div></div>`}).join('')||'<p class="muted">尚未加入材料</p>'}</div>
    <div class="costcard"><div class="pagehead"><h3>設計與雜項 · ${money(c.extras)}</h3><button class="smallbtn" data-act="addExtra" data-id="${p.id}">＋ 成本</button></div>${(p.extras||[]).map(x=>`<div class="rowline"><button class="cardel" data-act="removeExtra" data-id="${p.id}" data-ref="${x.id}">移除</button><b>${esc(x.name)}</b> · ${money(x.amount)} <span class="pill">${esc(x.kind)}</span><div class="actions" style="display:flex"><button data-act="editExtra" data-id="${p.id}" data-ref="${x.id}">修改</button></div></div>`).join('')||'<p class="muted">可在雜項自行估算人工費</p>'}<p><b>作品總成本 ${money(c.total)}</b></p></div>
    <div class="costcard"><div class="pagehead"><h3>販售與出貨</h3><button class="smallbtn" data-act="saleForm" data-id="${p.id}">${p.sale?'修改販售':'＋ 登記販售'}</button></div>${p.sale?`${['販售日期 '+fmt(p.sale.date),'平台 '+fmt(p.sale.platform),'售價 '+money(p.sale.price),'購買者 '+fmt(p.sale.buyer),'寄送 '+fmt(p.sale.shippingMethod),'買家付運費 '+money(p.sale.shippingCharged),'實際寄件運費 '+money(p.sale.postage),'包材費 '+money(p.sale.packaging),'平台抽成 '+(p.sale.feeMode==='percent'?esc(p.sale.feeValue)+'%':'固定 '+money(p.sale.feeValue)),'出貨日期 '+fmt(p.sale.shipDate),'訂單編號 '+fmt(p.sale.orderNo),'備註 '+fmt(p.sale.note)].map(t=>`<p>${t}</p>`).join('')}<p><b>估算利潤 ${money(profit)}</b></p>`:'<p class="muted">尚未登記販售</p>'}</div>`;
  }
  let arr=[...db.pieces].reverse().filter(p=>!search||p.name.includes(search));
  return `${renderStats()}${cardsTitle('成本作品','＋ 新增作品','newPiece')}<input class="listsearch" id="search" placeholder="搜尋作品名稱" value="${esc(search)}">
  ${arr.map(p=>`<button class="piececard" data-act="openPiece" data-id="${p.id}" style="cursor:pointer">
    <img class="thumb" data-photo="${esc((p.photos||[])[0]||'')}" alt="">
    <div class="info"><h3>${esc(p.name)}</h3><p>${esc(p.madeDate||'未填日期')} <span class="${statusPillCls(p.status)}">${esc(p.status||'待製作')}</span></p><p>成本 ${money(totals(p).total)}</p></div>
  </button>`).join('')||'<div class="emptyhint">先建立第一件客製作品，再記材料與販售。</div>'}`;
}

function render(){
  history.replaceState(null,'','#'+tab);
  paintCrumb();
  root.innerHTML=`<div class="sectiontabs">${[['palette','配色'],['pieces','成品紀錄']].map(([t,n])=>`<button data-tab="${t}" class="${t===tab?'active':''}">${n}</button>`).join('')}</div>`+(tab==='pieces'?renderPieces():renderPalette());
  paintPhotos();
  App.initNav('projects');
}
function pieceForm(p){p=p||{};show(`<h2>${p.id?'編輯成本作品':'新增成本作品'}</h2>${field('作品名稱 *','name',p.name,'text','required')}${App.dateField('製作日期','madeDate',p.madeDate||today())}<label>作品照片（至多兩張）<input name="photos" type="file" accept="image/*" multiple></label>${photos(p.photos)}${p.photos?.length?'<label class="check"><input name="clearPhotos" type="checkbox">移除原有照片（可再選新照片）</label>':''}<label>備註<textarea name="note">${esc(p.note||'')}</textarea></label>`,async f=>{const name=String(f.get('name')||'').trim();if(!name)throw Error('請填作品名稱');if(db.pieces.some(x=>x.name===name&&x.id!==p.id)&&!confirm(`已經有一個同名的「${name}」了，要繼續嗎？`))throw Error('請修改名稱');let pics=f.get('clearPhotos')?[]:[...(p.photos||[])];pics=await App.saveFiles(form.querySelector('[name=photos]').files,pics);Object.assign(p,{id:p.id||id(),name,madeDate:String(f.get('madeDate')||''),photos:pics,note:String(f.get('note')||''),allocations:p.allocations||[],extras:p.extras||[],status:p.status||'待製作'});if(!db.pieces.some(x=>x.id===p.id))db.pieces.push(p);opened=p.id;tab='pieces'})}
function allocationForm(p,a){a=a||{};if(!db.orders.length){toast('請先到材料庫登記採購紀錄');return}
const lines=allLines().sort((x,y)=>y.date.localeCompare(x.date));const pid=a.lineId?line(a.lineId)?.materialId:lines[0]?.materialId;
show(`<h2>${a.id?'修改材料':'加入材料'}</h2>${select('哪一次購買','lineId',lines.map(l=>[l.id,`${materialLabel(l.materialType,l.materialId)} · ${l.date} ${l.store||'商店未填'} · ${money(l.unitPrice)}`]),a.lineId||lines[0]?.id)}${field('單一單位使用比例 %','percent',a.percent??100,'number','min="0.01" step="0.01" required')}<p class="muted">一單位的單價 × 比例。可再次加入同材料，不限制各筆百分比總和。</p>`,f=>{const l=line(String(f.get('lineId'))),percent=Number(f.get('percent'));if(!l||!Number.isFinite(percent)||percent<=0)throw Error('請選購買紀錄並填大於 0 的比例');Object.assign(a,{id:a.id||id(),lineId:l.id,percent});if(!p.allocations.some(x=>x.id===a.id))p.allocations.push(a)})}
function extraForm(p,x){x=x||{};show(`<h2>設計／雜項成本</h2>${select('類型','kind',[['設計成本','設計成本'],['雜項成本','雜項成本']],x.kind||'雜項成本')}${field('名稱 *（例：估算人工、客製打版）','name',x.name,'text','required')}${field('估算金額 *','amount',x.amount||0,'number','min="0" step="0.01" required')}`,f=>{const name=String(f.get('name')||'').trim();if(!name)throw Error('請填名稱');Object.assign(x,{id:x.id||id(),kind:String(f.get('kind')),name,amount:num(f.get('amount'))});if(!p.extras.some(z=>z.id===x.id))p.extras.push(x)})}
function statusForm(p){show(`<h2>變更作品進度</h2>${select('訂單狀態','status',['待製作','製作中','待出貨','已寄出','完成','取消'].map(x=>[x,x]),p.status)}`,f=>{p.status=String(f.get('status'))})}
function saleForm(p){const s=p.sale||{};show(`<h2>販售與出貨 · ${esc(p.name)}</h2>${select('訂單狀態','status',['待製作','製作中','待出貨','已寄出','完成','取消'].map(x=>[x,x]),p.status)}${App.dateField('販售日期','date',s.date||today())}<div class="formgrid">${field('販售平台','platform',s.platform)}${field('購買者（選填）','buyer',s.buyer)}</div><div class="formgrid">${field('售價','price',s.price||0,'number','min="0" step="0.01"')}${field('買家支付的運費','shippingCharged',s.shippingCharged||0,'number','min="0" step="0.01"')}</div><div class="formgrid">${field('實際寄件運費','postage',s.postage||0,'number','min="0" step="0.01"')}${field('包材費','packaging',s.packaging||0,'number','min="0" step="0.01"')}</div><div class="formgrid">${select('平台抽成計算','feeMode',[['fixed','固定金額'],['percent','售價百分比']],s.feeMode||'fixed')}${field('抽成金額或百分比','feeValue',s.feeValue||0,'number','min="0" step="0.01"')}</div><div class="formgrid">${field('寄送方式','shippingMethod',s.shippingMethod)}${field('訂單編號','orderNo',s.orderNo)}</div>${App.dateField('出貨日期','shipDate',s.shipDate)}<label>備註<textarea name="note">${esc(s.note||'')}</textarea></label>`,f=>{p.status=String(f.get('status'));p.sale={date:String(f.get('date')),platform:String(f.get('platform')||''),buyer:String(f.get('buyer')||''),price:num(f.get('price')),shippingCharged:num(f.get('shippingCharged')),postage:num(f.get('postage')),packaging:num(f.get('packaging')),feeMode:String(f.get('feeMode')),feeValue:num(f.get('feeValue')),shippingMethod:String(f.get('shippingMethod')||''),shipDate:String(f.get('shipDate')||''),orderNo:String(f.get('orderNo')||''),note:String(f.get('note')||'')}})}

root.addEventListener('click',async e=>{
  const t=e.target.closest('[data-act],[data-tab],[data-proj],[data-pl],[data-pk],[data-pfam],[data-pick],[data-drop],#newProj,#pickColors,#donePick,#renameProj,#delProj,#wishMissing,#openPickFilter,#closePickFilter');
  if(!t)return;
  if(t.dataset.tab){tab=t.dataset.tab;opened=null;search='';projOpen=null;render();return}
  const pc=t.matches?.('[data-proj]')?t:t.closest?.('[data-proj]');
  if(pc){projOpen=pc.dataset.proj||null;projPick=false;render();return}
  if(t.matches?.('[data-pl]')){thDb.projLayout=t.dataset.pl;saveTh();render();return}
  if(t.matches?.('[data-pk]')){pickType=t.dataset.pk;pickFamilySel=new Set();render();return}
  if(t.id==='openPickFilter'){pickFilterOpen=!pickFilterOpen;render();return}
  if(t.id==='closePickFilter'){pickFilterOpen=false;render();return}
  if(t.matches?.('[data-pfam]')){const k=t.dataset.pfam;pickFamilySel.has(k)?pickFamilySel.delete(k):pickFamilySel.add(k);render();return}
  if(t.id==='newProj'){show(`<h2>新增配色紀錄</h2>${field('名稱 *','name','','text','required placeholder="例如：聖誕小屋、媽媽的桌巾"')}`,f=>{const name=(f.get('name')||'').trim();if(!name)throw Error('請填名稱');if((thDb.projects||[]).some(x=>x.name===name)&&!confirm(`已經有一個同名的「${name}」了，要繼續嗎？`))throw Error('請修改名稱');const pid='p'+Date.now().toString(36);thDb.projects.push({id:pid,name,colors:[]});saveTh();projOpen=pid;projPick=true});return}
  if(t.id==='pickColors'){projPick=true;pickQ='';render();return}
  if(t.id==='donePick'){projPick=false;render();return}
  if(t.matches?.('[data-pick]')&&projOpen){const p=proj(projOpen),c=t.dataset.pick;const i=p.colors.findIndex(o=>o.t===pickType&&o.c===c);if(i>=0)p.colors.splice(i,1);else p.colors.push({t:pickType,c});saveTh();render();return}
  if(t.matches?.('[data-drop]')&&projOpen){const [tt,c]=t.dataset.drop.split('|');if(!confirm(`${c} 會從這份配色紀錄中拿掉，庫存紀錄不受影響，確定移除？`))return;const p=proj(projOpen);p.colors=p.colors.filter(o=>!(o.t===tt&&o.c===c));saveTh();render();return}
  if(t.id==='renameProj'&&projOpen){const p=proj(projOpen);show(`<h2>改名字</h2>${field('名稱 *','name',p.name,'text','required')}`,f=>{const name=(f.get('name')||'').trim();if(!name)throw Error('請填名稱');if((thDb.projects||[]).some(x=>x.name===name&&x.id!==p.id)&&!confirm(`已經有一個同名的「${name}」了，要繼續嗎？`))throw Error('請修改名稱');p.name=name;saveTh()});return}
  if(t.id==='delProj'&&projOpen){const p=proj(projOpen);if(!confirm(`刪掉「${p.name}」這份配色紀錄？庫存和待買清單不受影響。`))return;thDb.projects=thDb.projects.filter(o=>o.id!==projOpen);saveTh();projOpen=null;render();return}
  if(t.id==='wishMissing'&&projOpen){const p=proj(projOpen);let n=0;p.colors.forEach(it=>{const r=recTh(it.t,it.c);if(r&&r.qty>0)return;setRecTh(it.t,it.c,{wish:true});n++});toast('已加入 '+n+' 項到待買清單');render();return}

  const a=t.dataset.act,k=t.dataset.id,p=piece(k),ref=t.dataset.ref;
  if(a==='changeStatus')return statusForm(p);if(a==='newPiece')return pieceForm();if(a==='openPiece'){opened=k;render();return}if(a==='closePiece'){opened=null;render();return}if(a==='editPiece')return pieceForm(p);
  if(a==='duplicatePiece'){const copy={...structuredClone(p),id:id(),name:p.name+'（新的一件）',madeDate:today(),allocations:p.allocations.map(x=>({...x,id:id()})),extras:p.extras.map(x=>({...x,id:id()})),sale:null,status:'待製作'};db.pieces.push(copy);opened=copy.id;persist();toast('已複製，可調整這件的成本');return}
  if(a==='deletePiece'){if(confirm('刪除這件作品及其成本與販售紀錄？')){db.pieces=db.pieces.filter(x=>x.id!==k);opened=null;persist()}return}
  if(a==='addAllocation')return allocationForm(p);if(a==='editAllocation')return allocationForm(p,p.allocations.find(x=>x.id===ref));if(a==='removeAllocation'){p.allocations=p.allocations.filter(x=>x.id!==ref);persist();return}
  if(a==='addExtra')return extraForm(p);if(a==='editExtra')return extraForm(p,p.extras.find(x=>x.id===ref));if(a==='removeExtra'){p.extras=p.extras.filter(x=>x.id!==ref);persist();return}if(a==='saleForm')return saleForm(p);
});
root.addEventListener('input',e=>{
  if(e.target.id==='search'){search=e.target.value;const caret=e.target.selectionStart;render();const x=document.getElementById('search');x?.focus();x?.setSelectionRange(caret,caret)}
  if(e.target.id==='pq'){pickQ=e.target.value;const el=document.getElementById('pickBody');if(el)el.innerHTML=pickBody();else render()}
});

/* ---------- 長壓拖曳排序（配色） ---------- */
let dragS=null,lastDragEnd=0;
function pointOf(e){return e.touches&&e.touches[0]?e.touches[0]:e}
function dragStart(e){ if(!projOpen||projPick||tab!=='palette')return; const sw=e.target.closest&&e.target.closest('[data-idx]'); if(!sw)return; const pt=pointOf(e); dragS={el:sw,x:pt.clientX,y:pt.clientY,on:false,timer:null}; dragS.timer=setTimeout(()=>{ if(!dragS)return; dragS.on=true; document.body.classList.add('dragmode'); dragS.el.classList.add('dragging'); if(navigator.vibrate)navigator.vibrate(12); },420); }
function syncOrder(container){ const nodes=Array.prototype.slice.call(container.querySelectorAll('[data-drop]')); const p=proj(projOpen); if(!p)return; p.colors=nodes.map(n=>{const parts=n.dataset.drop.split('|');return {t:parts[0],c:parts[1]};}); nodes.forEach((n,i)=>n.setAttribute('data-idx',String(i))); }
function dragMove(e){ if(!dragS)return; const pt=pointOf(e); if(!dragS.on){ if(Math.hypot(pt.clientX-dragS.x,pt.clientY-dragS.y)>10){clearTimeout(dragS.timer);dragS=null;} return; } e.preventDefault(); const under=document.elementFromPoint(pt.clientX,pt.clientY); const tgt=under&&under.closest&&under.closest('[data-idx]'); if(!tgt||tgt===dragS.el)return; const container=dragS.el.parentElement; if(!container||tgt.parentElement!==container)return; const before=tgt.compareDocumentPosition(dragS.el)&Node.DOCUMENT_POSITION_FOLLOWING; container.insertBefore(dragS.el,before?tgt:tgt.nextSibling); syncOrder(container); }
function dragEnd(){ if(!dragS)return; clearTimeout(dragS.timer); const moved=dragS.on; if(moved){ dragS.el.classList.remove('dragging'); document.body.classList.remove('dragmode'); lastDragEnd=Date.now(); saveTh(); toast('順序已更新'); } dragS=null; if(moved)render(); }
document.addEventListener('touchstart',dragStart,{passive:true});
document.addEventListener('touchmove',dragMove,{passive:false});
document.addEventListener('touchend',dragEnd);
document.addEventListener('touchcancel',dragEnd);
document.addEventListener('mousedown',dragStart);
document.addEventListener('mousemove',dragMove);
document.addEventListener('mouseup',dragEnd);

render();
window.addEventListener('hashchange', () => {
  const h = (location.hash || '').slice(1);
  if (['palette', 'pieces'].includes(h) && h !== tab) { tab = h; opened = null; render(); }
});
})();
