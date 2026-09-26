(() => {
  const hour = new Date().getHours();
  const greet = hour < 5 ? '晚安' : hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安';

  const th = App.readThread();
  const stockCount = Object.values(th.stock || {}).filter(v => v.qty > 0).length;

  let piecesActive = 0;
  try {
    const cost = App.readCost();
    piecesActive = (cost.pieces || []).filter(p => !['完成', '取消'].includes(p.status)).length;
  } catch (_) { /* 還沒有任何成本資料時，維持 0 */ }

  document.getElementById('app').innerHTML = `
    <div class="home-greet">
      <div class="greet-text"><b>${greet}，艾莉！</b><span>今天也來繡一點美好的日常吧 🌿</span></div>
    </div>

    <div class="home-cards">
      <a class="home-card" href="cost.html#pieces">
        <img src="assets/projects.webp" alt="">
        <b>我的作品</b><small>${piecesActive} 件進行中</small>
      </a>
      <a class="home-card" href="shelf.html">
        <img src="assets/materials.webp" alt="">
        <b>材料庫</b><small>${stockCount} 項現有材料</small>
      </a>
    </div>

    <div class="qa-row">
      <a class="qa" href="calendar.html"><img src="assets/calendar.webp" alt=""><span>日常記錄</span></a>
      <a class="qa" href="shelf.html#wish"><img src="assets/preorders.webp" alt=""><span>預購物品</span></a>
      <a class="qa" href="cost.html#orders"><img src="assets/purchases.webp" alt=""><span>採購紀錄</span></a>
    </div>

    <div class="home-note">
      <img src="assets/palette.webp" alt="">
      <p>一針一線，都是給自己的溫柔紀錄。</p>
    </div>
  `;
  App.initNav(null);
})();
