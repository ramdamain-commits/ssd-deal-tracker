// GAS Web App の URL（デプロイ後にここを更新する）
const API_URL = 'https://script.google.com/macros/s/AKfycbx4wSK_sYIP8Ksu-nWibGAbJxKFBPWN02o3K7Ame21q0QdFCYbxqByWD087mvDkYs61/exec';

const STATUS_BADGE = {
  '買い時': { class: 'badge-buy', label: '買い時！' },
  'もう少し': { class: 'badge-almost', label: 'もう少し' },
  '高め': { class: 'badge-high', label: '高め' },
  '取得エラー': { class: 'badge-error', label: '取得エラー' },
};

async function init() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    renderUpdatedAt(data.updated_at);
    renderCards(data.products);
    renderChart(data.products, data.price_history);
  } catch (err) {
    document.getElementById('product-cards').innerHTML =
      '<p style="color:red;">データの取得に失敗しました: ' + err.message + '</p>';
  }
}

function renderUpdatedAt(updatedAt) {
  const el = document.getElementById('updated-at');
  if (updatedAt) {
    const d = new Date(updatedAt);
    el.textContent = '最終更新: ' + d.toLocaleString('ja-JP');
  }
}

function renderCards(products) {
  const container = document.getElementById('product-cards');
  container.innerHTML = products.map(function(p) {
    const badge = STATUS_BADGE[p.status] || STATUS_BADGE['高め'];
    const priceText = p.current_price ? '¥' + p.current_price.toLocaleString() : '---';
    const targetText = p.target_price ? '¥' + p.target_price.toLocaleString() : '---';
    const lowestText = p.lowest_price ? '¥' + p.lowest_price.toLocaleString() : '---';
    const avgText = p.recent_avg_price ? '¥' + p.recent_avg_price.toLocaleString() : '---';
    const shopLink = p.shop_url
      ? '<a class="btn-shop" href="' + p.shop_url + '" target="_blank" rel="noopener">' + (p.shop_name || '最安ショップ') + 'で購入</a>'
      : '<a class="btn-shop" href="' + p.kakaku_url + '" target="_blank" rel="noopener">価格.comで見る</a>';

    return '<div class="card">'
      + '<h3>' + escapeHtml(p.name) + ' (' + escapeHtml(p.capacity) + ')</h3>'
      + '<span class="badge ' + badge.class + '">' + badge.label + '</span>'
      + '<div class="price">' + priceText + '</div>'
      + '<div class="meta">目標: ' + targetText + ' / 過去最安: ' + lowestText + ' / 30日平均: ' + avgText + '</div>'
      + shopLink
      + '</div>';
  }).join('');
}

function renderChart(products, priceHistory) {
  const ctx = document.getElementById('price-chart').getContext('2d');
  const colors = ['#1a237e','#c62828','#2e7d32','#ff6f00','#6a1b9a','#00838f','#4e342e','#546e7a','#ad1457','#1565c0'];
  const datasets = [];

  products.forEach(function(p, i) {
    const history = priceHistory[p.product_id] || [];
    if (history.length === 0) return;
    datasets.push({
      label: p.name,
      data: history.map(function(h) { return { x: h.date, y: h.price }; }),
      borderColor: colors[i % colors.length],
      fill: false,
      tension: 0.3,
      pointRadius: 2,
    });
  });

  new Chart(ctx, {
    type: 'line',
    data: { datasets: datasets },
    options: {
      responsive: true,
      scales: {
        x: { type: 'category', title: { display: true, text: '日付' } },
        y: { title: { display: true, text: '価格（円）' }, beginAtZero: false },
      },
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

init();
