// ============================================================
// PANDA CARD — BAMBOO VIEW (public, no demo mode)
// ============================================================

let bambooChart = null;
let bambooCards = [];
let bambooSelected = null;
let bambooDays = 7;
let bambooCurrency = 'NGN';
let bambooRates = { NGN: 1 };
let bambooDemandData = {};

// ============================================================
// INIT
// ============================================================
async function bambooInit() {
  loadBambooCurrencyPref();
  bambooRates = await loadExchangeRates();
  await bambooLoadData();
  setInterval(bambooLoadData, 30000);
}

function loadBambooCurrencyPref() {
  const saved = localStorage.getItem('bamboo_currency');
  if (saved) bambooCurrency = saved;
  const sel = document.getElementById('bambooCurrency');
  if (sel) sel.value = bambooCurrency;
}

function changeBambooCurrency() {
  const sel = document.getElementById('bambooCurrency');
  if (!sel) return;
  bambooCurrency = sel.value;
  localStorage.setItem('bamboo_currency', bambooCurrency);
  if (bambooSelected) bambooRenderCard(bambooSelected);
  bambooRenderMovers();
}

// ============================================================
// DATA LOAD
// ============================================================
async function bambooLoadData() {
  try {
    const sb = getSupabase();
    if (!sb) return;

    const { data: cards, error } = await sb
      .from('cards')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    bambooCards = cards || [];

    try {
      const { data: demands } = await sb
        .from('demand_requests')
        .select('card_id, user_id, created_at')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

      bambooDemandData = {};
      (demands || []).forEach(d => {
        if (!bambooDemandData[d.card_id]) {
          bambooDemandData[d.card_id] = { unique: new Set(), count: 0 };
        }
        bambooDemandData[d.card_id].unique.add(d.user_id);
        bambooDemandData[d.card_id].count++;
      });
    } catch (e) {
      bambooDemandData = {};
    }

    bambooRenderSelector();
    bambooRenderSentiment();
    bambooRenderPie();
    bambooRenderMovers();

    if (bambooCards.length && !bambooSelected) {
      bambooSelected = bambooCards[0];
      bambooRenderCard(bambooSelected);
    } else if (bambooSelected) {
      const still = bambooCards.find(c => c.id === bambooSelected.id);
      bambooSelected = still || bambooCards[0];
      if (bambooSelected) bambooRenderCard(bambooSelected);
    }
  } catch (e) {
    console.error('Bamboo load error:', e);
  }
}

// ============================================================
// RENDER SELECTOR
// ============================================================
function bambooRenderSelector() {
  const el = document.getElementById('cardSelector');
  if (!el) return;
  if (!bambooCards.length) {
    el.innerHTML = '<span style="color:#666;font-size:12px;">No cards</span>';
    return;
  }
  el.innerHTML = bambooCards.map(card => {
    const active = bambooSelected && bambooSelected.id === card.id ? 'active' : '';
    let dot = 'neutral';
    if (card.is_vip) dot = 'vip';
    else if (card.status === 'hot') dot = 'hot';
    else if (card.status === 'cold') dot = 'cold';
    return `<span class="chip ${active}" onclick="bambooSelectCard('${card.id}')">
      <span class="status-dot ${dot}"></span>${escapeHtml(card.name)}
    </span>`;
  }).join('');
}

function bambooSelectCard(id) {
  bambooSelected = bambooCards.find(c => c.id === id) || null;
  if (bambooSelected) bambooRenderCard(bambooSelected);
  document.querySelectorAll('#cardSelector .chip').forEach(ch => ch.classList.remove('active'));
  document.querySelectorAll('#cardSelector .chip').forEach(ch => {
    if (ch.textContent.trim().includes(bambooSelected.name)) ch.classList.add('active');
  });
  playSound('click');
}

// ============================================================
// RENDER CARD DETAIL
// ============================================================
function bambooRenderCard(card) {
  if (!card) return;

  document.getElementById('cardName').textContent = card.name || 'Card';

  const price = card.current_price || card.original_price || 0;
  document.getElementById('cardPrice').textContent = bambooFormatPrice(price);

  const change = card.price_change_pct || 0;
  const chEl = document.getElementById('cardChange');
  chEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
  chEl.className = 'change ' + (change >= 0 ? 'up' : 'down');

  const statusEl = document.getElementById('cardStatus');
  let status = card.status || 'neutral';
  if (card.is_vip) status = 'vip';
  statusEl.textContent = status.toUpperCase();
  statusEl.className = 'card-status ' + status;

  const floor = card.original_price || 0;
  const ceiling = floor * 10;
  document.getElementById('cardHigh').textContent = bambooFormatPrice(ceiling);
  document.getElementById('cardLow').textContent = bambooFormatPrice(floor);

  const demand = bambooDemandData[card.id];
  document.getElementById('cardVolume').textContent = demand ? demand.unique.size : 0;

  const demandUnique = demand ? demand.unique.size : 0;
  const demandTotal = demand ? demand.count : 0;
  const setEl = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.textContent = val;
  };
  setEl('bambooUniqueDemand', demandUnique);
  setEl('bambooTotalDemand', demandTotal);
  setEl('bambooListings', card.active_listings || 0);
  setEl('bambooPurchases', card.completed_purchases_7d || 0);
  setEl('bambooComboAssign', card.combo_assignments || 0);
  setEl('bambooSupply', card.available_supply || 0);

  bambooRenderChart(card);
}

// ============================================================
// RENDER CHART
// ============================================================
function bambooRenderChart(card) {
  const canvas = document.getElementById('bambooChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const history = (card.price_history || []).slice(-bambooDays).map(h => ({
    date: new Date(h.created_at || h.date),
    price: h.price || card.current_price || 0
  }));

  if (!history.length) {
    history.push({ date: new Date(), price: card.current_price || card.original_price || 0 });
  }

  const labels = history.map(h => h.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const prices = history.map(h => h.price);

  if (bambooChart) {
    try { bambooChart.destroy(); } catch (e) {}
    bambooChart = null;
  }

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(255,215,0,0.25)');
  grad.addColorStop(1, 'rgba(255,215,0,0.01)');

  bambooChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: card.name,
        data: prices,
        borderColor: '#FFD700',
        backgroundColor: grad,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#666', font: { size: 9 }, maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666', font: { size: 9 }, callback: v => bambooFormatPrice(v) } }
      }
    }
  });
}

function bambooChangeTimeframe(days, btn) {
  bambooDays = days;
  document.querySelectorAll('.time-filters .tf-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (bambooSelected) bambooRenderChart(bambooSelected);
}

// ============================================================
// SENTIMENT
// ============================================================
function bambooRenderSentiment() {
  if (!bambooCards.length) return;
  const hot = bambooCards.filter(c => c.status === 'hot' || c.is_vip).length;
  const cold = bambooCards.filter(c => c.status === 'cold').length;
  const total = bambooCards.length;
  const bullish = Math.round((hot / total) * 100);
  const bearish = Math.round((cold / total) * 100);

  const val = document.getElementById('sentimentValue');
  if (val) {
    val.textContent = bullish > 50 ? 'Bullish ' + bullish + '%' : bearish > 50 ? 'Bearish ' + bearish + '%' : 'Neutral';
    val.className = 'value ' + (bullish > 50 ? 'bullish' : bearish > 50 ? 'bearish' : '');
  }
  const bb = document.getElementById('bullishBar');
  const br = document.getElementById('bearishBar');
  if (bb) bb.style.width = bullish + '%';
  if (br) br.style.width = bearish + '%';
  const bl = document.getElementById('bullishLabel');
  const brl = document.getElementById('bearishLabel');
  if (bl) bl.textContent = 'Bullish ' + bullish + '%';
  if (brl) brl.textContent = 'Bearish ' + bearish + '%';
}

// ============================================================
// PIE
// ============================================================
function bambooRenderPie() {
  const el = document.getElementById('pieChart');
  if (!el || !bambooCards.length) return;

  const hot = bambooCards.filter(c => c.status === 'hot').length;
  const cold = bambooCards.filter(c => c.status === 'cold').length;
  const vip = bambooCards.filter(c => c.is_vip).length;
  const neutral = bambooCards.length - hot - cold - vip;
  const total = bambooCards.length;

  const hp = (hot / total) * 100;
  const np = (neutral / total) * 100;
  const cp = (cold / total) * 100;

  el.style.background = `conic-gradient(#FF4444 0% ${hp}%, #888 ${hp}% ${hp+np}%, #4A90D9 ${hp+np}% ${hp+np+cp}%, #FFD700 ${hp+np+cp}% 100%)`;
  document.getElementById('pieTotal').textContent = total;
  document.getElementById('pieHot').textContent = hot;
  document.getElementById('pieNeutral').textContent = neutral;
  document.getElementById('pieCold').textContent = cold;
  document.getElementById('pieVip').textContent = vip;
}

// ============================================================
// MOVERS
// ============================================================
function bambooRenderMovers() {
  const el = document.getElementById('moversBar');
  if (!el) return;
  if (!bambooCards.length) { el.innerHTML = '<div style="color:#666;text-align:center;font-size:12px;">No data</div>'; return; }

  const sorted = bambooCards.slice().sort((a, b) => (b.price_change_pct || 0) - (a.price_change_pct || 0)).slice(0, 5);
  el.innerHTML = sorted.map(card => {
    const ch = card.price_change_pct || 0;
    const up = ch >= 0;
    return `<div class="bar-row">
      <span class="bar-label">${escapeHtml(card.name).substring(0, 8)}</span>
      <div class="bar-track">
        <div class="bar-fill ${up ? 'green' : 'red'}" style="width:${Math.min(Math.abs(ch) * 5, 95)}%;">${(up ? '+' : '') + ch.toFixed(1)}%</div>
      </div>
      <span class="bar-percent" style="color:${up ? '#22C55E' : '#FF4444'};">${(up ? '+' : '') + ch.toFixed(1)}%</span>
    </div>`;
  }).join('');
}

// ============================================================
// FORMAT
// ============================================================
function bambooFormatPrice(ngn) {
  const rate = bambooRates[bambooCurrency] || 1;
  const converted = ngn * rate;
  const symbol = getCurrencySymbol(bambooCurrency);
  if (bambooCurrency === 'NGN') return '₦' + Math.round(ngn).toLocaleString();
  if (converted < 0.01) return symbol + converted.toFixed(8);
  if (converted < 1) return symbol + converted.toFixed(6);
  if (converted < 100) return symbol + converted.toFixed(2);
  return symbol + Math.round(converted).toLocaleString();
}

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', bambooInit);

window.bambooSelectCard = bambooSelectCard;
window.bambooChangeTimeframe = bambooChangeTimeframe;
window.changeBambooCurrency = changeBambooCurrency;