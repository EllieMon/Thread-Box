(() => {
  const hour = new Date().getHours();
  const greet = hour < 5 ? '晚安' : hour < 11 ? '早安' : hour < 18 ? '午安' : '晚安';

  const thread = App.readThread();
  const stockColors = Object.values(thread.stock || {}).filter(v => v.skeins > 0).length;

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
        <img src="assets/embroidery-project.webp" alt="">
        <b>我的作品</b><small>${piecesActive} 件進行中</small>
      </a>
      <a class="home-card" href="index.html">
        <img src="assets/thread-library.webp" alt="">
        <b>線材庫</b><small>${stockColors} 種現有線材</small>
      </a>
    </div>

    <div class="qa-row">
      <a class="qa" href="calendar.html"><img src="assets/stitch-calendar.webp" alt=""><span>日常記錄</span></a>
      <a class="qa" href="index.html#wish"><img src="assets/material-list.webp" alt=""><span>待買清單</span></a>
      <a class="qa" href="cost.html#products"><img src="assets/botanical-tag.webp" alt=""><span>常買商品</span></a>
    </div>

    <div class="home-note">
      <img src="assets/flower-inspiration.webp" alt="">
      <p>一針一線，都是給自己的溫柔紀錄。</p>
    </div>
  `;
})();
