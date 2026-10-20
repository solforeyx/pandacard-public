// ============================================================
// PANDA CARD — MAIN APP (COMPLETE — LIVE + DEMO + PUSH)
// ============================================================

// 🔴 REPLACE THIS WITH YOUR ACTUAL VAPID PUBLIC KEY
const VAPID_PUBLIC_KEY = 'BCVPOe8TdN7OghMRpOHMZkPZ1F7oU7mKApl3LcEyDEM9I7Q1fLb_oBq-LX7k3ASviUG73jqnx7FRHbkdiX4M9kE';

// PWA INSTALL PROMPT
let deferredPrompt = null;

const APP = {
  user: null,
  profile: null,
  mode: 'demo',
  cards: [],
  dashTab: 'marketplace',
  tradeTab: 'buy',
  tradeFilter: 'all',
  tradeSearch: '',
  inventorySearch: '',
  portfolioDays: 7,
  portfolioChart: null,
  paymentMethod: null,
  livePublished: false,
  ratesLoaded: false,
  bulkSelected: [],
  longPressTimer: null
};

// ============================================================
// DEMO SERVICE
// ============================================================
const Demo = {
  account() { return demoGetSession(); },
  state() { const a = this.account(); return a ? a.state : null; },
  update(mutator) {
    const a = this.account();
    if (!a) return null;
    mutator(a.state);
    demoUpdateState(a.email, a.state);
    return a.state;
  },
  notify(title, body, type) {
    const a = this.account();
    if (!a) return;
    this.update(s => {
      if (!s.notifications) s.notifications = [];
      s.notifications.unshift({
        id: generateId('n'),
        title, body,
        type: type || 'info',
        read: false,
        createdAt: Date.now()
      });
      if (s.notifications.length > 200) s.notifications = s.notifications.slice(0, 200);
    });
    if (APP.user) updateNotificationBadge();
    playNotificationSound();
  },
  log(tx) {
    this.update(s => {
      if (!s.transactions) s.transactions = [];
      s.transactions.unshift({ id: generateId('tx'), ...tx, createdAt: Date.now() });
      if (s.transactions.length > 500) s.transactions = s.transactions.slice(0, 500);
    });
  }
};

// ============================================================
// GETTERS
// ============================================================
function getBalances() {
  if (isDemo()) {
    const s = Demo.state();
    return {
      earnings: s?.earningsBalance || 0,
      deposit: s?.depositBalance || 0,
      coins: s?.coins || 0,
      dp: s?.diamondPoints || 0,
      lifetimeEarned: s?.lifetimeEarned || 0,
      lifetimeWithdrawn: s?.lifetimeWithdrawn || 0
    };
  }
  const p = APP.profile;
  return {
    earnings: p?.earnings_balance || 0,
    deposit: p?.deposit_balance || 0,
    coins: p?.coins || 0,
    dp: p?.diamond_points || 0,
    lifetimeEarned: p?.lifetime_earned || 0,
    lifetimeWithdrawn: p?.lifetime_withdrawn || 0
  };
}

function getInventory() {
  if (isDemo()) {
    const s = Demo.state();
    return s?.inventory || {};
  }
  return APP.profile?.inventory || {};
}

function getStage() {
  return getStageByEarnings(getBalances().lifetimeEarned);
}

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(section) {
  playSound('click');
  document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('section-' + section);
  if (target) target.classList.add('active');

  document.querySelectorAll('.sidebar .menu-item').forEach(el => {
    el.classList.remove('active');
    const oc = el.getAttribute('onclick') || '';
    if (oc.includes("'" + section + "'")) el.classList.add('active');
  });

  document.querySelectorAll('.bottom-nav a').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + section);
  if (navEl) navEl.classList.add('active');

  closeSidebar();
  window.location.hash = section;
  window.scrollTo(0, 0);

  if (section === 'dashboard') loadDashboard();
  if (section === 'trade') loadTrade();
  if (section === 'mining') loadMining();
  if (section === 'combo') loadDailyCombo();
  if (section === 'wallet') loadWallet();
  if (section === 'inventory') loadInventory();
  if (section === 'profile') loadProfile();
  if (section === 'settings') loadSettings();
  if (section === 'notifications') loadNotifications();
  if (section === 'referral') loadReferral();
  if (section === 'announcements') loadAnnouncements();
  if (section === 'help') loadFAQ();
  if (section === 'dailyreward') loadDailyReward();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
  playSound('click');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ============================================================
// PWA INSTALL LOGIC
// ============================================================
function installPWA() {
  if (!deferredPrompt) {
    showToast('Install prompt not available yet. Please try again later.', 'info');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the A2HS prompt');
      hideInstallUI();
    } else {
      console.log('User dismissed the A2HS prompt');
    }
    deferredPrompt = null;
  });
}

function hideInstallUI() {
  const headerBtn = document.getElementById('pwaInstallBtn');
  if (headerBtn) headerBtn.style.display = 'none';
  const settingsRow = document.getElementById('settingsInstallRow');
  if (settingsRow) settingsRow.style.display = 'none';
}

// ============================================================
// BADGE & PUSH NOTIFICATIONS
// ============================================================
async function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  let count = 0;
  
  if (isDemo()) {
    const s = Demo.state();
    count = s?.notifications?.filter(n => !n.read).length || 0;
  } else {
    // Fetch live count from Supabase
    const { count: liveCount } = await getSupabase()
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', APP.user.id)
      .eq('read', false);
    count = liveCount || 0;
  }
  
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('show', count > 0);
  
  // Update the home screen icon badge
  updateAppBadge(count);
}

function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Push notifications are not supported on this device.', 'error');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('Notification permission denied.', 'error');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    const sb = getSupabase();
    if (sb && APP.user) {
      await sb.from('push_subscriptions').upsert({
        user_id: APP.user.id,
        subscription: subscription.toJSON()
      }, { onConflict: 'user_id' });
      showToast('Push notifications enabled!', 'success');
    }
  } catch (err) {
    console.error('Push subscription failed:', err);
    showToast('Failed to enable push notifications.', 'error');
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function loadDashboard() {
  renderBalanceCard();
  renderStats();
  renderBannerAlerts();
  renderChecklist();
  renderPortfolioChart();
  renderMarketplaceGrid();
  renderDashInventory();
}

function renderBalanceCard() {
  const b = getBalances();
  const stage = getStage();
  const cfg = getStageConfig(stage);
  const progress = getProgressToNextStage(b.lifetimeEarned);

  const earnEl = document.getElementById('balanceEarnings');
  if (earnEl) earnEl.textContent = formatPrice(b.earnings);
  const depEl = document.getElementById('balanceDeposit');
  if (depEl) depEl.textContent = formatPrice(b.deposit);
  const stageEl = document.getElementById('stageBadge');
  if (stageEl) stageEl.textContent = cfg.name;
  const fillEl = document.getElementById('stageProgressFill');
  if (fillEl) fillEl.style.width = progress.progress + '%';

  const labelEl = document.getElementById('stageProgressLabel');
  if (labelEl) {
    if (progress.next) {
      labelEl.textContent = formatPrice(b.lifetimeEarned) + ' / ' + formatPrice(progress.next) + ' — ' + progress.label;
    } else {
      labelEl.textContent = 'Max Stage Reached';
    }
  }
}

function renderStats() {
  const inv = getInventory();
  const b = getBalances();
  let portfolioValue = 0;
  Object.keys(inv).forEach(id => {
    const c = APP.cards.find(x => x.id === id);
    if (c) portfolioValue += (c.current_price || c.original_price || 0) * (inv[id] || 0);
  });
  const pEl = document.getElementById('statPortfolio');
  if (pEl) pEl.textContent = formatPrice(portfolioValue);
  const cEl = document.getElementById('statCoins');
  if (cEl) cEl.textContent = String(b.coins || 0);
  const cardEl = document.getElementById('statCards');
  if (cardEl) cardEl.textContent = String(Object.keys(inv).length);
}

function renderBannerAlerts() {
  const el = document.getElementById('bannerAlerts');
  if (!el) return;
  el.innerHTML = '';

  if (isDemo()) {
    const welcomeSeen = localStorage.getItem('pandacard_welcome_seen');
    if (!welcomeSeen) {
      el.innerHTML = `
        <div class="banner-alert info" style="margin-bottom:12px;">
          <span class="material-icons">celebration</span>
          <span class="banner-text">Welcome to Panda Card, ${escapeHtml(APP.user?.displayName || 'trader')}! You're in Demo Mode — explore freely.</span>
          <button class="banner-dismiss" onclick="dismissWelcome()">&times;</button>
        </div>
      `;
    }
  }
}

function dismissWelcome() {
  localStorage.setItem('pandacard_welcome_seen', '1');
  const el = document.getElementById('bannerAlerts');
  if (el) el.innerHTML = '';
}

function renderChecklist() {
  const el = document.getElementById('checklistCard');
  if (!el) return;
  if (!isDemo()) { el.innerHTML = ''; return; }
  const s = Demo.state();
  if (!s) { el.innerHTML = ''; return; }
  
  const items = s.checklist || {};
  const pinDone = items.pin || !!s.pin;
  const rewardDone = items.reward || false;
  const depositDone = items.deposit || false;
  const learnDone = items.learn || false;
  const annDone = items.announcement || false;
  const buyDone = items.buy || false;

  if (rewardDone && depositDone && learnDone && annDone && buyDone && pinDone) {
    el.innerHTML = '';
    return;
  }

  const rows = [
    { key: 'pin', label: 'Set your security PIN', action: "navigateTo('settings');setTimeout(()=>openPinModal('set'), 300)", done: pinDone },
    { key: 'reward', label: 'Claim your daily reward', action: "navigateTo('dailyreward')", done: rewardDone },
    { key: 'deposit', label: 'Make your first deposit', action: "navigateTo('wallet')", done: depositDone },
    { key: 'learn', label: 'Learn how the app works', action: "navigateTo('live')", done: learnDone },
    { key: 'announcement', label: 'Check latest announcements', action: "navigateTo('announcements')", done: annDone },
    { key: 'buy', label: 'Buy your first card', action: "navigateTo('trade')", done: buyDone }
  ];

  el.innerHTML = `
    <div class="checklist-card">
      <div class="checklist-title"><span class="material-icons">checklist</span> Getting Started</div>
      <div class="checklist-sub">Complete these to unlock the full experience</div>
      ${rows.map(r => `
        <div class="checklist-item ${r.done ? 'done' : ''}" onclick="${r.action}">
          <span class="check-circle"><span class="material-icons">check</span></span>
          <span class="check-label">${escapeHtml(r.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPortfolioChart() {
  const canvas = document.getElementById('portfolioChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');
  if (APP.portfolioChart) { try { APP.portfolioChart.destroy(); } catch (e) {} }

  const inv = getInventory();
  const cardIds = Object.keys(inv);
  const days = APP.portfolioDays;

  const labels = [];
  const data = [];
  let baseValue = 0;
  cardIds.forEach(id => {
    const c = APP.cards.find(x => x.id === id);
    if (c) baseValue += (c.current_price || c.original_price || 0) * inv[id];
  });

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const wobble = cardIds.length === 0 ? 0 : (1 + Math.sin(i / 3) * 0.05);
    data.push(Math.round(baseValue * wobble));
  }

  const chEl = document.getElementById('portfolioChartChange');
  if (cardIds.length === 0) {
    if (chEl) { chEl.textContent = 'Empty'; chEl.className = 'graph-change'; }
  } else {
    const first = data[0] || 1;
    const last = data[data.length - 1];
    const changePct = ((last - first) / first) * 100;
    if (chEl) {
      chEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '%';
      chEl.className = 'graph-change ' + (changePct >= 0 ? 'up' : 'down');
    }
  }

  APP.portfolioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#FFD700',
        backgroundColor: 'rgba(255,215,0,0.1)',
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#999', font: { size: 10 }, maxTicksLimit: 6 } },
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#999', font: { size: 10 }, callback: v => formatPrice(v) } }
      }
    }
  });
}

function changePortfolioTime(days, btn) {
  APP.portfolioDays = days;
  document.querySelectorAll('#section-dashboard .time-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPortfolioChart();
}

function switchDashTab(tab) {
  APP.dashTab = tab;
  document.querySelectorAll('#section-dashboard .tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#section-dashboard .tab-content').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');
  playSound('click');
}

// ============================================================
// MARKETPLACE
// ============================================================
function renderMarketplaceGrid() {
  const grid = document.getElementById('marketplaceGrid');
  if (!grid) return;
  if (!APP.cards.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="material-icons">inventory_2</span><p>No cards available</p></div>';
    const cnt = document.getElementById('marketplaceCount');
    if (cnt) cnt.textContent = '0 cards';
    return;
  }

  const inv = getInventory();
  const grouped = { disappearing: [], bonus: [], vip: [], hot: [], cold: [], neutral: [], newly: [] };
  APP.cards.forEach(c => {
    if (c.is_disappearing && c.is_active) grouped.disappearing.push(c);
    else if (c.is_bonus) grouped.bonus.push(c);
    else if (c.is_vip) grouped.vip.push(c);
    else if (c.status === 'hot') grouped.hot.push(c);
    else if (c.status === 'cold') grouped.cold.push(c);
    else if (c.status === 'newly') grouped.newly.push(c);
    else grouped.neutral.push(c);
  });

  const sections = [
    { key: 'disappearing', label: 'Disappearing', color: '#9B59B6', icon: 'hourglass_top' },
    { key: 'bonus', label: 'Bonus', color: '#FF6B35', icon: 'card_giftcard' },
    { key: 'vip', label: 'VIP', color: '#FFD700', icon: 'star' },
    { key: 'hot', label: 'Hot', color: '#FF4444', icon: 'whatshot' },
    { key: 'cold', label: 'Cold', color: '#4A90D9', icon: 'ac_unit' },
    { key: 'neutral', label: 'Neutral', color: '#888', icon: 'balance' },
    { key: 'newly', label: 'New', color: '#22C55E', icon: 'new_releases' }
  ];

  let html = '';
  let total = 0;
  sections.forEach(s => {
    if (grouped[s.key].length) {
      html += `<div style="grid-column:1/-1;margin-top:8px;font-weight:700;color:${s.color};font-size:13px;display:flex;align-items:center;gap:6px;"><span class="material-icons" style="font-size:18px;">${s.icon}</span> ${s.label}</div>`;
      grouped[s.key].forEach(card => { total++; html += renderCardTile(card, inv); });
    }
  });
  grid.innerHTML = html;
  const cnt = document.getElementById('marketplaceCount');
  if (cnt) cnt.textContent = total + ' cards';
}

function renderDashInventory() {
  const grid = document.getElementById('dashInventoryGrid');
  const countEl = document.getElementById('dashInventoryCount');
  if (!grid) return;
  const inv = getInventory();
  const ids = Object.keys(inv).filter(id => inv[id] > 0);
  if (countEl) countEl.textContent = ids.length + ' cards';
  if (!ids.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="material-icons">inbox</span><p>No cards yet</p></div>';
    return;
  }
  grid.innerHTML = ids.slice(0, 6).map(id => {
    const c = APP.cards.find(x => x.id === id);
    return c ? renderCardTile(c, inv) : '';
  }).join('');
}

function renderCardTile(card, inv) {
  const frameClass = card.is_vip ? 'frame-vip'
    : card.is_disappearing ? 'frame-disappearing'
    : card.is_bonus ? 'frame-bonus'
    : card.status === 'hot' ? 'frame-hot'
    : card.status === 'cold' ? 'frame-cold'
    : card.status === 'newly' ? 'frame-newly'
    : 'frame-neutral';

  let badge = '';
  if (card.is_disappearing) badge = '<span class="badge-top disappearing">DISAPPEARING</span>';
  else if (card.is_bonus) badge = '<span class="badge-top bonus">BONUS</span>';
  else if (card.is_vip) badge = '<span class="badge-top vip">VIP</span>';
  else if (card.status === 'hot') badge = '<span class="badge-top hot">HOT</span>';
  else if (card.status === 'cold') badge = '<span class="badge-top cold">COLD</span>';
  else if (card.status === 'newly') badge = '<span class="badge-top newly">NEW</span>';

  const owned = inv?.[card.id] ? '<div style="position:absolute;top:8px;right:8px;background:#22C55E;color:#fff;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;">OWNED</div>' : '';

  const selected = APP.bulkSelected.includes(card.id);
  const selBorder = selected ? 'box-shadow:0 0 0 3px #22C55E;' : '';

  return `
    <div class="card-item ${frameClass}" style="${selBorder}" data-card-id="${card.id}" onclick="cardTileClick('${card.id}')" onmousedown="startLongPress('${card.id}')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" ontouchstart="startLongPress('${card.id}')" ontouchend="cancelLongPress()">
      <div class="card-image">
        <img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
        ${badge}${owned}
        ${selected ? '<div style="position:absolute;bottom:8px;right:8px;background:#22C55E;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">✓</div>' : ''}
      </div>
      <div class="card-name">${escapeHtml(card.name)}</div>
      <div class="card-price">${formatPrice(card.current_price || card.original_price || 0)}</div>
    </div>`;
}

// ============================================================
// LONG-PRESS BULK SELECT
// ============================================================
function startLongPress(cardId) {
  cancelLongPress();
  const inv = getInventory();
  if (!inv[cardId] || inv[cardId] <= 0) return; // only owned cards selectable
  APP.longPressTimer = setTimeout(() => {
    toggleBulkSelect(cardId);
    playSound('click');
    if (navigator.vibrate) navigator.vibrate(30);
  }, 600);
}

function cancelLongPress() {
  if (APP.longPressTimer) {
    clearTimeout(APP.longPressTimer);
    APP.longPressTimer = null;
  }
}

function cardTileClick(cardId) {
  cancelLongPress();
  if (APP.bulkSelected.length > 0) {
    toggleBulkSelect(cardId);
    return;
  }
  openCardModal(cardId);
}

function toggleBulkSelect(cardId) {
  const idx = APP.bulkSelected.indexOf(cardId);
  if (idx === -1) {
    APP.bulkSelected.push(cardId);
  } else {
    APP.bulkSelected.splice(idx, 1);
  }
  updateBulkSellBar();
  renderInventoryFull();
  renderDashInventory();
}

function updateBulkSellBar() {
  const bar = document.getElementById('bulkSellBar');
  if (!bar) return;
  bar.style.display = APP.bulkSelected.length > 0 ? 'block' : 'none';
  const cnt = document.getElementById('bulkSelectedCount');
  if (cnt) cnt.textContent = String(APP.bulkSelected.length);
}

// ============================================================
// CARD MODAL
// ============================================================
function openCardModal(cardId) {
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  playSound('click');

  const inv = getInventory();
  const owned = inv[cardId] || 0;
  const isVip = !!card.is_vip;
  const isBonus = !!card.is_bonus;
  const statusForFee = card.status === 'newly' ? 'newly' : (card.status || 'neutral');
  const coinFee = coinFeeForBuy(statusForFee, isVip);

  const originalPrice = card.original_price || card.current_price || 0;
  const currentPrice = card.current_price || originalPrice;
  const ceiling = originalPrice * 10;

  let actions = '';
  if (isBonus) {
    actions = `<button class="btn-primary" onclick="closeCardModal();navigateTo('referral')">Earn via Referrals</button>`;
  } else if (owned > 0) {
    actions = `
      <button class="btn-sell" onclick="closeCardModal();openSellModal('${cardId}')">Sell This Card</button>
      <button class="btn-primary" onclick="closeCardModal();navigateTo('inventory')">Go to Inventory</button>
    `;
  } else {
    const hasBought = isDemo() && Demo.state()?.ownedEver?.[cardId];
    if (hasBought) {
      actions = `<button class="btn-buy" onclick="closeCardModal();showToast('Look in Trade to buy again','info')">Find in Trade</button>`;
    } else {
      actions = `<button class="btn-buy" onclick="closeCardModal();buyFromMarketplace('${cardId}')">Buy — ${formatPrice(currentPrice)} + ${coinFee} PC</button>`;
    }
  }

  document.getElementById('cardModalBody').innerHTML = `
    <div class="modal-card-image"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" alt="" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /></div>
    <div class="modal-card-title">${escapeHtml(card.name)}</div>
    <div class="modal-card-id">ID: ${escapeHtml(card.card_code || card.id)}</div>
    <div class="detail-row"><span class="label">Original Price</span><span class="value">${formatPrice(originalPrice)}</span></div>
    <div class="detail-row"><span class="label">Current Price</span><span class="value gold">${formatPrice(currentPrice)}</span></div>
    <div class="detail-row"><span class="label">Floor</span><span class="value">${formatPrice(originalPrice)}</span></div>
    <div class="detail-row"><span class="label">Ceiling</span><span class="value">${formatPrice(ceiling)}</span></div>
    <div class="detail-row"><span class="label">Status</span><span class="value">${(card.status || 'neutral').toUpperCase()}</span></div>
    <div class="detail-row"><span class="label">Coin Fee</span><span class="value gold">${coinFee} PC</span></div>
    ${owned > 0 ? `<div class="detail-row"><span class="label">You Own</span><span class="value">${owned}</span></div>` : ''}
    ${card.description ? `<div style="font-size:13px;color:#666;padding:12px 0;line-height:1.5;">${escapeHtml(card.description)}</div>` : ''}
    <div class="modal-actions">${actions}</div>
  `;
  document.getElementById('cardModal').classList.add('open');
}
function closeCardModal() { document.getElementById('cardModal').classList.remove('open'); }

// ============================================================
// BUY FROM MARKETPLACE
// ============================================================
async function buyFromMarketplace(cardId) {
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  const b = getBalances();
  const price = card.current_price || card.original_price || 0;
  const statusForFee = card.status === 'newly' ? 'newly' : (card.status || 'neutral');
  const coinFee = coinFeeForBuy(statusForFee, !!card.is_vip);

  if (b.deposit < price) { showToast('Need ' + formatPrice(price) + ' in deposit balance', 'error'); playSound('error'); return; }
  if (b.coins < coinFee) { showToast('Need ' + coinFee + ' PC. You have ' + b.coins + '.', 'error'); playSound('error'); return; }

  if (!confirm('Buy ' + card.name + ' for ' + formatPrice(price) + ' + ' + coinFee + ' PC?')) return;
  showLoading('Purchasing...');

  try {
    if (isDemo()) {
      Demo.update(s => {
        s.depositBalance -= price;
        s.coins -= coinFee;
        s.inventory = s.inventory || {};
        s.inventory[cardId] = (s.inventory[cardId] || 0) + 1;
        s.ownedEver = s.ownedEver || {};
        s.ownedEver[cardId] = true;
        s.totalTrades = (s.totalTrades || 0) + 1;
        if (s.checklist) s.checklist.buy = true;
      });
      Demo.log({ type: 'buy', cardId, cardName: card.name, amount: price, coins: coinFee });
      Demo.notify('Card Purchased', 'You bought ' + card.name + ' for ' + formatPrice(price), 'trade');
      showToast('Purchased!', 'success');
      playSound('reward');
      hideLoading();
      loadDashboard();
      return;
    }
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase unavailable');
    const { data, error } = await sb.functions.invoke('marketplace-buy', { body: { cardId } });
    if (error || data?.error) throw new Error((data && data.error) || error?.message);
    showToast('Purchased!', 'success');
    playSound('reward');
    await refreshLiveProfile();
    loadDashboard();
  } catch (err) {
    showToast(err.message || 'Purchase failed', 'error');
    playSound('error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// SELL CARD (single)
// ============================================================
function openSellModal(cardId) {
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  const inv = getInventory();
  if (!inv[cardId] || inv[cardId] <= 0) { showToast('You do not own this card', 'error'); return; }
  if (card.is_bonus || card.is_disappearing) { showToast('This card cannot be sold', 'error'); return; }

  playSound('click');
  const b = getBalances();
  const floor = card.original_price || card.current_price || 0;
  const ceiling = floor * 10;
  const suggestedPrice = card.current_price || floor;

  document.getElementById('sellTitle').textContent = 'Sell ' + card.name;
  document.getElementById('sellBody').innerHTML = `
    <div style="background:#f0f0f5;border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#666;">
      <div>Floor: <b>${formatPrice(floor)}</b></div>
      <div>Ceiling: <b>${formatPrice(ceiling)}</b></div>
      <div>Current Market: <b>${formatPrice(card.current_price || floor)}</b></div>
      <div style="margin-top:6px;color:#FF4444;">Listing fee: <b>${CONFIG.LISTING_COIN_FEE} PC</b> (you have ${b.coins} PC)</div>
    </div>
    <div class="form-group">
      <label>Your Listing Price</label>
      <div class="input-wrapper">
        <span class="material-icons">payments</span>
        <input type="number" id="sellPriceInput" value="${Math.round(suggestedPrice)}" min="${Math.round(floor)}" max="${Math.round(ceiling)}" step="1" />
      </div>
      <div style="font-size:11px;color:#999;margin-top:4px;">Min: ${formatPrice(floor)} | Max: ${formatPrice(ceiling)}</div>
    </div>
    <button class="btn-primary" onclick="confirmSell('${cardId}')">List for Sale (${CONFIG.LISTING_COIN_FEE} PC)</button>
  `;
  document.getElementById('sellModal').classList.add('open');
}

function closeSellModal() { document.getElementById('sellModal').classList.remove('open'); }

async function confirmSell(cardId) {
  const input = document.getElementById('sellPriceInput');
  if (!input) return;
  const price = parseFloat(input.value);
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  const floor = card.original_price || card.current_price || 0;
  const ceiling = floor * 10;

  if (!price || price < floor || price > ceiling) {
    showToast('Price must be between ' + formatPrice(floor) + ' and ' + formatPrice(ceiling), 'error');
    return;
  }

  const b = getBalances();
  if (b.coins < CONFIG.LISTING_COIN_FEE) {
    showToast('Need ' + CONFIG.LISTING_COIN_FEE + ' PC', 'error');
    return;
  }

  const inv = getInventory();
  if (!inv[cardId] || inv[cardId] <= 0) { showToast('You do not own this card', 'error'); return; }

  showLoading('Creating listing...');
  try {
    if (isDemo()) {
      Demo.update(s => {
        s.coins -= CONFIG.LISTING_COIN_FEE;
        s.inventory[cardId] = (s.inventory[cardId] || 0) - 1;
        if (s.inventory[cardId] <= 0) delete s.inventory[cardId];
        s.listings = s.listings || [];
        const acc = Demo.account();
        s.listings.push({
          id: generateId('l'),
          sellerId: acc.id,
          cardId: cardId,
          price: price,
          units: 1,
          remaining: 1,
          createdAt: Date.now(),
          status: 'active',
          coinFeePaid: CONFIG.LISTING_COIN_FEE
        });
        s.totalTrades = (s.totalTrades || 0) + 0;
      });
      Demo.log({ type: 'listing_create', cardId, cardName: card.name, amount: price });
      showToast('Listed for ' + formatPrice(price), 'success');
      playSound('reward');
      closeSellModal();
      loadInventory();
      loadTrade();
      loadDashboard();
    } else {
      const { data, error } = await getSupabase().functions.invoke('create-listing', { body: { cardId, price } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      showToast('Listed successfully', 'success'); playSound('reward'); closeSellModal();
      await refreshLiveProfile(); loadInventory(); loadTrade(); loadDashboard();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// BULK SELL
// ============================================================
function openBulkSellModal() {
  if (!APP.bulkSelected.length) return;
  const b = getBalances();
  const totalFee = APP.bulkSelected.length * CONFIG.LISTING_COIN_FEE;

  document.getElementById('bulkSellBody').innerHTML = `
    <div style="background:#f0f0f5;border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#666;">
      Listing ${APP.bulkSelected.length} cards — total fee: <b>${totalFee} PC</b> (you have ${b.coins} PC)
    </div>
    ${APP.bulkSelected.map((cardId, idx) => {
      const card = APP.cards.find(c => c.id === cardId);
      if (!card) return '';
      const floor = card.original_price || card.current_price || 0;
      const ceiling = floor * 10;
      const suggested = card.current_price || floor;
      return `
        <div class="form-group">
          <label>${escapeHtml(card.name)} — Price</label>
          <div class="input-wrapper">
            <span class="material-icons">payments</span>
            <input type="number" id="bulkPrice_${cardId}" value="${Math.round(suggested)}" min="${Math.round(floor)}" max="${Math.round(ceiling)}" step="1" />
          </div>
          <div style="font-size:11px;color:#999;margin-top:2px;">Min: ${formatPrice(floor)} | Max: ${formatPrice(ceiling)}</div>
        </div>
      `;
    }).join('')}
    <button class="btn-primary" onclick="confirmBulkSell()">List All (${totalFee} PC)</button>
  `;
  document.getElementById('bulkSellModal').classList.add('open');
}

function closeBulkSellModal() { document.getElementById('bulkSellModal').classList.remove('open'); }

async function confirmBulkSell() {
  const b = getBalances();
  const totalFee = APP.bulkSelected.length * CONFIG.LISTING_COIN_FEE;
  if (b.coins < totalFee) { showToast('Need ' + totalFee + ' PC', 'error'); return; }

  const prices = {};
  for (const cardId of APP.bulkSelected) {
    const input = document.getElementById('bulkPrice_' + cardId);
    const card = APP.cards.find(c => c.id === cardId);
    if (!input || !card) continue;
    const price = parseFloat(input.value);
    const floor = card.original_price || card.current_price || 0;
    const ceiling = floor * 10;
    if (!price || price < floor || price > ceiling) {
      showToast('Invalid price for ' + card.name, 'error');
      return;
    }
    prices[cardId] = price;
  }

  showLoading('Listing...');
  try {
    if (isDemo()) {
      Demo.update(s => {
        s.coins -= totalFee;
        s.listings = s.listings || [];
        const acc = Demo.account();
        for (const cardId of APP.bulkSelected) {
          s.inventory[cardId] = (s.inventory[cardId] || 0) - 1;
          if (s.inventory[cardId] <= 0) delete s.inventory[cardId];
          s.listings.push({
            id: generateId('l'),
            sellerId: acc.id,
            cardId,
            price: prices[cardId],
            units: 1,
            remaining: 1,
            createdAt: Date.now(),
            status: 'active',
            coinFeePaid: CONFIG.LISTING_COIN_FEE
          });
        }
      });
    } else {
      for (const cardId of APP.bulkSelected) {
        await getSupabase().functions.invoke('create-listing', { body: { cardId, price: prices[cardId] } });
      }
      await refreshLiveProfile();
    }
    APP.bulkSelected = [];
    updateBulkSellBar();
    closeBulkSellModal();
    loadInventory();
    loadTrade();
    loadDashboard();
    showToast('All listed!', 'success');
    playSound('reward');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// TRADE
// ============================================================
function loadTrade() {
  const b = getBalances();
  const depEl = document.getElementById('tradeDepositBal');
  if (depEl) depEl.textContent = formatPrice(b.deposit);
  const earnEl = document.getElementById('tradeEarningsBal');
  if (earnEl) earnEl.textContent = formatPrice(b.earnings);
  const coinEl = document.getElementById('tradeCoins');
  if (coinEl) coinEl.textContent = String(b.coins);
  renderTradeBuyListings();
  renderTradeSellListings();
}

function switchTradeTab(tab) {
  APP.tradeTab = tab;
  document.querySelectorAll('#section-trade .tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tradeTab === tab));
  document.querySelectorAll('#section-trade .tab-content').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('trade-' + tab);
  if (el) el.classList.add('active');
  playSound('click');
}

function setTradeFilter(f, el) {
  APP.tradeFilter = f;
  document.querySelectorAll('#tradeFilterChips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTradeBuyListings();
}
function filterTradeListings() {
  APP.tradeSearch = (document.getElementById('tradeSearchInput').value || '').toLowerCase();
  renderTradeBuyListings();
}

async function renderTradeBuyListings() {
  const el = document.getElementById('tradeBuyListings');
  if (!el) return;
  let listings = [];
  
  if (isDemo()) {
    listings = Demo.state()?.listings || [];
  } else {
    const { data } = await getSupabase().from('listings').select('*').eq('status', 'active').gt('remaining', 0);
    listings = data || [];
  }

  listings = listings.filter(l => l.status === 'active' && l.remaining > 0);
  const inv = getInventory();
  let html = '';
  listings.forEach(l => {
    const card = APP.cards.find(c => c.id === (l.cardId || l.card_id));
    if (!card) return;
    if (APP.tradeSearch && !card.name.toLowerCase().includes(APP.tradeSearch)) return;
    if (APP.tradeFilter !== 'all') {
      const status = card.is_vip ? 'vip' : (card.status || 'neutral');
      if (status !== APP.tradeFilter) return;
    }
    const owned = inv[card.id] > 0;
    html += `
      <div class="listing-item">
        <div class="info">
          <div class="name">${escapeHtml(card.name)}</div>
          <div class="price">${formatPrice(l.current_effective_price || l.price)}</div>
          <div class="units">${l.remaining}/${l.units} units</div>
        </div>
        <button class="buy-btn" ${owned ? 'disabled style="background:#ccc;color:#666;"' : ''} onclick="buyFromTrade('${l.id}')">${owned ? 'Owned' : 'Buy'}</button>
      </div>`;
  });
  el.innerHTML = html || '<div class="empty-state"><span class="material-icons">store</span><p>No listings available</p></div>';
}

async function renderTradeSellListings() {
  const el = document.getElementById('tradeSellListings');
  if (!el) return;
  let mine = [];
  
  if (isDemo()) {
    const acc = Demo.account();
    mine = (Demo.state()?.listings || []).filter(l => l.sellerId === acc?.id && l.status === 'active');
  } else {
    const { data } = await getSupabase().from('listings').select('*').eq('status', 'active').eq('seller_id', APP.user.id);
    mine = data || [];
  }

  if (!mine.length) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons">sell</span><p>No active listings</p><button class="btn-action" style="max-width:200px;margin:16px auto 0;" onclick="navigateTo(\'inventory\')">Go to Inventory</button></div>';
    return;
  }
  el.innerHTML = mine.map(l => {
    const card = APP.cards.find(c => c.id === (l.cardId || l.card_id)) || { name: 'Card' };
    return `<div class="listing-item"><div class="info"><div class="name">${escapeHtml(card.name)}</div><div class="price">${formatPrice(l.price)}</div><div class="units">${l.remaining}/${l.units}</div></div><button class="buy-btn sell" onclick="cancelListing('${l.id}')">Cancel</button></div>`;
  }).join('');
}

async function buyFromTrade(listingId) {
  if (!confirm('Buy this card?')) return;
  showLoading('Purchasing...');
  try {
    if (isDemo()) {
      const b = getBalances();
      const listing = (Demo.state()?.listings || []).find(l => l.id === listingId);
      if (!listing) throw new Error('Listing gone');
      if (b.deposit < listing.price) throw new Error('Insufficient deposit balance');
      
      Demo.update(s => {
        s.depositBalance -= listing.price;
        listing.remaining -= 1;
        if (listing.remaining <= 0) listing.status = 'sold_out';
        s.inventory = s.inventory || {};
        s.inventory[listing.cardId] = (s.inventory[listing.cardId] || 0) + 1;
        s.ownedEver = s.ownedEver || {};
        s.ownedEver[listing.cardId] = true;
        s.totalTrades = (s.totalTrades || 0) + 1;
      });
      loadTrade();
      loadDashboard();
    } else {
      const { data, error } = await getSupabase().functions.invoke('buy-from-trade', { body: { listingId } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      await refreshLiveProfile();
      loadTrade();
      loadDashboard();
    }
    showToast('Purchased!', 'success');
    playSound('reward');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function cancelListing(listingId) {
  if (!confirm('Cancel listing? Card returns to inventory.')) return;
  showLoading('Cancelling...');
  try {
    if (isDemo()) {
      Demo.update(s => {
        const l = (s.listings || []).find(x => x.id === listingId);
        if (!l) return;
        l.status = 'cancelled';
        s.inventory = s.inventory || {};
        s.inventory[l.cardId] = (s.inventory[l.cardId] || 0) + 1;
      });
      loadTrade();
      loadInventory();
    } else {
      const { data, error } = await getSupabase().functions.invoke('cancel-listing', { body: { listingId } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      await refreshLiveProfile();
      loadTrade();
      loadInventory();
    }
    showToast('Cancelled', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// INVENTORY
// ============================================================
function loadInventory() {
  renderInventoryFull();
  updateBulkSellBar();
}

function renderInventoryFull() {
  const grid = document.getElementById('inventoryFullGrid');
  if (!grid) return;
  const inv = getInventory();
  let ids = Object.keys(inv).filter(id => inv[id] > 0);
  if (APP.inventorySearch) {
    ids = ids.filter(id => {
      const c = APP.cards.find(x => x.id === id);
      return c && c.name.toLowerCase().includes(APP.inventorySearch);
    });
  }
  if (!ids.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="material-icons">inbox</span><p>No cards in inventory</p></div>';
    const cnt = document.getElementById('inventoryCount');
    if (cnt) cnt.textContent = '0 cards';
    return;
  }
  const cnt = document.getElementById('inventoryCount');
  if (cnt) cnt.textContent = ids.length + ' cards';
  grid.innerHTML = ids.map(id => {
    const c = APP.cards.find(x => x.id === id);
    return c ? renderCardTile(c, inv) : '';
  }).join('');
}

function filterInventory() {
  APP.inventorySearch = (document.getElementById('inventorySearchInput').value || '').toLowerCase();
  renderInventoryFull();
}

// ============================================================
// MINING
// ============================================================
async function loadMining() {
  if (!isDemo()) {
    // LIVE MODE MINING
    const sb = getSupabase();
    if (!sb) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await sb.from('mining_sessions').select('*').eq('user_id', APP.user.id).eq('session_date', today);
    const sessionsUsed = data ? data.length : 0;
    
    document.getElementById('miningSessionsUsed').textContent = sessionsUsed + '/2';
    document.getElementById('miningStartBtn').disabled = sessionsUsed >= 2;
    document.getElementById('miningCostInfo').textContent = sessionsUsed >= 2 ? 'Daily limit reached.' : 'Select 3 cards from inventory to mine.';
    
    // Clear live slots
    ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:12px;"><span class="material-icons" style="font-size:28px;color:#ddd;display:block;margin-bottom:4px;">add</span>Empty</div>';
        el.dataset.cardId = '';
      }
    });
    return;
  }
  
  const s = Demo.state();
  const today = new Date().toDateString();
  if (s.miningLastReset !== today) {
    Demo.update(st => { st.miningToday = 0; st.miningLastReset = today; });
  }
  renderMiningUI();
}

function renderMiningUI() {
  const s = Demo.state();
  const sessions = s.miningToday || 0;
  const usedEl = document.getElementById('miningSessionsUsed');
  if (usedEl) usedEl.textContent = sessions + '/2';
  const earnEl = document.getElementById('miningTotalEarned');
  if (earnEl) earnEl.textContent = formatPrice(s.miningEarnedToday || 0);
  const nextEl = document.getElementById('miningNextTime');
  if (nextEl) nextEl.textContent = sessions >= 2 ? 'Done' : 'Ready';

  ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const card = s.miningSlots?.[i];
    if (card) {
      el.innerHTML = `<div class="card-image"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /></div><div class="card-name">${escapeHtml(card.name)}</div>`;
      el.style.opacity = 1;
    } else {
      el.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:12px;"><span class="material-icons" style="font-size:28px;color:#ddd;display:block;margin-bottom:4px;">add</span>Empty</div>';
      el.style.opacity = 0.6;
    }
  });

  const btn = document.getElementById('miningStartBtn');
  const ready = s.miningSlots?.length === 3 && sessions < 2;
  if (btn) {
    btn.disabled = !ready;
    btn.style.background = ready ? '#FFD700' : '#888';
  }
  const infoEl = document.getElementById('miningCostInfo');
  if (infoEl) {
    infoEl.textContent = ready ? 'All 3 cards ready.' : (sessions >= 2 ? 'Daily limit reached.' : 'Tap slots to add cards.');
  }
}

function tapMiningSlot() {
  const inv = getInventory();
  const avail = Object.keys(inv).filter(id => inv[id] > 0);
  if (!avail.length) { showToast('No cards in inventory', 'info'); return; }
  
  if (isDemo()) {
    const s = Demo.state(); s.miningSlots = s.miningSlots || [];
    const nextId = avail.find(id => !s.miningSlots.find(c => c.id === id));
    if (!nextId) { showToast('All cards added', 'info'); return; }
    const picked = APP.cards.find(c => c.id === nextId); if (picked) s.miningSlots.push(picked);
    renderMiningUI();
  } else {
    // LIVE MODE SLOT SELECTION
    const emptySlot = ['miningSlot1', 'miningSlot2', 'miningSlot3'].find(id => !document.getElementById(id).dataset.cardId);
    if (!emptySlot) { showToast('All 3 slots full', 'info'); return; }
    
    const nextId = avail.find(id => !['miningSlot1', 'miningSlot2', 'miningSlot3'].some(s => document.getElementById(s).dataset.cardId === id));
    if (!nextId) { showToast('All available cards added', 'info'); return; }
    
    const picked = APP.cards.find(c => c.id === nextId);
    if (picked) {
      const el = document.getElementById(emptySlot);
      el.innerHTML = `<div class="card-image"><img src="${escapeHtml(picked.image_url || 'https://i.imgur.com/9aLmHyS.png')}" /></div><div class="card-name">${escapeHtml(picked.name)}</div>`;
      el.dataset.cardId = picked.id;
      el.style.opacity = 1;
      
      const filled = ['miningSlot1', 'miningSlot2', 'miningSlot3'].filter(id => document.getElementById(id).dataset.cardId).length;
      const btn = document.getElementById('miningStartBtn');
      if (btn) { btn.disabled = filled < 3; btn.style.background = filled === 3 ? '#FFD700' : '#888'; }
    }
  }
}

async function startMining() {
  if (!isDemo()) {
    // LIVE MODE MINING
    const slots = ['miningSlot1', 'miningSlot2', 'miningSlot3'].map(id => document.getElementById(id).dataset.cardId).filter(Boolean);
    if (slots.length !== 3) { showToast('Please select 3 cards', 'error'); return; }
    if (!confirm('Mine these 3 cards? They will be permanently burned.')) return;
    
    showLoading('Mining...');
    try {
      const { data, error } = await getSupabase().functions.invoke('mining', { body: { cardIds: slots } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      
      showToast('Mined successfully!', 'success');
      playSound('reward');
      const resEl = document.getElementById('miningResult'); const amtEl = document.getElementById('miningResultAmount');
      if (resEl) resEl.style.display = 'block'; if (amtEl) amtEl.textContent = formatPrice(data.reward);
      setTimeout(() => { if (resEl) resEl.style.display = 'none'; }, 5000);
      
      await refreshLiveProfile();
      loadMining();
      updateBalanceUI();
    } catch (err) {
      // This is where the backend message "You cannot mine Trade-bought cards" will appear
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
    return;
  }
  
  const s = Demo.state();
  if (!s.miningSlots || s.miningSlots.length !== 3) { showToast('Need 3 cards', 'error'); return; }
  if (s.miningToday >= 2) { showToast('Daily limit', 'error'); return; }
  const total = s.miningSlots.reduce((sum, c) => sum + (c.current_price || c.original_price || 0), 0);
  const reward = Math.round(total * 0.7);
  if (!confirm('Mine for ' + formatPrice(reward) + '? Cards will be burned.')) return;

  Demo.update(st => {
    st.miningSlots.forEach(c => {
      st.inventory[c.id] = (st.inventory[c.id] || 0) - 1;
      if (st.inventory[c.id] <= 0) delete st.inventory[c.id];
    });
    st.earningsBalance += reward;
    st.lifetimeEarned += reward;
    st.miningToday = (st.miningToday || 0) + 1;
    st.miningEarnedToday = (st.miningEarnedToday || 0) + reward;
    st.miningSlots = [];
  });
  Demo.notify('Mining Reward', 'You earned ' + formatPrice(reward), 'reward');
  const resEl = document.getElementById('miningResult');
  const amtEl = document.getElementById('miningResultAmount');
  if (resEl) resEl.style.display = 'block';
  if (amtEl) amtEl.textContent = formatPrice(reward);
  playSound('reward');
  renderMiningUI();
  updateBalanceUI();
  setTimeout(() => { if (resEl) resEl.style.display = 'none'; }, 5000);
}

// ============================================================
// DAILY COMBO
// ============================================================
async function loadDailyCombo() {
  if (!isDemo()) {
    // LIVE MODE COMBO
    const sb = getSupabase();
    if (!sb) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: combos } = await sb.from('daily_combo').select('*').eq('user_id', APP.user.id).eq('combo_date', today).limit(1);
    
    // Add Progress Bar for Live Mode
    const progEl = document.getElementById('comboProgress');
    if (progEl) {
      progEl.innerHTML = Array.from({ length: 5 }, (_, i) => {
        return `<div style="width:36px;height:36px;border-radius:50%;border:2px solid #ddd;background:transparent;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;"></div>`;
      }).join('');
    }

    if (!combos || combos.length === 0) {
      document.getElementById('comboCardArea').innerHTML = '<div class="empty-state"><p>No combo assigned today.</p></div>';
      return;
    }
    
    const combo = combos[0];
    const card = APP.cards.find(c => c.id === combo.assigned_card_id);
    document.getElementById('comboDpBalance').textContent = String(APP.profile?.diamond_points || 0);
    document.getElementById('comboDpNeeded').textContent = String(dpRequiredForWithdrawal(20000));

    if (card) {
      document.getElementById('comboCardArea').innerHTML = `<div style="display:flex;gap:12px;align-items:center;"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:80px;height:106px;border-radius:10px;object-fit:cover;" /><div><div style="font-weight:700;font-size:15px;">${escapeHtml(card.name)}</div><div style="font-size:12px;color:#666;">${formatPrice(card.current_price || card.original_price || 0)}</div></div></div>`;
      
      const inv = getInventory(); const owned = inv[combo.assigned_card_id] > 0;
      const action = document.getElementById('comboActionArea');
      
      if (combo.completed) {
        action.innerHTML = '<div style="text-align:center;padding:16px;background:#22C55E;color:#fff;border-radius:12px;font-weight:700;">Completed Today</div>';
      } else if (owned) {
        action.innerHTML = `<button class="btn-primary" onclick="completeDailyCombo('${combo.id}')">Complete Combo (+12 DP)</button>`;
      } else {
        action.innerHTML = `<button class="btn-primary" onclick="navigateTo('trade')">Find in Trade</button>`;
      }
    }
    return;
  }

  const s = Demo.state();
  const dpEl = document.getElementById('comboDpBalance');
  if (dpEl) dpEl.textContent = String(s.diamondPoints || 0);
  const streakEl = document.getElementById('comboStreak');
  if (streakEl) streakEl.textContent = String(s.comboStreak || 0);
  const dpTodayEl = document.getElementById('comboDpToday');
  if (dpTodayEl) dpTodayEl.textContent = String(s.dpToday || 0);
  const dpNeedEl = document.getElementById('comboDpNeeded');
  if (dpNeedEl) dpNeedEl.textContent = String(dpRequiredForWithdrawal(20000));

  const progEl = document.getElementById('comboProgress');
  if (progEl) {
    progEl.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const done = i < (s.comboStreak || 0);
      return `<div style="width:36px;height:36px;border-radius:50%;border:2px solid ${done ? '#22C55E' : '#ddd'};background:${done ? '#22C55E' : 'transparent'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">${done ? '✓' : ''}</div>`;
    }).join('');
  }

  const today = new Date().toDateString();
  const combo = s.dailyCombo || {};
  if (!combo.assignedCardId || combo.date !== today) {
    const inv = getInventory();
    const eligible = APP.cards.filter(c => !inv[c.id] && c.is_active);
    if (!eligible.length) {
      const el = document.getElementById('comboCardArea');
      if (el) el.innerHTML = '<div class="empty-state"><p>No eligible cards today</p></div>';
      return;
    }
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    Demo.update(st => { st.dailyCombo = { assignedCardId: pick.id, date: today, completed: false }; });
    loadDailyCombo();
    return;
  }

  const card = APP.cards.find(c => c.id === combo.assignedCardId);
  if (!card) {
    const el = document.getElementById('comboCardArea');
    if (el) el.innerHTML = '<div class="empty-state"><p>Card unavailable</p></div>';
    return;
  }

  const cardArea = document.getElementById('comboCardArea');
  if (cardArea) {
    cardArea.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:80px;height:106px;border-radius:10px;object-fit:cover;" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
        <div>
          <div style="font-weight:700;font-size:15px;">${escapeHtml(card.name)}</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">${formatPrice(card.current_price || card.original_price || 0)}</div>
        </div>
      </div>`;
  }

  const inv = getInventory();
  const owned = inv[combo.assignedCardId] > 0;
  const action = document.getElementById('comboActionArea');
  if (!action) return;
  if (combo.completed) {
    action.innerHTML = '<div style="text-align:center;padding:16px;background:#22C55E;color:#fff;border-radius:12px;font-weight:700;">Completed Today</div>';
  } else if (owned) {
    action.innerHTML = `<button class="btn-primary" onclick="completeDailyCombo()">Complete Combo (+12 DP)</button>`;
  } else {
    action.innerHTML = `<button class="btn-primary" onclick="navigateTo('trade')">Find in Trade</button>`;
  }
}

async function completeDailyCombo(comboId) {
  if (!isDemo()) {
    // LIVE MODE COMBO
    showLoading('Completing combo...');
    try {
      const { data, error } = await getSupabase().functions.invoke('daily-combo', { body: { action: 'complete', comboId } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      
      showToast(`Combo complete! Earned ${data.total_dp} DP`, 'success');
      playSound('reward');
      await refreshLiveProfile();
      loadDailyCombo();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
    return;
  }
  
  const s = Demo.state();
  if (!s.dailyCombo || s.dailyCombo.completed) return;
  Demo.update(st => {
    st.dailyCombo.completed = true;
    st.diamondPoints = (st.diamondPoints || 0) + 12;
    st.dpToday = (st.dpToday || 0) + 12;
    st.comboStreak = (st.comboStreak || 0) + 1;
    if (st.comboStreak >= 5) {
      st.diamondPoints += 40;
      st.dpToday += 40;
      st.comboStreak = 0;
    }
  });
  Demo.notify('Daily Combo', 'You earned 12 DP', 'reward');
  showToast('+12 DP', 'success');
  playSound('reward');
  loadDailyCombo();
}

// ============================================================
// WALLET
// ============================================================
function loadWallet() {
  const b = getBalances();
  const elE = document.getElementById('walletEarnings');
  if (elE) elE.textContent = formatPrice(b.earnings);
  const elD = document.getElementById('walletDeposit');
  if (elD) elD.textContent = formatPrice(b.deposit);
  const elC = document.getElementById('walletCoins');
  if (elC) elC.textContent = String(b.coins);
  const elDp = document.getElementById('walletDp');
  if (elDp) elDp.textContent = String(b.dp);
  const elS = document.getElementById('walletStage');
  if (elS) elS.textContent = getStageConfig(getStage()).name;
  renderBankDetails();
  renderWalletHistory();
}

function renderBankDetails() {
  const el = document.getElementById('walletBankDetails');
  if (!el) return;
  if (isDemo()) {
    const s = Demo.state();
    if (s?.bankDetails?.accountNumber) {
      el.innerHTML = `<div style="line-height:1.6;"><b>${escapeHtml(s.bankDetails.bank)}</b><br/>${escapeHtml(s.bankDetails.accountName)}<br/>${escapeHtml(s.bankDetails.accountNumber)}</div>`;
    } else {
      el.textContent = 'No bank details saved.';
    }
  } else {
    el.innerHTML = APP.profile?.bank_details ? `<div style="line-height:1.6;"><b>${escapeHtml(APP.profile.bank_details.bank)}</b><br/>${escapeHtml(APP.profile.bank_details.accountName)}<br/>${escapeHtml(APP.profile.bank_details.accountNumber)}</div>` : 'No bank details saved.';
  }
}

async function renderWalletHistory() {
  const el = document.getElementById('walletHistory');
  if (!el) return;
  
  if (!isDemo()) {
    // LIVE MODE TRANSACTIONS
    const { data } = await getSupabase().from('transactions').select('*').eq('user_id', APP.user.id).order('created_at', { ascending: false }).limit(10);
    if (!data || !data.length) { el.textContent = 'No recent transactions.'; return; }
    el.innerHTML = data.map(tx => `<div class="bank-info" style="padding:8px 0;"><span class="label" style="text-transform:capitalize;">${escapeHtml(tx.type.replace('_', ' '))}</span><span class="value">${tx.amount ? formatPrice(Math.abs(tx.amount)) : '—'}</span></div>`).join('');
    return;
  }
  
  const txs = Demo.state()?.transactions || [];
  if (!txs.length) { el.textContent = 'No recent transactions.'; return; }
  el.innerHTML = txs.slice(0, 10).map(tx => `
    <div class="bank-info" style="padding:8px 0;">
      <span class="label">${escapeHtml(tx.type || 'tx')}</span>
      <span class="value">${tx.amount ? formatPrice(Math.abs(tx.amount)) : tx.cardName || '—'}</span>
    </div>`).join('');
}

function openDepositModal() {
  document.getElementById('depositModal').classList.add('open');
  APP.paymentMethod = null;
  const hint = document.getElementById('paymentMethodHint');
  if (hint) hint.textContent = 'Select a payment method';
  playSound('click');
}
function closeDepositModal() { document.getElementById('depositModal').classList.remove('open'); }

function selectPaymentMethod(m) {
  APP.paymentMethod = m;
  const hint = document.getElementById('paymentMethodHint');
  if (hint) hint.textContent = 'Method: ' + m.charAt(0).toUpperCase() + m.slice(1);
  playSound('click');
}

async function submitDeposit() {
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!amount || amount < CONFIG.MIN_DEPOSIT_NGN) { showToast('Minimum deposit is ₦20,000', 'error'); return; }
  if (!APP.paymentMethod) { showToast('Select payment method', 'error'); return; }

  if (isDemo()) {
    Demo.update(s => {
      s.depositBalance += amount;
      if (s.checklist) s.checklist.deposit = true;
    });
    Demo.log({ type: 'deposit', amount, method: APP.paymentMethod });
    Demo.notify('Deposit', 'Demo deposit of ' + formatPrice(amount) + ' completed', 'info');
    showToast('Demo deposit successful (no real money)', 'success');
    playSound('reward');
    closeDepositModal();
    loadWallet();
    loadDashboard();
  } else {
    showLoading('Initializing payment...');
    try {
      const { data, error } = await getSupabase().functions.invoke('initialize-deposit', { body: { amount, gateway: APP.paymentMethod } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      window.location.href = data.url; // Redirect to Paystack/Flutterwave checkout
    } catch (err) {
      showToast(err.message, 'error');
      hideLoading();
    }
  }
}

function openWithdrawModal() {
  document.getElementById('withdrawModal').classList.add('open');
  updateWithdrawInfo();
  playSound('click');
}
function closeWithdrawModal() { document.getElementById('withdrawModal').classList.remove('open'); }

function updateWithdrawInfo() {
  const b = getBalances();
  const el = document.getElementById('withdrawInfo');
  if (!el) return;
  const amt = parseFloat(document.getElementById('withdrawAmount')?.value) || 0;
  const dpNeeded = amt > 0 ? dpRequiredForWithdrawal(amt) : 0;
  el.innerHTML = `
    <div>Earnings: <b>${formatPrice(b.earnings)}</b></div>
    <div>DP: <b>${b.dp}</b>${amt > 0 ? ' / ' + dpNeeded + ' needed' : ''}</div>
    <div style="margin-top:4px;color:${b.earnings >= amt ? '#22C55E' : '#FF4444'};">
      ${amt >= 20000 ? (b.earnings >= amt ? 'Ready' : 'Insufficient balance') : 'Minimum ' + formatPrice(20000)}
    </div>`;
}

function toggleBonusWithdraw() {
  const use = document.getElementById('useBonusCard').checked;
  const amtInput = document.getElementById('withdrawAmount');
  if (amtInput) {
    amtInput.min = use ? 5000 : 20000;
    amtInput.placeholder = use ? 'Min ₦5,000' : 'Min ₦20,000';
  }
}

async function submitWithdraw() {
  const b = getBalances();
  const amt = parseFloat(document.getElementById('withdrawAmount').value);
  const pin = document.getElementById('withdrawPin').value;
  const useBonus = document.getElementById('useBonusCard').checked;

  if (!isValidPin(pin)) { showToast('PIN must be 4 digits', 'error'); return; }
  if (!amt || amt < (useBonus ? 5000 : 20000)) { showToast('Invalid amount', 'error'); return; }
  
  if (isDemo()) {
    if (b.earnings < amt) { showToast('Insufficient earnings', 'error'); return; }
    const dpNeeded = dpRequiredForWithdrawal(amt);
    if (b.dp < dpNeeded) { showToast('Need ' + dpNeeded + ' DP. You have ' + b.dp, 'error'); return; }
    const s = Demo.state();
    if (s.pin && s.pin !== pin) { showToast('Incorrect PIN', 'error'); return; }

    Demo.update(st => {
      st.earningsBalance -= amt;
      st.lifetimeWithdrawn += amt;
      st.diamondPoints -= dpNeeded;
    });
    Demo.log({ type: 'withdraw', amount: amt });
    Demo.notify('Withdrawal', 'Request for ' + formatPrice(amt) + ' submitted', 'info');
    showToast('Withdrawal requested (demo)', 'success');
    playSound('reward');
    closeWithdrawModal();
    loadWallet();
    loadDashboard();
  } else {
    showLoading('Processing withdrawal...');
    try {
      const { data, error } = await getSupabase().functions.invoke('withdrawal', { 
        body: { amount: amt, pin, useBonusCard: useBonus } 
      });
      if (error || data?.error) throw new Error(data?.error || error.message);
      showToast('Withdrawal requested successfully', 'success');
      playSound('reward');
      await refreshLiveProfile();
      closeWithdrawModal();
      loadWallet();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }
}

function openBankDetailsModal() {
  const s = isDemo() ? Demo.state() : null;
  const bankDetails = isDemo() ? s?.bankDetails : APP.profile?.bank_details;
  
  if (bankDetails) {
    const bn = document.getElementById('bankName');
    const an = document.getElementById('bankAccountName');
    const num = document.getElementById('bankAccountNumber');
    if (bn) bn.value = bankDetails.bank || '';
    if (an) an.value = bankDetails.accountName || '';
    if (num) num.value = bankDetails.accountNumber || '';
  }
  document.getElementById('bankModal').classList.add('open');
}
function closeBankModal() { document.getElementById('bankModal').classList.remove('open'); }

async function saveBankDetails() {
  const bank = document.getElementById('bankName').value.trim();
  const name = document.getElementById('bankAccountName').value.trim();
  const num = document.getElementById('bankAccountNumber').value.trim();
  const conf = document.getElementById('bankAccountNumberConfirm').value.trim();
  if (!bank || !name || !num) { showToast('All fields required', 'error'); return; }
  if (num !== conf) { showToast('Numbers do not match', 'error'); return; }
  if (num.length !== 10) { showToast('Must be 10 digits', 'error'); return; }

  if (isDemo()) {
    Demo.update(s => { s.bankDetails = { bank, accountName: name, accountNumber: num }; });
    showToast('Bank saved', 'success');
    closeBankModal();
    renderBankDetails();
  } else {
    showLoading('Saving...');
    try {
      const { error } = await getSupabase().from('users').update({ bank_details: { bank, accountName: name, accountNumber: num } }).eq('id', APP.user.id);
      if (error) throw error;
      await refreshLiveProfile();
      showToast('Bank saved', 'success');
      closeBankModal();
      renderBankDetails();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }
}

// ============================================================
// PROFILE
// ============================================================
function loadProfile() {
  if (isDemo()) {
    const a = Demo.account();
    if (!a) return;
    const s = a.state;
    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = a.fullName || 'User';
    const unEl = document.getElementById('profileUsername');
    if (unEl) unEl.textContent = '@' + (a.username || 'user');
    const stageEl = document.getElementById('profileStage');
    if (stageEl) stageEl.textContent = getStageConfig(getStage()).name;
    const joinedEl = document.getElementById('profileJoined');
    if (joinedEl) joinedEl.textContent = 'Joined: ' + formatDate(a.createdAt);
    const earnEl = document.getElementById('profileLifetimeEarned');
    if (earnEl) earnEl.textContent = formatPrice(s.lifetimeEarned || 0);
    const dpEl = document.getElementById('profileDp');
    if (dpEl) dpEl.textContent = String(s.diamondPoints || 0);
    const coinEl = document.getElementById('profileCoins');
    if (coinEl) coinEl.textContent = String(s.coins || 0);
    const tradeEl = document.getElementById('profileTrades');
    if (tradeEl) tradeEl.textContent = String(s.totalTrades || 0);
    const phoneEl = document.getElementById('profilePhone');
    if (phoneEl) phoneEl.value = a.phone || '';
    const addrEl = document.getElementById('profileAddress');
    if (addrEl) addrEl.value = a.address || '';
  } else {
    const p = APP.profile;
    if (!p) return;
    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = p.full_name || 'User';
    const unEl = document.getElementById('profileUsername');
    if (unEl) unEl.textContent = '@' + (p.username || 'user');
    const stageEl = document.getElementById('profileStage');
    if (stageEl) stageEl.textContent = getStageConfig(p.stage || getStage()).name;
    const joinedEl = document.getElementById('profileJoined');
    if (joinedEl) joinedEl.textContent = 'Joined: ' + formatDate(p.created_at);
    const earnEl = document.getElementById('profileLifetimeEarned');
    if (earnEl) earnEl.textContent = formatPrice(p.lifetime_earned || 0);
    const dpEl = document.getElementById('profileDp');
    if (dpEl) dpEl.textContent = String(p.diamond_points || 0);
    const coinEl = document.getElementById('profileCoins');
    if (coinEl) coinEl.textContent = String(p.coins || 0);
    const tradeEl = document.getElementById('profileTrades');
    if (tradeEl) tradeEl.textContent = String(p.total_trades || 0);
    const phoneEl = document.getElementById('profilePhone');
    if (phoneEl) phoneEl.value = p.phone || '';
    const addrEl = document.getElementById('profileAddress');
    if (addrEl) addrEl.value = p.address || '';
  }
}

async function saveProfile() {
  const phone = document.getElementById('profilePhone').value.trim();
  const address = document.getElementById('profileAddress').value.trim();
  
  if (isDemo()) {
    const a = Demo.account();
    demoUpdateAccount(a.email, { phone, address });
    showToast('Saved', 'success');
  } else {
    showLoading('Saving...');
    try {
      const { error } = await getSupabase().from('users').update({ phone, address }).eq('id', APP.user.id);
      if (error) throw error;
      await refreshLiveProfile();
      showToast('Saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  APP.mode = getMode();
  document.querySelectorAll('#section-settings .mode-switch button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === APP.mode);
  });
  const dm = document.getElementById('settingsDarkToggle');
  if (dm) dm.classList.toggle('active', document.body.classList.contains('dark-mode'));
  const snd = document.getElementById('settingsSoundToggle');
  if (snd) snd.classList.toggle('active', isSoundEnabled());

  const helper = document.getElementById('modeHelperText');
  if (helper) {
    helper.textContent = APP.mode === 'demo' ? 'Demo mode: local data only' : 'Live mode: real accounts';
  }

  const langEl = document.getElementById('settingsLanguage');
  if (langEl) {
    const saved = localStorage.getItem('pandacard_language') || 'en';
    langEl.textContent = languageName(saved);
  }

  // INJECT PUSH NOTIFICATION BUTTON
  const settingsContainer = document.querySelector('#section-settings .content-area');
  if (settingsContainer && !document.getElementById('pushToggleBtn')) {
    const pushSection = document.createElement('div');
    pushSection.className = 'section';
    pushSection.innerHTML = `
      <div class="section-title"><span class="material-icons">notifications_active</span> Alerts</div>
      <p style="font-size:12px;color:#999;margin-bottom:12px;">Get notified when your cards sell or when demand is high.</p>
      <button id="pushToggleBtn" class="btn-action" onclick="subscribeUserToPush()">Enable Push Notifications</button>
    `;
    settingsContainer.appendChild(pushSection);
  }
}

function switchAppMode(mode) {
  if (mode === 'live' && !APP.livePublished) { showToast('Live mode not available', 'info'); return; }
  if (mode === APP.mode) return;
  if (!confirm('Switch to ' + mode + ' mode?')) return;
  setMode(mode);
  showToast('Switching...', 'info');
  setTimeout(() => { window.location.href = 'auth.html'; }, 500);
}

function toggleSound() {
  const v = !isSoundEnabled();
  localStorage.setItem(STORAGE.SOUND, String(v));
  const el = document.getElementById('settingsSoundToggle');
  if (el) el.classList.toggle('active', v);
  showToast(v ? 'Sound on' : 'Sound off', 'success');
}

function openPinModal() { document.getElementById('pinModal').classList.add('open'); }
function closePinModal() { document.getElementById('pinModal').classList.remove('open'); }

async function savePin() {
  const newP = document.getElementById('pinNew').value;
  const conf = document.getElementById('pinConfirm').value;
  if (!isValidPin(newP)) { showToast('PIN must be 4 digits', 'error'); return; }
  if (newP !== conf) { showToast('PINs do not match', 'error'); return; }
  
  if (isDemo()) {
    Demo.update(st => { 
      st.pin = newP; 
      if (!st.checklist) st.checklist = {};
      st.checklist.pin = true; // Mark checklist as done
    });
    showToast('PIN saved', 'success');
    closePinModal();
    renderChecklist(); // Refresh dashboard checklist
  } else {
    showLoading('Saving PIN...');
    try {
      const { error } = await getSupabase().from('users').update({ pin_hash: demoHashPassword(newP) }).eq('id', APP.user.id);
      if (error) throw error;
      showToast('PIN saved', 'success');
      closePinModal();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }
}

function openChangePasswordModal() { document.getElementById('changePasswordModal').classList.add('open'); }
function closeChangePasswordModal() { document.getElementById('changePasswordModal').classList.remove('open'); }

async function saveChangePassword() {
  const cur = document.getElementById('cpCurrent').value;
  const newP = document.getElementById('cpNew').value;
  const conf = document.getElementById('cpConfirm').value;
  const err = passwordError(newP);
  if (err) { showToast(err, 'error'); return; }
  if (newP !== conf) { showToast('Passwords do not match', 'error'); return; }
  
  if (isDemo()) { 
    showToast('Demo password update not supported', 'info'); 
    closeChangePasswordModal(); 
  } else {
    showLoading('Updating...');
    try {
      const { error } = await getSupabase().auth.updateUser({ password: newP });
      if (error) throw error;
      showToast('Password updated', 'success');
      closeChangePasswordModal();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }
}

function openDeleteAccountModal() { document.getElementById('deleteAccountModal').classList.add('open'); }
function closeDeleteAccountModal() { document.getElementById('deleteAccountModal').classList.remove('open'); }

async function confirmDeleteAccount() {
  const v = document.getElementById('deleteConfirmInput').value.trim();
  if (v !== 'DELETE') { showToast('Type DELETE to confirm', 'error'); return; }
  
  if (isDemo()) {
    if (!confirm('Delete demo account?')) return;
    const a = Demo.account();
    if (a) {
      const accounts = demoGetAccounts();
      delete accounts[a.email];
      demoSetAccounts(accounts);
    }
    demoLogout();
    localStorage.removeItem(STORAGE.MODE);
    showToast('Account deleted', 'success');
    setTimeout(() => { window.location.href = 'auth.html'; }, 800);
  } else {
    showToast('Contact support to delete live account.', 'info');
  }
}

// ============================================================
// LANGUAGE (AI translation)
// ============================================================
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'ar', name: 'العربية' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'yo', name: 'Yorùbá' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ig', name: 'Igbo' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'id', name: 'Bahasa Indonesia' }
];
function languageName(code) {
  const l = LANGUAGES.find(x => x.code === code);
  return l ? l.name : 'English';
}

function openLanguageModal() {
  const el = document.getElementById('languageList');
  if (!el) return;
  const current = localStorage.getItem('pandacard_language') || 'en';
  el.innerHTML = LANGUAGES.map(l => `
    <div class="settings-item" onclick="setLanguage('${l.code}')" style="cursor:pointer;">
      <div class="left"><span class="label">${escapeHtml(l.name)}</span></div>
      <div class="right">${current === l.code ? '<span class="material-icons" style="color:#22C55E;">check</span>' : '<span class="material-icons">chevron_right</span>'}</div>
    </div>`).join('');
  document.getElementById('languageModal').classList.add('open');
}
function closeLanguageModal() { document.getElementById('languageModal').classList.remove('open'); }

async function setLanguage(code) {
  localStorage.setItem('pandacard_language', code);
  const langEl = document.getElementById('settingsLanguage');
  if (langEl) langEl.textContent = languageName(code);
  closeLanguageModal();
  if (code === 'en') { showToast('English set', 'success'); return; }
  showToast('Translating...', 'info');
  await translatePageContent(code);
  showToast('Language set to ' + languageName(code), 'success');
}

// ============================================================
// NOTIFICATIONS
// ============================================================
async function loadNotifications() {
  const el = document.getElementById('notificationsList');
  if (!el) return;
  let notifs = [];
  
  if (isDemo()) {
    notifs = Demo.state()?.notifications || [];
  } else {
    // LIVE MODE NOTIFICATIONS
    const { data } = await getSupabase().from('notifications').select('*').eq('user_id', APP.user.id).order('created_at', { ascending: false }).limit(50);
    notifs = (data || []).map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      read: n.read,
      createdAt: new Date(n.created_at).getTime()
    }));
  }
  
  if (!notifs.length) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons">notifications_none</span><p>No notifications yet</p></div>';
    return;
  }
  el.innerHTML = notifs.map(n => `
    <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="icon"><span class="material-icons">notifications</span></div>
      <div class="content">
        <div class="title">${escapeHtml(n.title)}</div>
        <div class="desc">${escapeHtml(n.body)}</div>
        <div class="time">${timeAgo(n.createdAt)}</div>
      </div>
    </div>`).join('');
  
  // Refresh badge count
  updateNotificationBadge();
}

async function markNotifRead(id) {
  if (isDemo()) {
    Demo.update(s => {
      const n = (s.notifications || []).find(x => x.id === id);
      if (n) n.read = true;
    });
    updateNotificationBadge();
    loadNotifications();
  } else {
    await getSupabase().from('notifications').update({ read: true }).eq('id', id);
    loadNotifications();
  }
}

async function markAllNotificationsRead() {
  if (isDemo()) {
    Demo.update(s => { (s.notifications || []).forEach(n => { n.read = true; }); });
    updateNotificationBadge();
    loadNotifications();
    showToast('All read', 'success');
  } else {
    await getSupabase().from('notifications').update({ read: true }).eq('user_id', APP.user.id);
    loadNotifications();
    showToast('All read', 'success');
  }
}

// ============================================================
// REFERRAL
// ============================================================
function loadReferral() {
  if (isDemo()) {
    const a = Demo.account();
    if (!a) return;
    const s = a.state;
    const stage = getStage();
    const rate = 10 + (stage - 1) * 5;
    const codeEl = document.getElementById('referralCode');
    if (codeEl) codeEl.value = a.referralCode || '...';
    const rateEl = document.getElementById('referralRate');
    if (rateEl) rateEl.textContent = rate + ' PC';
    const rate2El = document.getElementById('referralRate2');
    if (rate2El) rate2El.textContent = rate + ' PC';
    const cntEl = document.getElementById('referralCount');
    if (cntEl) cntEl.textContent = String(s.totalReferrals || 0);
    const coinEl = document.getElementById('referralCoinsEarned');
    if (coinEl) coinEl.textContent = String(s.referralCoins || 0);
  } else {
    if (!APP.profile) return;
    const stage = APP.profile.stage || getStage();
    const rate = 10 + (stage - 1) * 5;
    const codeEl = document.getElementById('referralCode');
    if (codeEl) codeEl.value = APP.profile.referral_code || '...';
    const rateEl = document.getElementById('referralRate');
    if (rateEl) rateEl.textContent = rate + ' PC';
    const rate2El = document.getElementById('referralRate2');
    if (rate2El) rate2El.textContent = rate + ' PC';
    const cntEl = document.getElementById('referralCount');
    if (cntEl) cntEl.textContent = String(APP.profile.total_referrals || 0);
    const coinEl = document.getElementById('referralCoinsEarned');
    if (coinEl) coinEl.textContent = '0';
  }
}

function copyReferral() {
  const code = document.getElementById('referralCode').value;
  const link = window.location.origin + '/auth.html?ref=' + code;
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => showToast('Copied', 'success'));
}

function shareReferral() {
  const code = document.getElementById('referralCode').value;
  const link = window.location.origin + '/auth.html?ref=' + code;
  if (navigator.share) navigator.share({ title: 'Panda Card', text: 'Join Panda Card', url: link }).catch(copyReferral);
  else copyReferral();
}

// ============================================================
// ANNOUNCEMENTS + FAQ + CONTACT
// ============================================================
async function loadAnnouncements() {
  const el = document.getElementById('announcementsList');
  const hardcoded = document.getElementById('hardcodedAnnouncement');
  if (!el) return;
  
  try {
    const sb = getSupabase();
    if (!sb) return;

    const { data, error } = await sb
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (data && data.length > 0) {
      if (hardcoded) hardcoded.style.display = 'none'; // Permanently hides it
      
      const dynamicHtml = data.map(a => `
        <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border-left:4px solid #22C55E;">
          <h3 style="margin-bottom:8px;font-size:16px;font-weight:800;">${escapeHtml(a.title)}</h3>
          <p style="font-size:14px;color:#555;line-height:1.6;">${escapeHtml(a.body)}</p>
          <div style="font-size:11px;color:#999;margin-top:12px;">${formatDate(a.created_at)}</div>
        </div>
      `).join('');
      
      el.innerHTML = dynamicHtml;
    }
  } catch (err) {
    console.error('Error loading announcements', err);
  }
}

function loadFAQ() {
  const el = document.getElementById('faqList');
  if (!el) return;
  el.innerHTML = `
    <div class="faq-item"><div class="q"><span class="material-icons">help</span> What is Panda Card?</div><div class="a">A card-trading marketplace where you buy, sell, mine, and trade digital cards.</div></div>
    <div class="faq-item"><div class="q"><span class="material-icons">help</span> How does mining work?</div><div class="a">Burn 3 cards to earn 70% of their value in cash to your earnings balance.</div></div>
    <div class="faq-item"><div class="q"><span class="material-icons">help</span> Minimum deposit?</div><div class="a">₦20,000 or equivalent in your currency.</div></div>
    <div class="faq-item"><div class="q"><span class="material-icons">help</span> How do I withdraw?</div><div class="a">Earnings only. Minimum ₦20,000. 15% fee. Diamond Points required.</div></div>
    <div class="faq-item"><div class="q"><span class="material-icons">help</span> What are Diamond Points?</div><div class="a">Earn from Daily Combo. Required for withdrawals.</div></div>`;
}

async function submitContact() {
  const email = document.getElementById('contactEmail').value.trim();
  const subject = document.getElementById('contactSubject').value.trim();
  const body = document.getElementById('contactBody').value.trim();
  
  if (!email || !subject || !body) { showToast('All fields required', 'error'); return; }

  showLoading('Sending...');
  try {
    const formData = new FormData();
    formData.append("access_key", "a352f138-e157-4470-bd07-f82b97450f60");
    formData.append("email", email);
    formData.append("subject", subject);
    formData.append("message", body);

    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast('Message sent successfully!', 'success');
      document.getElementById('contactEmail').value = '';
      document.getElementById('contactSubject').value = '';
      document.getElementById('contactBody').value = '';
    } else {
      showToast(data.message || 'Failed to send.', 'error');
    }
  } catch (error) {
    showToast('Network error. Try again.', 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// DAILY REWARD
// ============================================================
async function loadDailyReward() {
  if (isDemo()) {
    const s = Demo.state();
    const dr = s.dailyReward || { lastClaim: '', streak: 0, claimHistory: [] };
    const today = new Date().toDateString();
    const claimed = dr.lastClaim === today;
    const btn = document.getElementById('claimRewardBtn');
    if (btn) {
      if (claimed) { btn.disabled = true; btn.textContent = 'Claimed Today'; btn.style.background = '#888'; }
      else { btn.disabled = false; btn.textContent = 'Claim (20 PC)'; btn.style.background = '#FFD700'; }
    }
    const history = dr.claimHistory || [];
    const dc = document.getElementById('rewardDayCount');
    if (dc) dc.textContent = String(history.length);
    const dr2 = document.getElementById('rewardDaysRemaining');
    if (dr2) dr2.textContent = String(90 - history.length);
    const st = document.getElementById('rewardStreak');
    if (st) st.textContent = String(dr.streak || 0);
    const rt = document.getElementById('rewardTotal');
    if (rt) rt.textContent = '20';

    renderRewardCalendar(history, s.createdAt || Date.now(), today);
  } else {
    // LIVE MODE DAILY REWARD
    const btn = document.getElementById('claimRewardBtn');
    const { data: profile } = await getSupabase().from('users').select('last_daily_claim').eq('id', APP.user.id).single();
    const today = new Date().toISOString().slice(0, 10);
    
    if (profile?.last_daily_claim === today) {
      if (btn) { btn.disabled = true; btn.textContent = 'Claimed Today'; btn.style.background = '#888'; }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Claim (20 PC)'; btn.style.background = '#FFD700'; }
    }
    document.getElementById('rewardTotal').textContent = '20';
    document.getElementById('rewardCalendar').innerHTML = '<div style="grid-column:1/-1;text-align:center;font-size:12px;color:#999;">Live history tracked in DB</div>';
  }
}

function renderRewardCalendar(claimHistory, createdAt, todayStr) {
  const container = document.getElementById('rewardCalendar');
  if (!container) return;
  const claimDates = claimHistory.map(h => h.date);
  const startDate = new Date(createdAt);
  startDate.setHours(0, 0, 0, 0);
  const today = new Date(todayStr);
  today.setHours(0, 0, 0, 0);

  let html = '';
  for (let i = 0; i < 90; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const ds = d.toDateString();
    const isClaimed = claimDates.includes(ds);
    const isFuture = d > today;
    const isMissed = !isClaimed && !isFuture && d < today;
    const isToday = ds === todayStr;

    let bg = '#f0f0f5';
    let color = '#ccc';
    let label = '';
    if (isToday) { bg = '#FFD700'; color = '#1A1A2E'; label = '•'; }
    else if (isClaimed) { bg = '#22C55E'; color = '#fff'; label = '✓'; }
    else if (isMissed) { bg = '#FF4444'; color = '#fff'; label = '✕'; }

    html += `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:11px;background:${bg};border-radius:4px;color:${color};font-weight:700;">${label}</div>`;
  }
  container.innerHTML = html;
}

async function claimDailyReward() {
  if (isDemo()) {
    const s = Demo.state();
    const dr = s.dailyReward || { lastClaim: '', streak: 0, claimHistory: [] };
    const today = new Date().toDateString();
    if (dr.lastClaim === today) { showToast('Already claimed', 'info'); return; }
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const newStreak = dr.lastClaim === yest.toDateString() ? (dr.streak || 0) + 1 : 1;

    Demo.update(st => {
      st.coins = (st.coins || 0) + 20;
      st.dailyReward = {
        lastClaim: today,
        streak: newStreak,
        claimHistory: (dr.claimHistory || []).concat([{ date: today, amount: 20 }])
      };
      if (st.checklist) st.checklist.reward = true;
    });
    Demo.notify('Daily Reward', 'You earned 20 PC', 'reward');
    showToast('+20 PC!', 'success');
    playSound('reward');
    loadDailyReward();
    updateBalanceUI();
  } else {
    // LIVE MODE DAILY REWARD
    showLoading('Claiming...');
    try {
      const { data, error } = await getSupabase().functions.invoke('claim-daily-reward');
      if (error || data?.error) throw new Error(data?.error || error.message);
      showToast('+20 PC!', 'success'); playSound('reward');
      await refreshLiveProfile(); loadDailyReward(); updateBalanceUI();
    } catch (err) { showToast(err.message, 'error'); } finally { hideLoading(); }
  }
}

// ============================================================
// BUY COINS
// ============================================================
async function buyCoins(costNgn, coinsAmount) {
  const b = getBalances();
  if (b.deposit < costNgn) {
    showToast('Insufficient deposit. Need ' + formatPrice(costNgn), 'error');
    playSound('error');
    return;
  }
  if (!confirm('Buy ' + coinsAmount + ' PC for ' + formatPrice(costNgn) + '?')) return;

  if (isDemo()) {
    Demo.update(s => {
      s.depositBalance -= costNgn;
      s.coins = (s.coins || 0) + coinsAmount;
    });
    Demo.log({ type: 'coin_buy', amount: costNgn, metadata: { coins: coinsAmount } });
    Demo.notify('Coins Purchased', 'You bought ' + coinsAmount + ' PC', 'info');
    showToast('+' + coinsAmount + ' PC', 'success');
    playSound('reward');
    loadDailyReward();
    updateBalanceUI();
  } else {
    showLoading('Purchasing...');
    try {
      const { data, error } = await getSupabase().functions.invoke('buy-coins', { body: { costNgn, coinsAmount } });
      if (error || data?.error) throw new Error(data?.error || error.message);
      await refreshLiveProfile();
      loadDailyReward();
      updateBalanceUI();
      showToast('+' + coinsAmount + ' PC', 'success');
      playSound('reward');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  }
}

// ============================================================
// WELCOME
// ============================================================
function sendWelcomeNotification() {
  if (!isDemo()) return;
  const s = Demo.state();
  if (!s) return;
  if (s.welcomeSent) return;
  Demo.update(st => { st.welcomeSent = true; });
  Demo.notify(
    'Welcome to Panda Card',
    'You are in Demo Mode. Deposit to explore, buy cards, mine, and earn DP. Everything is simulated — no real money at risk.',
    'info'
  );
}

// ============================================================
// UI UPDATE
// ============================================================
function updateBalanceUI() {
  const b = getBalances();
  const nm = APP.user?.displayName || 'User';
  const un = isDemo() && Demo.account() ? Demo.account().username : 'user';
  const nEl = document.getElementById('sidebarName');
  if (nEl) nEl.textContent = nm;
  const uEl = document.getElementById('sidebarUsername');
  if (uEl) uEl.textContent = '@' + un;
  const eEl = document.getElementById('sidebarEarnings');
  if (eEl) eEl.textContent = formatPrice(b.earnings);
  const dEl = document.getElementById('sidebarDeposit');
  if (dEl) dEl.textContent = formatPrice(b.deposit);
  updateNotificationBadge();
}

// ============================================================
// LIVE PROFILE
// ============================================================
async function refreshLiveProfile() {
  if (!isLive() || !APP.user) return null;
  const sb = getSupabase();
  if (!sb) return null;
  
  // Added marketplace_quantity and trade_quantity to the select
  const { data, error } = await sb.from('users').select('*, inventory(card_id, quantity, marketplace_quantity, trade_quantity)').eq('id', APP.user.id).single();
  
  if (data) {
    const formattedInv = {};
    if (data.inventory) {
      data.inventory.forEach(i => {
        if (i.quantity > 0) {
          formattedInv[i.card_id] = i.quantity;
          // Optional: store this in a separate global object if you want to show it in the UI
        }
      });
    }
    data.inventory = formattedInv;
    
    APP.profile = data;
    window.currentUserProfile = { 
      currency: data.currency || 'NGN', 
      name: data.full_name, 
      username: data.username 
    };
  }
  return data;
}

// ============================================================
// LOAD CARDS
// ============================================================
async function loadCards() {
  try {
    const sb = getSupabase();
    if (!sb) { APP.cards = []; return; }
    const { data, error } = await sb.from('cards').select('*').eq('is_active', true).order('name');
    if (error) throw error;
    APP.cards = data || [];
  } catch (e) {
    console.error('loadCards failed', e);
    APP.cards = [];
  }
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  setTimeout(() => {
    const sp = document.getElementById('splash');
    if (sp) { sp.style.opacity = '0'; setTimeout(() => sp.style.display = 'none', 600); }
  }, 1500);

  APP.mode = getMode();

  // PWA INSTALL LISTENER
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    
    // Update UI notify the user they can install the PWA
    const headerBtn = document.getElementById('pwaInstallBtn');
    if (headerBtn) headerBtn.style.display = 'block';
    const settingsRow = document.getElementById('settingsInstallRow');
    if (settingsRow) settingsRow.style.display = 'block';
  });

  window.addEventListener('appinstalled', (evt) => {
    hideInstallUI();
    showToast('App installed successfully!', 'success');
  });

  try {
    await loadExchangeRates();
    APP.ratesLoaded = true;
  } catch (e) { console.warn('rates failed', e); }

  try { APP.livePublished = await checkLivePublished(); } catch (e) { APP.livePublished = false; }
  applyModeUI();

  const user = await getCurrentUser();
  if (!user) { window.location.href = 'auth.html'; return; }
  APP.user = user;

  // REGISTER SERVICE WORKER FOR PUSH
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }

  if (isDemo()) {
    const a = Demo.account();
    if (!a) { window.location.href = 'auth.html'; return; }
    APP.profile = a;
    window.currentUserProfile = {
      currency: a.currency || 'NGN',
      name: a.fullName,
      username: a.username
    };
    sendWelcomeNotification();
  } else {
    const profile = await refreshLiveProfile();
    APP.profile = profile;
    if (profile) {
      window.currentUserProfile = {
        currency: profile.currency || 'NGN',
        name: profile.full_name,
        username: profile.username
      };
    }
  }

  await loadCards();

  updateBalanceUI();

  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);

  await updateNotificationBadge();
}

document.addEventListener('DOMContentLoaded', boot);

// ============================================================
// EXPORTS
// ============================================================
window.navigateTo = navigateTo;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.switchDashTab = switchDashTab;
window.changePortfolioTime = changePortfolioTime;
window.openCardModal = openCardModal;
window.closeCardModal = closeCardModal;
window.buyFromMarketplace = buyFromMarketplace;
window.switchTradeTab = switchTradeTab;
window.setTradeFilter = setTradeFilter;
window.filterTradeListings = filterTradeListings;
window.buyFromTrade = buyFromTrade;
window.cancelListing = cancelListing;
window.filterInventory = filterInventory;
window.openSellModal = openSellModal;
window.closeSellModal = closeSellModal;
window.confirmSell = confirmSell;
window.openBulkSellModal = openBulkSellModal;
window.closeBulkSellModal = closeBulkSellModal;
window.confirmBulkSell = confirmBulkSell;
window.toggleBulkSelect = toggleBulkSelect;
window.startLongPress = startLongPress;
window.cancelLongPress = cancelLongPress;
window.cardTileClick = cardTileClick;
window.tapMiningSlot = tapMiningSlot;
window.startMining = startMining;
window.completeDailyCombo = completeDailyCombo;
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.selectPaymentMethod = selectPaymentMethod;
window.submitDeposit = submitDeposit;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.toggleBonusWithdraw = toggleBonusWithdraw;
window.submitWithdraw = submitWithdraw;
window.updateWithdrawInfo = updateWithdrawInfo;
window.openBankDetailsModal = openBankDetailsModal;
window.closeBankModal = closeBankModal;
window.saveBankDetails = saveBankDetails;
window.saveProfile = saveProfile;
window.switchAppMode = switchAppMode;
window.toggleSound = toggleSound;
window.openPinModal = openPinModal;
window.closePinModal = closePinModal;
window.savePin = savePin;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.saveChangePassword = saveChangePassword;
window.openDeleteAccountModal = openDeleteAccountModal;
window.closeDeleteAccountModal = closeDeleteAccountModal;
window.confirmDeleteAccount = confirmDeleteAccount;
window.openLanguageModal = openLanguageModal;
window.closeLanguageModal = closeLanguageModal;
window.setLanguage = setLanguage;
window.markNotifRead = markNotifRead;
window.markAllNotificationsRead = markAllNotificationsRead;
window.copyReferral = copyReferral;
window.shareReferral = shareReferral;
window.submitContact = submitContact;
window.claimDailyReward = claimDailyReward;
window.buyCoins = buyCoins;
window.dismissWelcome = dismissWelcome;
window.logout = logout;
window.subscribeUserToPush = subscribeUserToPush;
window.installPWA = installPWA;
