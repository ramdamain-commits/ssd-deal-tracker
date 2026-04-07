// GAS Web App の URL（デプロイ後にここを更新する）
const API_URL = 'https://script.google.com/macros/s/AKfycbx4wSK_sYIP8Ksu-nWibGAbJxKFBPWN02o3K7Ame21q0QdFCYbxqByWD087mvDkYs61/exec';

const STATUS_BADGE = {
  '買い時': { class: 'badge-buy', label: '買い時！' },
  'もう少し': { class: 'badge-almost', label: 'もう少し' },
  '高め': { class: 'badge-high', label: '高め' },
  '取得エラー': { class: 'badge-error', label: '取得エラー' },
};

// ---- ブランド判定 ----
// 製品名からブランドキー（小文字）を返す。
// 追跡対象外のブランドは 'other' を返す。
function detectBrand(name) {
  const n = name.toLowerCase();
  if (n.includes('wd') || n.includes('wd_black') || n.includes('western')) return 'wd';
  if (n.includes('crucial')) return 'crucial';
  if (n.includes('kioxia') || n.includes('exceria')) return 'kioxia';
  return 'other';
}

// ---- ステータスフィルタ用の正規化 ----
// ステータスフィルタの「未取得」は取得エラーに対応させる。
// それ以外は元のステータス文字列をそのまま返す。
function normalizeStatusForFilter(status) {
  if (status === '取得エラー') return '未取得';
  return status;
}

// ---- フィルタ状態管理 ----
// URLパラメータ (?capacity=2tb&brand=samsung&status=買い時) から初期値を読み込む。
var filterState = (function () {
  var params = new URLSearchParams(location.search);
  return {
    brand:    params.get('brand')    || 'all',
    status:   params.get('status')   || 'all',
  };
})();

// URLパラメータを現在のフィルタ状態に同期する（履歴は pushState で積まない）
function syncUrl() {
  var params = new URLSearchParams();
  if (filterState.brand    !== 'all') params.set('brand',    filterState.brand);
  if (filterState.status   !== 'all') params.set('status',   filterState.status);
  var qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// フィルタバーのボタンを filterState に合わせてアクティブ化する
function syncFilterUI() {
  document.querySelectorAll('.pill[data-filter]').forEach(function (btn) {
    var filterKey = btn.dataset.filter;
    var isActive  = filterState[filterKey] === btn.dataset.value;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

// フィルタ条件に基づいてカードの表示/非表示を切り替える
function applyFilter() {
  var cards      = document.querySelectorAll('.card');
  var noResults  = document.getElementById('no-results');
  var visibleCount = 0;

  cards.forEach(function (card) {
    var matchBrand    = filterState.brand    === 'all' || card.dataset.brand    === filterState.brand;
    var matchStatus   = filterState.status   === 'all' || card.dataset.status   === filterState.status;
    var visible       = matchBrand && matchStatus;

    card.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  });

  // 結果ゼロのときにメッセージを表示する
  if (noResults) noResults.hidden = visibleCount > 0;
}

// フィルタバーのクリックイベントを登録する
function initFilterBar() {
  // 初期状態でボタンを同期する（URLパラメータからの復元）
  syncFilterUI();

  document.getElementById('filter-bar').addEventListener('click', function (e) {
    var btn = e.target.closest('.pill[data-filter]');
    if (!btn) return;

    var filterKey = btn.dataset.filter;
    filterState[filterKey] = btn.dataset.value;

    syncFilterUI();
    syncUrl();
    applyFilter();
  });
}

async function init() {
  // ローディング表示
  document.getElementById('product-cards').innerHTML =
    '<p class="loading">価格データを読み込み中...</p>';
  document.getElementById('updated-at').textContent = '最終更新: 読み込み中...';

  // フィルタバーのイベントを先に登録しておく
  initFilterBar();

  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    renderUpdatedAt(data.updated_at);
    renderCards(data.products);
    // カードが描画されてからフィルタを適用する
    applyFilter();
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

    // フィルタ用 data 属性を付与する
    // data-capacity: "1tb" / "2tb"（小文字に統一）
    // data-brand: detectBrand() で判定したブランドキー
    // data-status: ステータスフィルタ用の正規化済み値（取得エラー→未取得）
    const dataCapacity = escapeHtml((p.capacity || '').toLowerCase());
    const dataBrand    = escapeHtml(detectBrand(p.name || ''));
    const dataStatus   = escapeHtml(normalizeStatusForFilter(p.status || ''));

    return '<div class="card"'
      + ' data-capacity="' + dataCapacity + '"'
      + ' data-brand="'    + dataBrand    + '"'
      + ' data-status="'   + dataStatus   + '"'
      + '>'
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
  const colors = ['#1a237e','#c62828','#2e7d32','#ff6f00','#6a1b9a','#00838f','#4e342e','#546e7a','#ad1457','#1565c0','#e65100','#00695c','#283593','#9e9d24'];
  const datasets = [];

  // 全製品の日付を収集してソート済みラベルを生成
  var allDates = {};
  products.forEach(function(p) {
    (priceHistory[p.product_id] || []).forEach(function(h) { allDates[h.date] = true; });
  });
  var labels = Object.keys(allDates).sort();

  products.forEach(function(p, i) {
    var history = priceHistory[p.product_id] || [];
    if (history.length === 0) return;
    // 日付→価格のマップを作成
    var priceMap = {};
    history.forEach(function(h) { priceMap[h.date] = h.price; });
    datasets.push({
      label: p.name,
      data: labels.map(function(d) { return priceMap[d] || null; }),
      borderColor: colors[i % colors.length],
      fill: false,
      tension: 0.3,
      pointRadius: 2,
      spanGaps: true,
    });
  });

  const isMobile = window.innerWidth < 600;

  new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: !isMobile,
      aspectRatio: isMobile ? 1 : 2,
      scales: {
        x: {
          type: 'category',
          title: { display: !isMobile, text: '日付' },
          ticks: { maxRotation: 45, font: { size: isMobile ? 10 : 12 } },
        },
        y: {
          title: { display: !isMobile, text: '価格（円）' },
          ticks: {
            font: { size: isMobile ? 10 : 12 },
            callback: function(v) { return '¥' + v.toLocaleString(); }
          },
          beginAtZero: false,
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: isMobile ? 10 : 12 }, boxWidth: isMobile ? 12 : 40 },
        },
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
