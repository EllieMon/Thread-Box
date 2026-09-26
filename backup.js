(() => {
const root = document.getElementById('app');
function toast(t){const el=document.getElementById('toast');el.textContent=t;el.classList.add('on');setTimeout(()=>el.classList.remove('on'),2800)}
function paintCrumb(){
  document.querySelector('.crumbnav')?.remove();
  document.querySelector('header .wrap').insertAdjacentHTML('beforeend', App.breadcrumb([{label:'備份'}]));
}
function render(){
  paintCrumb();
  const th = App.readThread(), cost = App.readCost();
  const stockVals = Object.values(th.stock || {});
  const haveThread = stockVals.filter(v => v.qty > 0).length;
  const wishN = stockVals.filter(v => v.wish).length;
  const materialTypes = (th.custom || []).length;
  const orders = cost.orders?.length || 0;
  const pieces = cost.pieces?.length || 0;
  const days = App.backupOverdueDays();
  const overdue = App.isBackupOverdue();
  const backupInfoHtml = overdue
    ? `<p class="pill warn" style="display:inline-block;margin-top:6px">${days===Infinity?'尚未備份過':'上次備份於 '+days+' 天前'} · 建議盡快備份</p>`
    : `<p class="muted">上次備份於 ${days} 天前</p>`;
  root.innerHTML = `
  <div class="dashboard">
    <div class="stat"><b>${haveThread} 項</b><small>目前有庫存的材料</small></div>
    <div class="stat"><b>${wishN} 項</b><small>在預購清單裡</small></div>
    <div class="stat"><b>${materialTypes} 筆</b><small>自訂線／布／物品</small></div>
    <div class="stat"><b>${pieces} 件</b><small>成本作品</small></div>
  </div>
  <div class="costcard">
    <div class="pagehead"><h3>資料備份<button class="infobtn" data-info="一次打包材料庫（線材/布/物品/配色）、成本（採購/作品/日曆工時）與照片，跟妳目前用的是同一份，換手機或清過資料後可從備份檔還原。">i</button></h3></div>
    ${backupInfoHtml}
    <button class="btn" id="doExport">下載完整備份</button>
    <input type="file" id="restoreFile" accept=".json,application/json" style="margin:12px 0;width:100%">
    <button class="btn ghost" id="doImport">從選好的檔案還原</button>
  </div>
  <div class="costcard">
    <div class="pagehead"><h3>全部清除</h3></div>
    <p class="muted">會刪掉材料庫、成本作品、採購與日曆工時，且無法復原。請先下載備份。</p>
    <button class="btn warn" id="doReset">清除全部本機資料</button>
  </div>`;
  App.initNav('backup');
}
root.addEventListener('click', async e => {
  if (e.target.id === 'doExport') {
    try { const txt = await App.backup(); App.download('Stitchly完整備份-'+App.today()+'.json', txt); App.setLastBackup(); toast('已下載完整備份'); render(); }
    catch (_) { toast('備份失敗，請再試一次'); }
  }
  if (e.target.id === 'doImport') {
    const f = document.getElementById('restoreFile').files[0];
    if (!f) return toast('請先選擇備份檔');
    if (!confirm('還原會取代目前所有材料庫、成本與日曆資料，確定嗎？')) return;
    try { await App.restore(await f.text()); toast('還原完成'); render(); }
    catch (err) { toast('還原失敗：'+(err.message||'請確認備份檔')); }
  }
  if (e.target.id === 'doReset') {
    if (!confirm('清除全部本機資料？此動作無法復原。')) return;
    App.writeThread({stock:{},custom:[],projects:[],projLayout:'bar',v:2});
    App.writeCost({orders:[],pieces:[],sessions:[],plans:[],v:2});
    toast('已全部清除'); render();
  }
});
render();
})();
