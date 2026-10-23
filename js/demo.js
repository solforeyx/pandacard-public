// ============================================================
// PANDA CARD — DEMO ENGINE (100% LOCAL STORAGE, COMPLETE)
// ============================================================
// Standalone demo app. Uses helpers from config.js + utils.js + auth.js.
// No backend calls except loading the card catalog from Supabase
// (public read — safe, no auth needed).
// ============================================================

const STORAGE_DEMO_ACCOUNTS = 'pandacard_demo_accounts';
const STORAGE_DEMO_SESSION = 'pandacard_demo_session';

const APP = {
  user: null, profile: null, mode: 'demo', cards: [],
  dashTab: 'marketplace', tradeTab: 'buy', tradeFilter: 'all',
  tradeSearch: '', inventorySearch: '', portfolioDays: 7,
  portfolioChart: null, paymentMethod: null, ratesLoaded: true, botInterval: null
};

// ============================================================
// DEMO SERVICE
// ============================================================
function demoGetAccounts() { return JSON.parse(localStorage.getItem(STORAGE_DEMO_ACCOUNTS) || '{}'); }
function demoSetAccounts(accounts) { localStorage.setItem(STORAGE_DEMO_ACCOUNTS, JSON.stringify(accounts)); }
function demoGetSession() {
  const email = localStorage.getItem(STORAGE_DEMO_SESSION);
  if (!email) return null;
  return demoGetAccounts()[email] || null;
}

const Demo = {
  account() { return demoGetSession(); },
  state() { const a = this.account(); return a ? a.state : null; },
  update(mutator) {
    const a = this.account();
    if (!a) return null;
    mutator(a.state);
    const accounts = demoGetAccounts();
    accounts[a.email] = a;
    demoSetAccounts(accounts);
    return a.state;
  },
  notify(title, body, type) {
    const a = this.account();
    if (!a) return;
    this.update(s => {
      if (!s.notifications) s.notifications = [];
      s.notifications.unshift({ id: generateId('n'), title, body, type: type || 'info', read: false, createdAt: Date.now() });
      if (s.notifications.length > 200) s.notifications = s.notifications.slice(0, 200);
    });
    if (APP.user) updateNotificationBadge();
    playNotificationSound();
    triggerLocalNotification(title, body);
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
// LOCAL NOTIFICATION
// ============================================================
async function triggerLocalNotification(title, body) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body: body,
        icon: 'https://i.imgur.com/9aLmHyS.png',
        badge: '/assets/icons/notification-icon.png',
        vibrate: [200, 100, 200, 100, 200]
      });
    } catch (e) {}
  }
}

async function clearOsNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const notifs = await reg.getNotifications();
    notifs.forEach(n => n.close());
  } catch (e) { console.warn('Failed to clear OS notifs', e); }
}

// ============================================================
// BOT SIMULATION ENGINE
// ============================================================
const BOT_NAMES = ["Alex", "Bella", "Chris", "Diana", "Ethan", "Fiona", "George", "Hannah"];

function startDemoBotEngine() {
  if (APP.botInterval) clearInterval(APP.botInterval);
  APP.botInterval = setInterval(() => {
    if (APP.cards.length === 0) return;
    const s = Demo.state();
    if (!s) return;

    const activeListings = (s.listings || []).filter(l => l.status === 'active');
    if (activeListings.length < 4 && Math.random() < 0.3) {
      const randomCard = APP.cards[Math.floor(Math.random() * APP.cards.length)];
      if (randomCard && !activeListings.find(l => l.cardId === randomCard.id)) {
        const randomPrice = Math.round(randomCard.current_price * 1.1);
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        Demo.update(st => {
          st.listings = st.listings || [];
          st.listings.push({ id: generateId('l'), sellerId: 'bot_' + botName, sellerName: botName, cardId: randomCard.id, price: randomPrice, units: 2, remaining: 2, createdAt: Date.now(), status: 'active', current_effective_price: randomPrice });
        });
        if (document.getElementById('section-trade').classList.contains('active')) renderTradeBuyListings();
      }
    }

    if (s.lastBotPurchaseAt) {
      const elapsed = Date.now() - s.lastBotPurchaseAt;
      if (elapsed >= 30 * 1000) {
        const userListings = (s.listings || []).filter(l => l.sellerId === s.userId && l.status === 'active').sort((a, b) => a.createdAt - b.createdAt);
        if (userListings.length > 0) {
          const listingToBuy = userListings[0];
          const randomUser = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
          Demo.update(st => {
            const lIndex = st.listings.findIndex(x => x.id === listingToBuy.id);
            if (lIndex > -1) {
              st.listings[lIndex].remaining -= 1;
              if (st.listings[lIndex].remaining <= 0) st.listings[lIndex].status = 'sold_out';
            }
            st.earningsBalance += listingToBuy.price;
            st.lifetimeEarned += listingToBuy.price;
            st.totalTrades = (st.totalTrades || 0) + 1;
            st.lastBotPurchaseAt = Date.now();
          });
          Demo.log({ type: 'trade_sell', amount: listingToBuy.price, cardId: listingToBuy.cardId });
          Demo.notify('Card Sold!', `${randomUser} bought 1 unit of your ${APP.cards.find(c=>c.id===listingToBuy.cardId)?.name} for ₦${listingToBuy.price.toLocaleString()}!`, 'success');
          if (document.getElementById('section-trade').classList.contains('active')) loadTrade();
          if (document.getElementById('section-dashboard').classList.contains('active')) loadDashboard();
          if (document.getElementById('section-wallet').classList.contains('active')) loadWallet();
        } else {
          Demo.update(st => { st.lastBotPurchaseAt = Date.now(); });
        }
      }
    }
  }, 15000);
}

// ============================================================
// GETTERS
// ============================================================
function getBalances() {
  const s = Demo.state();
  return {
    earnings: s?.earningsBalance || 0, deposit: s?.depositBalance || 0,
    coins: s?.coins || 0, dp: s?.diamondPoints || 0,
    lifetimeEarned: s?.lifetimeEarned || 0, lifetimeWithdrawn: s?.lifetimeWithdrawn || 0,
    totalReferrals: s?.totalReferrals || 0
  };
}
function getInventory() { return Demo.state()?.inventory || {}; }
function getStage() { return getStageByEarnings(getBalances().lifetimeEarned); }

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
    if ((el.getAttribute('onclick') || '').includes("'" + section + "'")) el.classList.add('active');
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
// PWA
// ============================================================
function isPWAInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function installPWA() { window.location.href = '/PandaCard.apk'; }
function closeInstallModal() {
  const m = document.getElementById('installModal'); if (m) m.classList.remove('open');
}
function hideInstallUI() {
  const b = document.getElementById('pwaInstallBtn'); if (b) b.style.display = 'none';
  const r = document.getElementById('settingsInstallRow'); if (r) r.style.display = 'none';
}

// ============================================================
// BADGE & PUSH
// ============================================================
function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge'); if (!badge) return;
  const s = Demo.state();
  const count = s?.notifications?.filter(n => !n.read).length || 0;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('show', count > 0);
  updateAppBadge(count);
}
function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  }
}
async function togglePushNotifications() {
  const toggle = document.getElementById('settingsPushToggle');
  if (Notification.permission === 'granted') { showToast('To disable, go to browser settings.', 'info'); return; }
  if (Notification.permission === 'denied') { showToast('Notifications are blocked.', 'error'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    if (toggle) toggle.classList.add('active');
    showToast('Demo notifications enabled!', 'success');
    Demo.update(s => { if (s.checklist) s.checklist.push = true; });
    renderChecklist();
  } else { showToast('Permission denied.', 'error'); }
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
  const earnEl = document.getElementById('balanceEarnings'); if (earnEl) earnEl.textContent = formatPrice(b.earnings);
  const depEl = document.getElementById('balanceDeposit'); if (depEl) depEl.textContent = formatPrice(b.deposit);
  const stageEl = document.getElementById('stageBadge'); if (stageEl) stageEl.textContent = cfg.name;
  const fillEl = document.getElementById('stageProgressFill'); if (fillEl) fillEl.style.width = progress.progress + '%';
  const labelEl = document.getElementById('stageProgressLabel');
  if (labelEl) labelEl.textContent = progress.next ? (formatPrice(b.lifetimeEarned) + ' / ' + formatPrice(progress.next) + ' — ' + progress.label) : 'Max Stage Reached';
}

function renderStats() {
  const inv = getInventory();
  const b = getBalances();
  let pv = 0;
  Object.keys(inv).forEach(id => {
    const c = APP.cards.find(x => x.id === id);
    if (c) { const q = inv[id]?.quantity !== undefined ? inv[id].quantity : (inv[id] || 0); pv += (c.current_price || c.original_price || 0) * q; }
  });
  const p = document.getElementById('statPortfolio'); if (p) p.textContent = formatPrice(pv);
  const c = document.getElementById('statCoins'); if (c) c.textContent = String(b.coins || 0);
  const k = document.getElementById('statCards'); if (k) k.textContent = String(Object.keys(inv).length);
}

function renderBannerAlerts() {
  const el = document.getElementById('bannerAlerts'); if (!el) return;
  el.innerHTML = '';
  if (!localStorage.getItem('pandacard_welcome_seen')) {
    const name = Demo.account()?.fullName || 'trader';
    el.innerHTML = `<div class="banner-alert info" style="margin-bottom:12px;"><span class="material-icons">celebration</span><span class="banner-text">Welcome to Panda Card, ${escapeHtml(name)}! You're in Demo Mode — explore freely.</span><button class="banner-dismiss" onclick="dismissWelcome()">&times;</button></div>`;
  }
}
function dismissWelcome() {
  localStorage.setItem('pandacard_welcome_seen', '1');
  const el = document.getElementById('bannerAlerts'); if (el) el.innerHTML = '';
}

function renderChecklist() {
  const el = document.getElementById('checklistCard'); if (!el) return;
  const s = Demo.state();
  const items = s?.checklist || {};
  const pinDone = items.pin || !!s?.pin;
  const installDone = isPWAInstalled();
  const pushDone = (typeof Notification !== 'undefined' && Notification.permission === 'granted');
  
  const today = new Date().toDateString();
  const rewardDone = s?.dailyReward?.lastClaim === today;
  const depositDone = (s?.depositBalance || 0) > 0;
  const buyDone = Object.keys(s?.ownedEver || {}).length > 0;

  if (rewardDone && depositDone && items.learn && items.announcement && buyDone && pinDone && installDone && pushDone) {
    el.innerHTML = ''; return;
  }

  const rows = [
    { key: 'install', label: 'Install the Panda App', action: "installPWA()", done: installDone },
    { key: 'push', label: 'Enable Push Notifications', action: "navigateTo('settings')", done: pushDone },
    { key: 'pin', label: 'Set your security PIN', action: "navigateTo('settings');setTimeout(()=>openPinModal('set'), 300)", done: pinDone },
    { key: 'reward', label: 'Claim your daily reward', action: "navigateTo('dailyreward')", done: rewardDone },
    { key: 'deposit', label: 'Make your first deposit', action: "navigateTo('wallet')", done: depositDone },
    { key: 'learn', label: 'Learn how the app works', action: "Demo.update(st=>{st.checklist.learn=true}); navigateTo('live'); renderChecklist();", done: items.learn },
    { key: 'announcement', label: 'Check latest announcements', action: "Demo.update(st=>{st.checklist.announcement=true}); navigateTo('announcements'); renderChecklist();", done: items.announcement },
    { key: 'buy', label: 'Buy your first card', action: "navigateTo('trade')", done: buyDone }
  ];

  el.innerHTML = `<div class="checklist-card"><div class="checklist-title"><span class="material-icons">checklist</span> Getting Started</div><div class="checklist-sub">Complete these to unlock the full experience</div>${rows.map(r => `<div class="checklist-item ${r.done ? 'done' : ''}" onclick="${r.action}"><span class="check-circle"><span class="material-icons">check</span></span><span class="check-label">${escapeHtml(r.label)}</span></div>`).join('')}</div>`;
}

// ✅ UPDATED: REAL EVENT-BASED GRAPH FOR DEMO
function renderPortfolioChart() {
  const canvas = document.getElementById('portfolioChart');
  const chartInner = document.getElementById('chartInner');
  const chartScroll = document.getElementById('chartScroll');
  if (!canvas || typeof Chart === 'undefined') return;
  
  const ctx = canvas.getContext('2d');
  if (APP.portfolioChart) { try { APP.portfolioChart.destroy(); } catch (e) {} }

  const s = Demo.state();
  const txs = [...(s.transactions || [])].reverse(); // oldest first
  const events = [];
  let runningTotal = 0;

  txs.forEach(tx => {
    const cardId = tx.cardId || tx.listingId; // approximate
    const card = APP.cards.find(c => c.id === cardId);
    const val = card ? (card.current_price || card.original_price || 0) : (tx.amount || 0);

    if (tx.type === 'marketplace_buy' || tx.type === 'trade_buy') {
      runningTotal += val;
      events.push({ time: tx.createdAt, total: runningTotal, type: tx.type });
    } else if (tx.type === 'trade_sell' || tx.type === 'mining_reward' || tx.type === 'daily_combo' || tx.type === 'listing_create') {
      runningTotal = Math.max(0, runningTotal - val);
      events.push({ time: tx.createdAt, total: runningTotal, type: tx.type });
    }
  });

  const inv = getInventory();
  let currentTotal = 0;
  Object.keys(inv).forEach(id => {
    const c = APP.cards.find(x => x.id === id);
    if (c) currentTotal += (c.current_price || c.original_price || 0) * (inv[id]?.quantity || 0);
  });
  
  if (events.length > 0 && events[events.length-1].total !== currentTotal) {
    events.push({ time: Date.now(), total: currentTotal, type: 'adjustment' });
  } else if (events.length === 0 && currentTotal > 0) {
    events.push({ time: Date.now(), total: currentTotal, type: 'init' });
  }

  // Filter by APP.portfolioDays
  const cutoff = Date.now() - (APP.portfolioDays * 24 * 60 * 60 * 1000);
  const filteredEvents = events.filter(e => e.time >= cutoff);
  
  const labels = [new Date(cutoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })];
  const data = [0];
  
  filteredEvents.forEach(e => {
    labels.push(new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    data.push(e.total);
  });

  const chEl = document.getElementById('portfolioChartChange');
  if (currentTotal === 0) {
    if (chEl) { chEl.textContent = 'Empty'; chEl.className = 'graph-change'; }
  } else {
    const first = data.find(v => v > 0) || 1;
    const last = currentTotal;
    const changePct = ((last - first) / first) * 100;
    if (chEl) {
      chEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '%';
      chEl.className = 'graph-change ' + (changePct >= 0 ? 'up' : 'down');
    }
  }

  if (chartInner) chartInner.style.width = Math.max(650, (data.length + 1) * 75) + 'px';

  APP.portfolioChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.1)', fill: true, tension: 0.1, pointRadius: 4, pointHoverRadius: 8, borderWidth: 3, pointBackgroundColor: '#FFD700' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#999', font: { size: 10 }, maxTicksLimit: 10 } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#999', font: { size: 10 }, callback: v => formatPrice(v) } } } }
  });
  
  setTimeout(() => { if (chartScroll) chartScroll.scrollLeft = chartScroll.scrollWidth; }, 100);
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
  const el = document.getElementById('tab-' + tab); if (el) el.classList.add('active');
  playSound('click');
}

// ============================================================
// MARKETPLACE
// ============================================================
function renderMarketplaceGrid() {
  const grid = document.getElementById('marketplaceGrid'); if (!grid) return;
  if (!APP.cards.length) { grid.innerHTML = '<div class="empty-state"><span class="material-icons">inventory_2</span><p>No cards available</p></div>'; return; }
  const inv = getInventory();
  
  // ✅ UPDATED: Group Hot/Neutral/Cold into one
  const grouped = { disappearing: [], bonus: [], vip: [], standard: [], newly: [] };
  
  let dSeen = 0;
  APP.cards.forEach(c => {
    if (c.is_disappearing && c.is_active) { if (dSeen < 1) { grouped.disappearing.push(c); dSeen++; } }
    else if (c.is_bonus) grouped.bonus.push(c);
    else if (c.is_vip) grouped.vip.push(c);
    else if (c.status === 'newly') grouped.newly.push(c);
    else grouped.standard.push(c);
  });

  // Sort standard: Hot -> Neutral -> Cold
  grouped.standard.sort((a, b) => {
    const order = { hot: 1, neutral: 2, cold: 3 };
    return (order[a.status] || 2) - (order[b.status] || 2);
  });

  const sections = [
    { key: 'disappearing', label: 'Disappearing', color: '#9B59B6', icon: 'hourglass_top' },
    { key: 'bonus', label: 'Bonus', color: '#FF6B35', icon: 'card_giftcard' },
    { key: 'vip', label: 'VIP', color: '#FFD700', icon: 'star' },
    { key: 'standard', label: 'Marketplace', color: '#1A1A2E', icon: 'store' },
    { key: 'newly', label: 'New', color: '#22C55E', icon: 'new_releases' }
  ];

  let html = '';
  sections.forEach(s => {
    if (grouped[s.key].length) {
      html += `<div class="marketplace-section-title" style="color:${s.color};"><span class="material-icons" style="font-size:18px;">${s.icon}</span> ${s.label}</div>`;
      html += `<div class="card-scroll-row">`;
      grouped[s.key].forEach(card => { html += renderCardTile(card, inv); });
      html += `</div>`;
    }
  });
  grid.innerHTML = html;
}

function renderDashInventory() {
  const grid = document.getElementById('dashInventoryGrid'); if (!grid) return;
  const countEl = document.getElementById('dashInventoryCount');
  const inv = getInventory();
  const ids = Object.keys(inv).filter(id => (inv[id].quantity > 0 || inv[id] > 0));
  if (countEl) countEl.textContent = ids.length + ' cards';
  if (!ids.length) { grid.innerHTML = '<div class="empty-state"><span class="material-icons">inbox</span><p>No cards yet</p></div>'; return; }
  
  grid.innerHTML = ids.slice(0, 9).map(id => {
    const c = APP.cards.find(x => x.id === id);
    return c ? renderCardTile(c, inv) : '';
  }).join('');
}

function renderCardTile(card, inv) {
  const frameClass = card.is_vip ? 'frame-vip' : card.is_disappearing ? 'frame-disappearing' : card.is_bonus ? 'frame-bonus' : card.status === 'hot' ? 'frame-hot' : card.status === 'cold' ? 'frame-cold' : card.status === 'newly' ? 'frame-newly' : 'frame-neutral';
  let badge = '';
  if (card.is_disappearing) badge = '<span class="badge-top disappearing">DISAPPEARING</span>';
  else if (card.is_bonus) badge = '<span class="badge-top bonus">BONUS</span>';
  else if (card.is_vip) badge = '<span class="badge-top vip">VIP</span>';
  else if (card.status === 'hot') badge = '<span class="badge-top hot">HOT</span>';
  else if (card.status === 'cold') badge = '<span class="badge-top cold">COLD</span>';
  else if (card.status === 'newly') badge = '<span class="badge-top newly">NEW</span>';
  
  const qty = inv?.[card.id]?.quantity !== undefined ? inv[card.id].quantity : (inv?.[card.id] || 0);
  const owned = qty > 0 ? '<div style="position:absolute; bottom:8px; right:8px; background:#22C55E; color:#fff; padding:2px 8px; border-radius:10px; font-size:9px; font-weight:700; z-index:2;">OWNED</div>' : '';
  
  let timerHtml = '';
  // ✅ REMOVED timer for disappearing cards in inventory. Only show if NOT owned.
  if (card.is_disappearing && card.disappear_expires_at && qty === 0) {
    const diff = new Date(card.disappear_expires_at).getTime() - Date.now();
    if (diff > 0) { const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000); timerHtml = `<div style="position:absolute; bottom:8px; left:8px; background:rgba(0,0,0,0.8); color:#fff; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; z-index:2;">⏱ ${h}h ${m}m</div>`; }
  }
  
  let priceHtml;
  if (card.is_bonus) priceHtml = `<div class="card-price" style="color:#FF6B35;">${card.bonus_referral_threshold || 10} Refs</div>`;
  else priceHtml = `<div class="card-price">${formatPrice(card.current_price || card.original_price || 0)}</div>`;
  
  return `<div class="card-item ${frameClass}" data-card-id="${card.id}" onclick="openCardModal('${card.id}')"><div class="card-image"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" loading="lazy" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />${badge}${owned}${timerHtml}</div><div class="card-name">${escapeHtml(card.name)}</div>${priceHtml}</div>`;
}

// ============================================================
// CARD MODAL
// ============================================================
function openCardModal(cardId) {
  const card = APP.cards.find(c => c.id === cardId); if (!card) return;
  playSound('click');
  const inv = getInventory();
  const owned = inv[cardId]?.quantity !== undefined ? inv[cardId].quantity : (inv[cardId] || 0);
  const b = getBalances();
  const isVip = !!card.is_vip, isBonus = !!card.is_bonus, isDisappearing = !!card.is_disappearing;
  const coinFee = isBonus ? 0 : coinFeeForBuy(card.status || 'neutral', isVip);
  const orig = card.original_price || card.current_price || 0;
  const curr = card.current_price || orig;
  const ceil = orig * 10;

  let actions = '';
  if (isBonus) {
    const req = card.bonus_referral_threshold || 10;
    const has = b.totalReferrals || 0;
    if (owned > 0) actions = `<div style="text-align:center;padding:12px;background:#f0f0f5;border-radius:12px;font-weight:700;color:#999;">Already Claimed</div>`;
    else if (has >= req) actions = `<button class="btn-primary" onclick="claimBonusCard('${cardId}')">Claim Free Card</button>`;
    else actions = `<button class="btn-buy" disabled style="background:#ccc;color:#666;">Need ${req - has} More Referrals</button>`;
  } else if (isDisappearing) {
    if (owned > 0) actions = `<div style="text-align:center;padding:12px;background:#f0f0f5;border-radius:12px;font-weight:700;color:#999;">Already Owned</div>`;
    else actions = `<button class="btn-buy" onclick="closeCardModal();buyFromMarketplace('${cardId}')">Buy — ${formatPrice(curr)} + ${coinFee} PC</button>`;
  } else if (owned > 0) {
    actions = `<button class="btn-sell" onclick="closeCardModal();openSellModal('${cardId}')">Sell This Card</button><button class="btn-primary" onclick="closeCardModal();navigateTo('inventory')">Go to Inventory</button>`;
  } else {
    const hasBought = Demo.state()?.ownedEver?.[cardId];
    if (hasBought) actions = `<button class="btn-buy" onclick="closeCardModal();navigateTo('trade');setTimeout(()=>{document.getElementById('tradeSearchInput').value='${card.name.replace(/'/g, "\\'")}';filterTradeListings();},300)">Find in Trade</button>`;
    else actions = `<button class="btn-buy" onclick="closeCardModal();buyFromMarketplace('${cardId}')">Buy — ${formatPrice(curr)} + ${coinFee} PC</button>`;
  }

  let details = '';
  if (isBonus) details = `<div class="detail-row"><span class="label">Referrals Required</span><span class="value gold">${card.bonus_referral_threshold || 10}</span></div><div class="detail-row"><span class="label">Your Referrals</span><span class="value">${b.totalReferrals || 0}</span></div>`;
  else if (isDisappearing) { const dn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][card.disappear_day ?? 0]; details = `<div class="detail-row"><span class="label">Availability</span><span class="value" style="color:#9B59B6;">${dn} Card</span></div><div class="detail-row"><span class="label">Current Price</span><span class="value gold">${formatPrice(curr)}</span></div>`; }
  else details = `<div class="detail-row"><span class="label">Original Price</span><span class="value">${formatPrice(orig)}</span></div><div class="detail-row"><span class="label">Current Price</span><span class="value gold">${formatPrice(curr)}</span></div><div class="detail-row"><span class="label">Floor</span><span class="value">${formatPrice(orig)}</span></div><div class="detail-row"><span class="label">Ceiling</span><span class="value">${formatPrice(ceil)}</span></div><div class="detail-row"><span class="label">Status</span><span class="value">${(card.status || 'neutral').toUpperCase()}</span></div><div class="detail-row"><span class="label">Coin Fee</span><span class="value gold">${coinFee} PC</span></div>${owned > 0 ? `<div class="detail-row"><span class="label">You Own</span><span class="value">${owned}</span></div>` : ''}`;

  document.getElementById('cardModalBody').innerHTML = `<div class="modal-card-image"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /></div><div class="modal-card-title">${escapeHtml(card.name)}</div><div class="modal-card-id">ID: ${escapeHtml(card.card_code || card.id)}</div>${details}${card.description ? `<div style="font-size:13px;color:#666;padding:12px 0;line-height:1.5;">${escapeHtml(card.description)}</div>` : ''}<div class="modal-actions">${actions}</div>`;
  document.getElementById('cardModal').classList.add('open');
}
function closeCardModal() { document.getElementById('cardModal').classList.remove('open'); }

function claimBonusCard(cardId) {
  Demo.update(s => {
    if (!s.inventory) s.inventory = {};
    if (!s.inventory[cardId]) s.inventory[cardId] = { quantity: 1, marketplace_quantity: 0, trade_quantity: 0 };
    else s.inventory[cardId].quantity++;
  });
  Demo.notify('Bonus Claimed', 'You claimed a bonus card!', 'reward');
  showToast('Card Claimed!', 'success');
  playSound('reward');
  closeCardModal();
  loadDashboard();
}

// ============================================================
// BUY FROM MARKETPLACE
// ============================================================
function buyFromMarketplace(cardId) {
  const card = APP.cards.find(c => c.id === cardId); if (!card) return;
  const b = getBalances();
  const price = card.current_price || card.original_price || 0;
  const coinFee = card.is_bonus ? 0 : coinFeeForBuy(card.status || 'neutral', !!card.is_vip);
  if (b.deposit < price) { showToast('Need ' + formatPrice(price) + ' in deposit', 'error'); playSound('error'); return; }
  if (b.coins < coinFee) { showToast('Need ' + coinFee + ' PC. You have ' + b.coins + '.', 'error'); playSound('error'); return; }
  if (!confirm('Buy ' + card.name + ' for ' + formatPrice(price) + ' + ' + coinFee + ' PC?')) return;

  Demo.update(s => {
    s.depositBalance -= price;
    s.coins -= coinFee;
    s.inventory = s.inventory || {};
    if (!s.inventory[cardId]) s.inventory[cardId] = { quantity: 1, marketplace_quantity: 1, trade_quantity: 0 };
    else { s.inventory[cardId].quantity++; s.inventory[cardId].marketplace_quantity = (s.inventory[cardId].marketplace_quantity || 0) + 1; }
    s.ownedEver = s.ownedEver || {}; s.ownedEver[cardId] = true;
    s.totalTrades = (s.totalTrades || 0) + 1;
    if (s.checklist) s.checklist.buy = true;
  });
  Demo.log({ type: 'marketplace_buy', amount: price, cardName: card.name, cardId });
  Demo.notify('Card Purchased', 'You bought ' + card.name, 'trade');
  showToast('Purchased!', 'success');
  playSound('reward');
  closeCardModal();
  loadDashboard();
}

// ============================================================
// SELL / TRADE
// ============================================================
function openSellModal(cardId) {
  const card = APP.cards.find(c => c.id === cardId); if (!card) return;
  const inv = getInventory();
  const qty = inv[cardId]?.quantity !== undefined ? inv[cardId].quantity : (inv[cardId] || 0);
  if (qty <= 0) { showToast('You do not own this', 'error'); return; }
  if (card.is_bonus || card.is_disappearing) { showToast('This card cannot be sold', 'error'); return; }
  const b = getBalances();
  const floor = card.original_price || card.current_price || 0;
  const ceil = floor * 10;
  const suggested = card.current_price || floor;
  document.getElementById('sellTitle').textContent = 'Sell ' + card.name;
  document.getElementById('sellBody').innerHTML = `
    <div style="background:#f0f0f5;border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#666;">
      <div>Floor: <b>${formatPrice(floor)}</b></div>
      <div>Ceiling: <b>${formatPrice(ceil)}</b></div>
      <div style="margin-top:6px;color:#FF4444;">Fee: <b>20 PC</b> (you have ${b.coins} PC)</div>
    </div>
    <div class="form-group"><label>Your Price</label><div class="input-wrapper"><span class="material-icons">payments</span><input type="number" id="sellPriceInput" value="${Math.round(suggested)}" min="${Math.round(floor)}" max="${Math.round(ceil)}" step="1" /></div></div>
    <button class="btn-primary" onclick="confirmSell('${cardId}')">List (20 PC)</button>`;
  document.getElementById('sellModal').classList.add('open');
}
function closeSellModal() { document.getElementById('sellModal').classList.remove('open'); }

function confirmSell(cardId) {
  const price = parseFloat(document.getElementById('sellPriceInput').value);
  const card = APP.cards.find(c => c.id === cardId); if (!card) return;
  const floor = card.original_price || card.current_price || 0;
  const ceil = floor * 10;
  if (!price || price < floor || price > ceil) { showToast('Price must be between ' + formatPrice(floor) + ' and ' + formatPrice(ceil), 'error'); return; }
  if (getBalances().coins < 20) { showToast('Need 20 PC', 'error'); return; }
  Demo.update(s => {
    s.coins -= 20;
    if (s.inventory[cardId].quantity !== undefined) {
      s.inventory[cardId].quantity--; if (s.inventory[cardId].quantity <= 0) delete s.inventory[cardId];
    } else { s.inventory[cardId]--; if (s.inventory[cardId] <= 0) delete s.inventory[cardId]; }
    s.listings = s.listings || [];
    s.listings.push({ id: generateId('l'), sellerId: s.userId, cardId, price, units: 2, remaining: 2, createdAt: Date.now(), status: 'active', coinFeePaid: 20, original_price_at_listing: price, current_effective_price: price });
    if (!s.lastBotPurchaseAt) s.lastBotPurchaseAt = Date.now();
  });
  Demo.log({ type: 'listing_create', amount: price, cardName: card.name, cardId });
  showToast('Listed successfully', 'success');
  playSound('reward');
  closeSellModal();
  loadInventory(); loadTrade(); loadDashboard();
}

function cancelListing(listingId) {
  const s = Demo.state();
  const l = (s.listings || []).find(x => x.id === listingId);
  if (!l || l.status !== 'active') return showToast('Listing not active', 'error');
  if (l.remaining !== l.units) return showToast('Cannot cancel after 1 sold.', 'error');
  if (!confirm('Cancel listing? Card returns to inventory with -10% ceiling.')) return;
  Demo.update(st => {
    const li = st.listings.find(x => x.id === listingId); if (!li) return;
    li.status = 'cancelled'; li.cancelled_at = Date.now();
    st.inventory = st.inventory || {};
    if (!st.inventory[li.cardId]) {
      st.inventory[li.cardId] = { quantity: 1, marketplace_quantity: 0, trade_quantity: 1, ceiling_price: li.original_price_at_listing * 9 };
    } else {
      const cur = st.inventory[li.cardId].ceiling_price || (li.original_price_at_listing * 10);
      let nc = cur * 0.9; if (nc < li.original_price_at_listing) nc = li.original_price_at_listing;
      st.inventory[li.cardId].ceiling_price = nc;
      st.inventory[li.cardId].quantity++;
    }
  });
  Demo.notify('Listing Cancelled', 'Card returned to inventory (10% ceiling penalty applied).', 'info');
  showToast('Cancelled. Ceiling reduced by 10%.', 'info');
  loadTrade(); loadInventory();
}

function loadTrade() {
  const b = getBalances();
  const depEl = document.getElementById('tradeDepositBal'); if (depEl) depEl.textContent = formatPrice(b.deposit);
  const earnEl = document.getElementById('tradeEarningsBal'); if (earnEl) earnEl.textContent = formatPrice(b.earnings);
  const cEl = document.getElementById('tradeCoins'); if (cEl) cEl.textContent = String(b.coins);
  renderTradeBuyListings();
  renderTradeSellListings();
}
function switchTradeTab(tab) {
  APP.tradeTab = tab;
  document.querySelectorAll('#section-trade .tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tradeTab === tab));
  document.querySelectorAll('#section-trade .tab-content').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('trade-' + tab); if (el) el.classList.add('active');
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

function renderTradeBuyListings() {
  const el = document.getElementById('tradeBuyListings'); if (!el) return;
  const s = Demo.state();
  const myId = s.userId;
  // ✅ FIXED: Filter out my own listings entirely
  let listings = (s.listings || []).filter(l => l.status === 'active' && l.remaining > 0 && l.sellerId !== myId);
  const inv = getInventory();
  
  let html = '';
  listings.forEach(l => {
    const card = APP.cards.find(c => c.id === l.cardId); if (!card) return;
    if (APP.tradeSearch && !card.name.toLowerCase().includes(APP.tradeSearch)) return;
    if (APP.tradeFilter !== 'all') { const st = card.is_vip ? 'vip' : (card.status || 'neutral'); if (st !== APP.tradeFilter) return; }
    
    const qty = inv[card.id]?.quantity !== undefined ? inv[card.id].quantity : (inv[card.id] || 0);
    const owned = qty > 0;
    
    html += `<div class="listing-item" style="display:flex;align-items:center;gap:12px;padding:12px;"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:50px;height:65px;border-radius:8px;object-fit:cover;" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /><div class="info" style="flex:1;"><div class="name" style="color:#1A1A2E;font-weight:700;">${escapeHtml(card.name)}</div><div class="price" style="color:#FFD700;font-weight:800;">${formatPrice(l.current_effective_price || l.price)}</div><div class="units" style="font-size:11px;color:#999;">${l.remaining}/${l.units} units</div></div><button class="buy-btn" ${owned ? 'disabled style="background:#ccc;color:#666;"' : ''} onclick="buyFromTrade('${l.id}')">${owned ? 'Owned' : 'Buy'}</button></div>`;
  });
  el.innerHTML = html || '<div class="empty-state"><span class="material-icons">store</span><p>No listings available</p></div>';
}

function renderTradeSellListings() {
  const el = document.getElementById('tradeSellListings'); if (!el) return;
  const s = Demo.state();
  const mine = (s.listings || []).filter(l => l.sellerId === s.userId && l.status === 'active');
  if (!mine.length) { el.innerHTML = '<div class="empty-state"><span class="material-icons">sell</span><p>No active listings</p><button class="btn-action" style="max-width:200px;margin:16px auto 0;" onclick="navigateTo(\'inventory\')">Go to Inventory</button></div>'; return; }
  el.innerHTML = mine.map(l => {
    const card = APP.cards.find(c => c.id === l.cardId) || { name: 'Card' };
    const canCancel = l.remaining === l.units;
    return `<div class="listing-item" style="display:flex;align-items:center;gap:12px;padding:12px;"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:50px;height:65px;border-radius:8px;object-fit:cover;" /><div class="info" style="flex:1;"><div class="name" style="font-weight:700;">${escapeHtml(card.name)}</div><div class="price" style="color:#FFD700;font-weight:800;">${formatPrice(l.price)}</div><div class="units" style="font-size:11px;color:#999;">${l.remaining}/${l.units} units</div></div>${canCancel ? `<button class="buy-btn sell" onclick="cancelListing('${l.id}')">Cancel</button>` : `<button class="buy-btn" disabled style="background:#ccc;color:#666;font-size:11px;">1 Sold</button>`}</div>`;
  }).join('');
}

function buyFromTrade(listingId) {
  if (!confirm('Buy this card?')) return;
  const s = Demo.state();
  const l = (s.listings || []).find(x => x.id === listingId);
  if (!l) throw showToast('Listing gone', 'error');
  if (getBalances().deposit < l.price) return showToast('Insufficient deposit', 'error');
  if (l.sellerId === s.userId) return showToast('Cannot buy your own', 'error');
  const prev = (s.transactions || []).find(t => t.type === 'trade_buy' && t.listingId === listingId);
  if (prev) return showToast('You already bought 1 unit. Another user must buy the rest.', 'error');

  Demo.update(st => {
    st.depositBalance -= l.price;
    const idx = st.listings.findIndex(x => x.id === listingId);
    if (idx > -1) {
      st.listings[idx].remaining--;
      if (st.listings[idx].remaining <= 0) st.listings[idx].status = 'sold_out';
    }
    st.inventory = st.inventory || {};
    if (!st.inventory[l.cardId]) st.inventory[l.cardId] = { quantity: 1, marketplace_quantity: 0, trade_quantity: 1 };
    else { st.inventory[l.cardId].quantity++; st.inventory[l.cardId].trade_quantity = (st.inventory[l.cardId].trade_quantity || 0) + 1; }
    st.ownedEver = st.ownedEver || {}; st.ownedEver[l.cardId] = true;
    st.totalTrades = (st.totalTrades || 0) + 1;
  });
  Demo.log({ type: 'trade_buy', amount: l.price, listingId, cardId: l.cardId });
  showToast('Purchased!', 'success'); playSound('reward');
  loadTrade(); loadDashboard();
}

// ============================================================
// INVENTORY
// ============================================================
function loadInventory() { renderInventoryFull(); }
function renderInventoryFull() {
  const grid = document.getElementById('inventoryFullGrid'); if (!grid) return;
  const inv = getInventory();
  let ids = Object.keys(inv).filter(id => (inv[id].quantity > 0 || inv[id] > 0));
  if (APP.inventorySearch) ids = ids.filter(id => { const c = APP.cards.find(x => x.id === id); return c && c.name.toLowerCase().includes(APP.inventorySearch); });
  const cnt = document.getElementById('inventoryCount');
  if (!ids.length) { grid.innerHTML = '<div class="empty-state"><span class="material-icons">inbox</span><p>No cards in inventory</p></div>'; if (cnt) cnt.textContent = '0 cards'; return; }
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
// MINING (NEW LOGIC)
// ============================================================
function loadMining() {
  const s = Demo.state();
  const today = new Date().toDateString();
  const currentHour = new Date().getHours();
  const currentSession = currentHour < 12 ? 'AM' : 'PM';
  const sessionKey = `${today}-${currentSession}`;
  
  // Check if new user
  const createdAt = new Date(Demo.account()?.createdAt || 0);
  if (createdAt.toDateString() === today) {
    document.getElementById('miningCostInfo').textContent = "Your account is new. Mining starts tomorrow!";
    ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  if (s.miningLastReset !== today) Demo.update(st => { st.miningToday = 0; st.miningLastReset = today; st.miningSessionId = null; });
  if (s.miningSessionId !== sessionKey) Demo.update(st => { st.miningSessionId = sessionKey; st.dailyMiningCards = []; });

  if (!s.dailyMiningCards || s.dailyMiningCards.length === 0) {
    const cfg = getStageConfig(getStage());
    let pool = APP.cards.filter(c => !c.is_bonus && !c.is_disappearing && c.is_active && (c.current_price || c.original_price) >= cfg.minCardPrice && (c.current_price || c.original_price) <= cfg.maxCardPrice);
    if (pool.length < 3) pool = APP.cards.filter(c => !c.is_bonus && !c.is_disappearing && c.is_active);
    
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, 3).map(c => c.id);
    Demo.update(st => { st.dailyMiningCards = picked; });
  }
  
  const slots = s.dailyMiningCards || [];
  s.miningSlots = slots.map(id => APP.cards.find(c => c.id === id)).filter(Boolean);
  renderMiningUI();
}

function renderMiningUI() {
  const s = Demo.state();
  const sessions = s.miningToday || 0;
  const inv = getInventory();
  let allOwned = true;
  
  ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach((elId, index) => {
    const el = document.getElementById(elId); 
    if (!el) return;
    
    const slots = s.miningSlots || [];
    if (index >= slots.length) {
      el.style.display = 'none';
      return;
    }
    
    el.style.display = 'block';
    const card = slots[index];
    const hasMkt = (inv[card.id]?.marketplace_quantity || 0) > 0;
    if (!hasMkt) allOwned = false;
    
    el.innerHTML = `<img src="${card.image_url}" style="width:100%;border-radius:8px;${!hasMkt ? 'opacity:0.5;' : ''}" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /><div style="font-size:10px;font-weight:bold;margin-top:4px;">${card.name}</div>${!hasMkt ? '<div style="color:#FF4444;font-size:9px;">Need to buy</div>' : '<div style="color:#22C55E;font-size:9px;">Ready</div>'}`;
    el.dataset.cardId = card.id;
    el.onclick = () => { 
      if (!hasMkt) { 
        showToast('Buy this card from Marketplace to mine it', 'info'); 
        navigateTo('trade'); 
        document.getElementById('tradeSearchInput').value = card.name;
        filterTradeListings();
      } 
    };
  });
  
  const btn = document.getElementById('miningStartBtn');
  const ready = (s.miningSlots?.length > 0) && sessions < 2 && allOwned;
  if (btn) { btn.disabled = !ready; btn.style.background = ready ? '#FFD700' : '#888'; }
  const used = document.getElementById('miningSessionsUsed'); if (used) used.textContent = sessions + '/2';
  const info = document.getElementById('miningCostInfo');
  if (info) info.textContent = sessions >= 2 ? 'Daily limit reached.' : !allOwned ? 'Buy missing cards from Marketplace.' : ready ? 'All cards ready.' : 'Loading...';
}

function startMining() {
  const s = Demo.state();
  if (!s.miningSlots || s.miningSlots.length === 0) return;
  const inv = getInventory();
  const allOwned = s.miningSlots.every(c => (inv[c.id]?.marketplace_quantity || 0) > 0);
  if (!allOwned) return showToast('You must own all cards from Marketplace', 'error');
  
  const total = s.miningSlots.reduce((sum, c) => sum + (c.current_price || c.original_price || 0), 0);
  const reward = Math.round(total * 0.7);
  if (!confirm('Mine for ' + formatPrice(reward) + '? Cards will be burned.')) return;
  
  Demo.update(st => {
    st.miningSlots.forEach(c => {
      if (st.inventory[c.id] && st.inventory[c.id].quantity !== undefined) {
        st.inventory[c.id].quantity--; st.inventory[c.id].marketplace_quantity--;
        if (st.inventory[c.id].quantity <= 0) delete st.inventory[c.id];
      }
    });
    st.earningsBalance += reward;
    st.lifetimeEarned += reward;
    st.miningToday = (st.miningToday || 0) + 1;
    st.miningEarnedToday = (st.miningEarnedToday || 0) + reward;
    st.miningSlots = []; st.dailyMiningCards = [];
  });
  
  Demo.log({ type: 'mining_reward', amount: reward, cardId: 'mining_batch' });
  Demo.notify('Mining Reward', 'You earned ' + formatPrice(reward), 'reward');
  showToast('Mined ' + formatPrice(reward) + '!', 'success');
  playSound('reward');
  loadMining(); loadDashboard();
}

function tapMiningSlot() { /* handled in renderMiningUI */ }

// ============================================================
// DAILY COMBO (SAT/SUN SCREENS)
// ============================================================
function loadDailyCombo() {
  const day = new Date().getDay();
  const weekdayScreen = document.getElementById('comboWeekdayScreen');
  const satScreen = document.getElementById('comboSaturdayScreen');
  const sunScreen = document.getElementById('comboSundayScreen');
  
  if (day === 0) { // Sunday
    weekdayScreen.style.display = 'none';
    satScreen.style.display = 'none';
    sunScreen.style.display = 'block';
    return;
  }
  
  if (day === 6) { // Saturday
    weekdayScreen.style.display = 'none';
    satScreen.style.display = 'block';
    sunScreen.style.display = 'none';
    
    const streak = Demo.state()?.comboStreak || 0;
    let slotsHtml = '';
    for (let i = 0; i < 5; i++) {
      const isDone = i < streak;
      slotsHtml += `<div class="streak-slot ${isDone ? 'done' : 'missed'}" onclick="${!isDone ? "useDisappearingForStreak()" : ""}">${isDone ? '✓' : '✕'}</div>`;
    }
    document.getElementById('saturdayStreakSlots').innerHTML = slotsHtml;
    
    if (streak >= 5) {
      document.getElementById('saturdayRewardAction').innerHTML = `
        <button class="btn-primary" onclick="claimSaturdayReward()">Claim Week Reward (+40 DP)</button>
        <button class="btn-primary" style="background:#9B59B6; margin-top:10px;" onclick="demoSimulateDp()">🛠️ Simulate DP (Demo)</button>
      `;
    } else {
      document.getElementById('saturdayRewardAction').innerHTML = `<p style="text-align:center;color:#666;">Complete all 5 days to claim.</p>`;
    }
    return;
  }

  // Monday - Friday
  weekdayScreen.style.display = 'block';
  satScreen.style.display = 'none';
  sunScreen.style.display = 'none';

  const s = Demo.state();
  const today = new Date().toDateString();
  if (!s.dailyCombo || s.dailyCombo.date !== today) {
    const inv = getInventory();
    const eligible = APP.cards.filter(c => (inv[c.id]?.quantity || 0) === 0 && c.is_active && !c.is_bonus && !c.is_disappearing);
    if (!eligible.length) { document.getElementById('comboCardArea').innerHTML = '<div class="empty-state"><p>No eligible cards today</p></div>'; return; }
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    Demo.update(st => { st.dailyCombo = { assignedCardId: pick.id, date: today, completed: false }; });
  }
  
  const s2 = Demo.state();
  const c = s2.dailyCombo;
  const card = APP.cards.find(x => x.id === c.assignedCardId); if (!card) return;
  const inv = getInventory();
  const owned = (inv[c.assignedCardId]?.quantity || 0) > 0;
  const action = document.getElementById('comboActionArea');
  const dpEl = document.getElementById('comboDpBalance'); if (dpEl) dpEl.textContent = String(s2.diamondPoints || 0);
  const streakEl = document.getElementById('comboStreak'); if (streakEl) streakEl.textContent = String(s2.comboStreak || 0);
  const dpTodayEl = document.getElementById('comboDpToday'); if (dpTodayEl) dpTodayEl.textContent = String(s2.dpToday || 0);
  const dpNeedEl = document.getElementById('comboDpNeeded'); if (dpNeedEl) dpNeedEl.textContent = String(dpRequiredForWithdrawal(20000));

  document.getElementById('comboCardArea').innerHTML = `<div style="display:flex;gap:12px;align-items:center;"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:80px;height:106px;border-radius:10px;object-fit:cover;" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /><div><div style="font-weight:700;font-size:15px;">${escapeHtml(card.name)}</div><div style="font-size:12px;color:#666;">${formatPrice(card.current_price || card.original_price || 0)}</div></div></div>`;

  if (c.completed) action.innerHTML = '<div style="text-align:center;padding:16px;background:#22C55E;color:#fff;border-radius:12px;font-weight:700;">Completed Today</div>';
  else if (owned) action.innerHTML = `<button class="btn-primary" onclick="completeDailyCombo()">Complete Combo (+12 DP)</button>`;
  else {
    const hasDisappearing = Object.keys(inv).some(id => APP.cards.find(x => x.id === id)?.is_disappearing && (inv[id]?.quantity || 0) > 0);
    action.innerHTML = hasDisappearing
      ? `<button class="btn-primary" style="background:#9B59B6;" onclick="completeComboWithDisappearing()">Use Disappearing Card to Complete</button>`
      : `<button class="btn-primary" onclick="navigateTo('trade'); setTimeout(()=>{ document.getElementById('tradeSearchInput').value='${card.name.replace(/'/g, "\\'")}'; filterTradeListings(); }, 300)">Find in Trade</button>`;
  }

  const progEl = document.getElementById('comboProgress');
  if (progEl) progEl.innerHTML = Array.from({ length: 5 }, (_, i) => { const done = i < (s2.comboStreak || 0); return `<div style="width:36px;height:36px;border-radius:50%;border:2px solid ${done ? '#22C55E' : '#ddd'};background:${done ? '#22C55E' : 'transparent'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">${done ? '✓' : ''}</div>`; }).join('');
}

function completeDailyCombo() {
  const s = Demo.state();
  if (!s.dailyCombo || s.dailyCombo.completed) return;
  Demo.update(st => {
    st.dailyCombo.completed = true;
    st.diamondPoints = (st.diamondPoints || 0) + 12;
    st.dpToday = (st.dpToday || 0) + 12;
    st.comboStreak = (st.comboStreak || 0) + 1;
    if (st.comboStreak >= 5) { st.diamondPoints += 40; st.dpToday += 40; st.comboStreak = 0; }
  });
  Demo.notify('Daily Combo', 'You earned 12 DP', 'reward');
  showToast('+12 DP!', 'success'); playSound('reward');
  loadDailyCombo();
}

function completeComboWithDisappearing() {
  const s = Demo.state();
  const inv = getInventory();
  const dId = Object.keys(inv).find(id => APP.cards.find(x => x.id === id)?.is_disappearing && (inv[id]?.quantity || 0) > 0);
  if (!dId) return showToast('No Disappearing Card', 'error');
  if (!confirm('Use Disappearing Card to complete combo? It will be consumed.')) return;
  Demo.update(st => {
    st.dailyCombo.completed = true;
    st.diamondPoints = (st.diamondPoints || 0) + 12;
    st.dpToday = (st.dpToday || 0) + 12;
    st.inventory[dId].quantity--;
    if (st.inventory[dId].quantity <= 0) delete st.inventory[dId];
  });
  Demo.notify('Daily Combo', 'Used Disappearing Card! +12 DP', 'reward');
  showToast('Disappearing card consumed! +12 DP', 'info');
  playSound('reward');
  loadDailyCombo();
}

function useDisappearingForStreak() {
  const inv = getInventory();
  const dId = Object.keys(inv).find(id => APP.cards.find(x => x.id === id)?.is_disappearing && (inv[id]?.quantity || 0) > 0);
  if (!dId) return showToast('No Disappearing Card available to fix streak', 'error');
  if (!confirm('Use Disappearing Card to cover a missed day? It will be consumed.')) return;
  
  Demo.update(st => {
    st.inventory[dId].quantity--;
    if (st.inventory[dId].quantity <= 0) delete st.inventory[dId];
    st.comboStreak = (st.comboStreak || 0) + 1; // artificially increase streak for demo
  });
  showToast('Streak covered!', 'success');
  playSound('reward');
  loadDailyCombo();
}

function claimSaturdayReward() {
  Demo.update(st => {
    st.diamondPoints = (st.diamondPoints || 0) + 40;
    st.dpToday = (st.dpToday || 0) + 40;
    st.comboStreak = 0; // Reset streak after claiming
  });
  Demo.notify('Week Reward', 'You claimed your +40 DP bonus!', 'reward');
  showToast('+40 DP Claimed!', 'success');
  playSound('reward');
  loadDailyCombo();
}

function demoSimulateDp() {
  Demo.update(st => { st.diamondPoints = (st.diamondPoints || 0) + 100; });
  showToast('Added 100 DP', 'success');
}

// ============================================================
// WALLET (SIMULATORS REMOVED)
// ============================================================
function loadWallet() {
  const b = getBalances();
  const elE = document.getElementById('walletEarnings'); if (elE) elE.textContent = formatPrice(b.earnings);
  const elD = document.getElementById('walletDeposit'); if (elD) elD.textContent = formatPrice(b.deposit);
  const elC = document.getElementById('walletCoins'); if (elC) elC.textContent = String(b.coins);
  const elDp = document.getElementById('walletDp'); if (elDp) elDp.textContent = String(b.dp);
  const elS = document.getElementById('walletStage'); if (elS) elS.textContent = getStageConfig(getStage()).name;
  renderBankDetails();
  renderWalletHistory();
  // Note: Simulate Deposit button removed from here
}

function renderBankDetails() {
  const el = document.getElementById('walletBankDetails'); if (!el) return;
  const s = Demo.state();
  if (s?.bankDetails?.accountNumber) {
    el.innerHTML = `<div style="line-height:1.6;"><b>${escapeHtml(s.bankDetails.bank)}</b><br/>${escapeHtml(s.bankDetails.accountName)}<br/>${escapeHtml(s.bankDetails.accountNumber)}</div>`;
  } else { el.textContent = 'No bank details saved.'; }
}

function renderWalletHistory() {
  const el = document.getElementById('walletHistory'); if (!el) return;
  const txs = Demo.state()?.transactions || [];
  if (!txs.length) { el.textContent = 'No recent transactions.'; return; }
  el.innerHTML = txs.slice(0, 10).map(tx => `<div class="bank-info" style="padding:8px 0;"><span class="label">${escapeHtml(tx.type || 'tx')}</span><span class="value">${tx.amount ? formatPrice(Math.abs(tx.amount)) : tx.cardName || '—'}</span></div>`).join('');
}

function openDepositModal() {
  document.getElementById('depositModal').classList.add('open');
  APP.paymentMethod = null;
  const hint = document.getElementById('paymentMethodHint'); if (hint) hint.textContent = 'Select a payment method';
  playSound('click');
}
function closeDepositModal() { document.getElementById('depositModal').classList.remove('open'); }
function selectPaymentMethod(m) {
  APP.paymentMethod = m;
  const hint = document.getElementById('paymentMethodHint'); if (hint) hint.textContent = 'Method: ' + m.charAt(0).toUpperCase() + m.slice(1);
  playSound('click');
}
function submitDeposit() {
  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!amount || amount < CONFIG.MIN_DEPOSIT_NGN) return showToast('Minimum deposit is ₦20,000', 'error');
  if (!APP.paymentMethod) return showToast('Select a payment method', 'error');
  Demo.update(s => { s.depositBalance += amount; if (s.checklist) s.checklist.deposit = true; });
  Demo.log({ type: 'deposit', amount, method: APP.paymentMethod });
  Demo.notify('Deposit', 'Demo deposit of ' + formatPrice(amount) + ' completed', 'info');
  showToast('Demo deposit successful (no real money)', 'success'); playSound('reward');
  closeDepositModal(); loadWallet(); loadDashboard();
}

function openWithdrawModal() { document.getElementById('withdrawModal').classList.add('open'); updateWithdrawInfo(); playSound('click'); }
function closeWithdrawModal() { document.getElementById('withdrawModal').classList.remove('open'); }

function updateWithdrawInfo() {
  const b = getBalances();
  const el = document.getElementById('withdrawInfo'); if (!el) return;
  const useBonus = document.getElementById('useBonusCard')?.checked;
  const minAmt = useBonus ? 5000 : 20000;
  const amt = parseFloat(document.getElementById('withdrawAmount')?.value) || 0;
  const dpNeeded = amt > 0 ? dpRequiredForWithdrawal(amt) : 0;
  el.innerHTML = `<div>Earnings: <b>${formatPrice(b.earnings)}</b></div><div>DP: <b>${b.dp}</b>${amt > 0 ? ' / ' + dpNeeded + ' needed' : ''}</div><div style="margin-top:4px;color:${b.earnings >= amt && amt >= minAmt ? '#22C55E' : '#FF4444'};">${amt >= minAmt ? (b.earnings >= amt ? 'Ready' : 'Insufficient balance') : 'Minimum ' + formatPrice(minAmt)}</div>`;
}

function toggleBonusWithdraw() {
  const use = document.getElementById('useBonusCard').checked;
  const amt = document.getElementById('withdrawAmount');
  if (amt) { amt.min = use ? 5000 : 20000; amt.placeholder = use ? 'Min ₦5,000' : 'Min ₦20,000'; }
  
  let container = document.getElementById('bonusCardSelectionContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'bonusCardSelectionContainer';
    if (amt) amt.parentElement.parentElement.appendChild(container);
  }
  if (!use) { container.innerHTML = ''; return; }
  
  const inv = getInventory();
  const bonusIds = Object.keys(inv).filter(id => APP.cards.find(x => x.id === id)?.is_bonus && (inv[id]?.quantity || 0) > 0);
  
  if (bonusIds.length === 0) {
    container.innerHTML = '<div style="color:#FF4444;font-size:12px;margin-bottom:12px;">No Bonus Cards available.</div>';
    return;
  }
  
  container.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Select a Bonus Card to use:</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${bonusIds.map(id => {
          const c = APP.cards.find(x => x.id === id);
          return `
            <label style="cursor:pointer;text-align:center;width:80px;">
              <input type="radio" name="bonusCardChoice" value="${id}" style="display:none;"
                onchange="document.querySelectorAll('[data-bonus-lbl]').forEach(e=>e.style.borderColor='#ddd');this.closest('label').querySelector('[data-bonus-lbl]').style.borderColor='#FFD700';" />
              <div data-bonus-lbl style="border:3px solid #ddd;border-radius:8px;overflow:hidden;transition:border-color 0.2s;">
                <img src="${escapeHtml(c.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:100%;height:96px;object-fit:cover;display:block;" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
              </div>
              <div style="font-size:10px;margin-top:4px;font-weight:600;line-height:1.2;">${escapeHtml(c.name)}</div>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function submitWithdraw() {
  const b = getBalances();
  const amt = parseFloat(document.getElementById('withdrawAmount').value);
  const pin = document.getElementById('withdrawPin').value;
  const useBonus = document.getElementById('useBonusCard').checked;
  const selectedBonus = useBonus ? document.querySelector('input[name="bonusCardChoice"]:checked')?.value : null;
  if (!isValidPin(pin)) return showToast('PIN must be 4 digits', 'error');
  if (!amt || amt < (useBonus ? 5000 : 20000)) return showToast('Invalid amount', 'error');
  if (useBonus && !selectedBonus) return showToast('Please select a Bonus Card', 'error');
  if (b.earnings < amt) return showToast('Insufficient earnings', 'error');
  const dpNeeded = dpRequiredForWithdrawal(amt);
  if (b.dp < dpNeeded) return showToast('Need ' + dpNeeded + ' DP', 'error');
  const s = Demo.state();
  if (s.pin && s.pin !== pin) return showToast('Incorrect PIN', 'error');

  Demo.update(st => {
    st.earningsBalance -= amt;
    st.lifetimeWithdrawn += amt;
    st.diamondPoints -= dpNeeded;
    if (selectedBonus && st.inventory[selectedBonus]) {
      st.inventory[selectedBonus].quantity--;
      if (st.inventory[selectedBonus].quantity <= 0) delete st.inventory[selectedBonus];
    }
  });
  Demo.log({ type: 'withdraw', amount: amt, bonusCardId: selectedBonus });
  Demo.notify('Withdrawal', 'Request for ' + formatPrice(amt) + ' submitted', 'info');
  showToast('Withdrawal requested (demo)', 'success'); playSound('reward');
  closeWithdrawModal(); loadWallet(); loadDashboard();
}

function openBankDetailsModal() {
  const s = Demo.state();
  if (s?.bankDetails) {
    const bn = document.getElementById('bankName'); if (bn) bn.value = s.bankDetails.bank || '';
    const an = document.getElementById('bankAccountName'); if (an) an.value = s.bankDetails.accountName || '';
    const nu = document.getElementById('bankAccountNumber'); if (nu) nu.value = s.bankDetails.accountNumber || '';
  }
  document.getElementById('bankModal').classList.add('open');
}
function closeBankModal() { document.getElementById('bankModal').classList.remove('open'); }
function saveBankDetails() {
  const bank = document.getElementById('bankName').value.trim();
  const name = document.getElementById('bankAccountName').value.trim();
  const num = document.getElementById('bankAccountNumber').value.trim();
  const conf = document.getElementById('bankAccountNumberConfirm').value.trim();
  if (!bank || !name || !num) return showToast('All fields required', 'error');
  if (num !== conf) return showToast('Numbers do not match', 'error');
  if (num.length !== 10) return showToast('Must be 10 digits', 'error');
  Demo.update(s => { s.bankDetails = { bank, accountName: name, accountNumber: num }; });
  showToast('Bank saved', 'success');
  closeBankModal(); renderBankDetails();
}

// ============================================================
// PROFILE
// ============================================================
function loadProfile() {
  const a = Demo.account(); if (!a) return;
  const s = a.state;
  const nm = document.getElementById('profileName'); if (nm) nm.textContent = a.fullName || 'User';
  const un = document.getElementById('profileUsername'); if (un) un.textContent = '@' + (a.username || 'user');
  const st = document.getElementById('profileStage'); if (st) st.textContent = getStageConfig(getStage()).name;
  const jo = document.getElementById('profileJoined'); if (jo) jo.textContent = 'Joined: ' + formatDate(a.createdAt);
  const le = document.getElementById('profileLifetimeEarned'); if (le) le.textContent = formatPrice(s.lifetimeEarned || 0);
  const dp = document.getElementById('profileDp'); if (dp) dp.textContent = String(s.diamondPoints || 0);
  const co = document.getElementById('profileCoins'); if (co) co.textContent = String(s.coins || 0);
  const tr = document.getElementById('profileTrades'); if (tr) tr.textContent = String(s.totalTrades || 0);
  const ph = document.getElementById('profilePhone'); if (ph) ph.value = a.phone || '';
  const ad = document.getElementById('profileAddress'); if (ad) ad.value = a.address || '';
}
function saveProfile() {
  const phone = document.getElementById('profilePhone').value.trim();
  const address = document.getElementById('profileAddress').value.trim();
  const a = Demo.account(); if (!a) return;
  demoUpdateAccount(a.email, { phone, address });
  showToast('Saved', 'success');
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  const dm = document.getElementById('settingsDarkToggle');
  if (dm) dm.classList.toggle('active', document.body.classList.contains('dark-mode'));
  const snd = document.getElementById('settingsSoundToggle');
  if (snd) snd.classList.toggle('active', isSoundEnabled());
  const langEl = document.getElementById('settingsLanguage');
  if (langEl) langEl.textContent = languageName(localStorage.getItem('pandacard_language') || 'en');
  const helper = document.getElementById('modeHelperText');
  if (helper) helper.textContent = 'Demo mode: local data only';
  
  // ✅ FIXED: Show "Set PIN" or "Change PIN"
  const pinLabel = document.getElementById('pinSettingsLabel');
  if (pinLabel) {
    pinLabel.textContent = Demo.state()?.pin ? 'Change PIN' : 'Set PIN';
  }

  // ✅ FIXED: Mode switch UI update
  const mode = localStorage.getItem('pandacard_mode') || 'demo';
  const btnDemo = document.getElementById('modeBtnDemo');
  const btnLive = document.getElementById('modeBtnLive');
  if (btnDemo) btnDemo.classList.toggle('active', mode === 'demo');
  if (btnLive) btnLive.classList.toggle('active', mode === 'live');
  
  const settingsContainer = document.querySelector('#section-settings .content-area');
  if (settingsContainer && !document.getElementById('settingsPushToggle')) {
    const p = document.createElement('div');
    p.className = 'section';
    p.innerHTML = `<div class="section-title"><span class="material-icons">notifications_active</span> Alerts</div><div class="settings-item"><div class="left"><span class="material-icons">notifications</span><span class="label">Push Notifications</span></div><div class="right"><div class="toggle" id="settingsPushToggle" onclick="togglePushNotifications()"><div class="thumb"></div></div></div></div>`;
    settingsContainer.appendChild(p);
    const t = document.getElementById('settingsPushToggle');
    if (t && typeof Notification !== 'undefined' && Notification.permission === 'granted') t.classList.add('active');
  }
}
function toggleSound() {
  const v = !isSoundEnabled();
  localStorage.setItem(STORAGE.SOUND, String(v));
  const el = document.getElementById('settingsSoundToggle'); if (el) el.classList.toggle('active', v);
  showToast(v ? 'Sound on' : 'Sound off', 'success');
}
function openPinModal(mode) { 
  const currentGroup = document.getElementById('currentPinGroup');
  if (currentGroup) currentGroup.style.display = (mode === 'change' && Demo.state()?.pin) ? 'block' : 'none';
  document.getElementById('pinModal').classList.add('open'); 
}
function closePinModal() { document.getElementById('pinModal').classList.remove('open'); }
function savePin() {
  const newP = document.getElementById('pinNew').value;
  const conf = document.getElementById('pinConfirm').value;
  if (!isValidPin(newP)) return showToast('PIN must be 4 digits', 'error');
  if (newP !== conf) return showToast('PINs do not match', 'error');
  Demo.update(s => { s.pin = newP; if (!s.checklist) s.checklist = {}; s.checklist.pin = true; });
  showToast('PIN saved', 'success');
  closePinModal(); renderChecklist(); loadSettings();
}
function openChangePasswordModal() { document.getElementById('changePasswordModal').classList.add('open'); }
function closeChangePasswordModal() { document.getElementById('changePasswordModal').classList.remove('open'); }
function saveChangePassword() {
  showToast('Demo password update not supported', 'info');
  closeChangePasswordModal();
}
function openDeleteAccountModal() { document.getElementById('deleteAccountModal').classList.add('open'); }
function closeDeleteAccountModal() { document.getElementById('deleteAccountModal').classList.remove('open'); }
function confirmDeleteAccount() {
  const v = document.getElementById('deleteConfirmInput').value.trim();
  if (v !== 'DELETE') return showToast('Type DELETE to confirm', 'error');
  if (!confirm('Delete demo account?')) return;
  const a = Demo.account();
  if (a) { const accounts = demoGetAccounts(); delete accounts[a.email]; demoSetAccounts(accounts); }
  demoLogout(); localStorage.removeItem(STORAGE.MODE);
  showToast('Account deleted', 'success');
  setTimeout(() => { window.location.href = 'auth.html'; }, 800);
}

// ============================================================
// LANGUAGE
// ============================================================
const LANGUAGES = [
  { code: 'en', name: 'English' }, { code: 'fr', name: 'Français' }, { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' }, { code: 'ar', name: 'العربية' }, { code: 'sw', name: 'Kiswahili' },
  { code: 'yo', name: 'Yorùbá' }, { code: 'ha', name: 'Hausa' }, { code: 'ig', name: 'Igbo' },
  { code: 'zu', name: 'isiZulu' }, { code: 'de', name: 'Deutsch' }, { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' }, { code: 'ru', name: 'Русский' }, { code: 'zh', name: '中文' },
  { code: 'hi', name: 'हिन्दी' }, { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' }, { code: 'id', name: 'Bahasa Indonesia' }
];
function languageName(code) { const l = LANGUAGES.find(x => x.code === code); return l ? l.name : 'English'; }
function openLanguageModal() {
  const el = document.getElementById('languageList'); if (!el) return;
  const current = localStorage.getItem('pandacard_language') || 'en';
  el.innerHTML = LANGUAGES.map(l => `<div class="settings-item" onclick="setLanguage('${l.code}')" style="cursor:pointer;"><div class="left"><span class="label">${escapeHtml(l.name)}</span></div><div class="right">${current === l.code ? '<span class="material-icons" style="color:#22C55E;">check</span>' : '<span class="material-icons">chevron_right</span>'}</div></div>`).join('');
  document.getElementById('languageModal').classList.add('open');
}
function closeLanguageModal() { document.getElementById('languageModal').classList.remove('open'); }
async function setLanguage(code) {
  localStorage.setItem('pandacard_language', code);
  const l = document.getElementById('settingsLanguage'); if (l) l.textContent = languageName(code);
  closeLanguageModal();
  showToast('Language set to ' + languageName(code), 'success');
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function loadNotifications() {
  const el = document.getElementById('notificationsList'); if (!el) return;
  const notifs = Demo.state()?.notifications || [];
  if (!notifs.length) { el.innerHTML = '<div class="empty-state"><span class="material-icons">notifications_none</span><p>No notifications yet</p></div>'; return; }
  el.innerHTML = notifs.map(n => `<div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')"><div class="icon"><span class="material-icons">notifications</span></div><div class="content"><div class="title">${escapeHtml(n.title)}</div><div class="desc">${escapeHtml(n.body)}</div><div class="time">${timeAgo(n.createdAt)}</div></div></div>`).join('');
  updateNotificationBadge();
}
function markNotifRead(id) {
  Demo.update(s => { const n = (s.notifications || []).find(x => x.id === id); if (n) n.read = true; });
  
  // ✅ CLEAR FROM OS NOTIFICATION BAR
  clearOsNotifications();

  updateNotificationBadge(); loadNotifications();
}
function markAllNotificationsRead() {
  Demo.update(s => { (s.notifications || []).forEach(n => { n.read = true; }); });
  
  // ✅ CLEAR FROM OS NOTIFICATION BAR
  clearOsNotifications();

  updateNotificationBadge(); loadNotifications(); showToast('All read', 'success');
}

// ============================================================
// REFERRAL
// ============================================================
function loadReferral() {
  const a = Demo.account(); if (!a) return;
  const s = a.state;
  const stage = getStage();
  const rate = 10 + (stage - 1) * 5;
  const codeEl = document.getElementById('referralCode'); if (codeEl) codeEl.value = a.referralCode || '...';
  const rEl = document.getElementById('referralRate'); if (rEl) rEl.textContent = rate + ' PC';
  const r2El = document.getElementById('referralRate2'); if (r2El) r2El.textContent = rate + ' PC';
  const cEl = document.getElementById('referralCount'); if (cEl) cEl.textContent = String(s.totalReferrals || 0);
  const coEl = document.getElementById('referralCoinsEarned'); if (coEl) coEl.textContent = String(s.referralCoins || 0);
  injectAdminSimulators();
}
function simulateReferral() {
  const bonus = Math.floor(Math.random() * 3) + 1;
  const rate = 10 + (getStage() - 1) * 5;
  const coins = bonus * rate;
  Demo.update(s => { s.totalReferrals = (s.totalReferrals || 0) + bonus; s.referralCoins = (s.referralCoins || 0) + coins; s.coins = (s.coins || 0) + coins; });
  Demo.notify('New Referral!', bonus + ' user(s) joined! Earned ' + coins + ' PC.', 'reward');
  showToast('Simulated ' + bonus + ' referrals!', 'success');
  loadReferral(); updateBalanceUI();
}
function copyReferral() {
  const code = document.getElementById('referralCode').value;
  const link = window.location.origin + '/auth.html?ref=' + code;
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => showToast('Copied', 'success'));
}
function shareReferral() {
  const code = document.getElementById('referralCode').value;
  const link = window.location.origin + '/auth.html?ref=' + code;
  if (navigator.share) navigator.share({ title: 'Panda Card', text: 'Join Panda Card', link }).catch(copyReferral);
  else copyReferral();
}

// ============================================================
// ANNOUNCEMENTS / FAQ / CONTACT
// ============================================================
function loadAnnouncements() { 
  /* live announcement HTML stays */ 
  const hardcoded = document.getElementById('hardcodedAnnouncement');
  if (hardcoded) hardcoded.style.display = 'block';
}
function loadFAQ() {
  const el = document.getElementById('faqList'); if (!el) return;
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
  if (!email || !subject || !body) return showToast('All fields required', 'error');
  showLoading('Sending...');
  try {
    const fd = new FormData();
    fd.append("access_key", "a352f138-e157-4470-bd07-f82b97450f60");
    fd.append("email", email); fd.append("subject", subject); fd.append("message", body);
    const res = await fetch("https://api.web3forms.com/submit", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok && data.success) { showToast('Message sent!', 'success'); document.getElementById('contactEmail').value = ''; document.getElementById('contactSubject').value = ''; document.getElementById('contactBody').value = ''; }
    else showToast(data.message || 'Failed.', 'error');
  } catch (e) { showToast('Network error.', 'error'); } finally { hideLoading(); }
}

// ============================================================
// DAILY REWARD
// ============================================================
function loadDailyReward() {
  updateCoinPricesUI();
  const s = Demo.state();
  const dr = s.dailyReward || { lastClaim: '', streak: 0, claimHistory: [] };
  const today = new Date().toDateString();
  const claimed = dr.lastClaim === today;
  const btn = document.getElementById('claimRewardBtn');
  if (btn) { if (claimed) { btn.disabled = true; btn.textContent = 'Claimed Today'; btn.style.background = '#888'; } else { btn.disabled = false; btn.textContent = 'Claim (20 PC)'; btn.style.background = '#FFD700'; } }
  const history = dr.claimHistory || [];
  const dc = document.getElementById('rewardDayCount'); if (dc) dc.textContent = String(history.length);
  const dr2 = document.getElementById('rewardDaysRemaining'); if (dr2) dr2.textContent = String(90 - history.length);
  const st = document.getElementById('rewardStreak'); if (st) st.textContent = String(dr.streak || 0);
  const rt = document.getElementById('rewardTotal'); if (rt) rt.textContent = '20';
  renderRewardCalendar(history, s.createdAt || Date.now(), today);
}
function updateCoinPricesUI() {
  const section = document.getElementById('coinPurchaseSection'); if (!section) return;
  const buttons = section.querySelectorAll('button');
  const coins = [10, 50, 100, 500, 1000];
  const ngn = [100, 500, 1000, 5000, 10000];
  buttons.forEach((btn, i) => { if (i < coins.length) btn.innerHTML = `${coins[i]} PC<br/><span style="font-size:10px;">${formatPrice(ngn[i])}</span>`; });
}
function renderRewardCalendar(history, createdAt, todayStr) {
  const container = document.getElementById('rewardCalendar'); if (!container) return;
  const dates = history.map(h => h.date);
  const start = new Date(createdAt); start.setHours(0,0,0,0);
  const today = new Date(todayStr); today.setHours(0,0,0,0);
  let html = '';
  for (let i = 0; i < 90; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = d.toDateString();
    const claimed = dates.includes(ds);
    const future = d > today;
    const missed = !claimed && !future && d < today;
    const isToday = ds === todayStr;
    let bg = '#f0f0f5', color = '#ccc', label = '';
    if (isToday) { bg = '#FFD700'; color = '#1A1A2E'; label = '•'; }
    else if (claimed) { bg = '#22C55E'; color = '#fff'; label = '✓'; }
    else if (missed) { bg = '#FF4444'; color = '#fff'; label = '✕'; }
    html += `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:11px;background:${bg};border-radius:4px;color:${color};font-weight:700;">${label}</div>`;
  }
  container.innerHTML = html;
}
function claimDailyReward() {
  const s = Demo.state();
  const dr = s.dailyReward || { lastClaim: '', streak: 0, claimHistory: [] };
  const today = new Date().toDateString();
  if (dr.lastClaim === today) return showToast('Already claimed', 'info');
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const newStreak = dr.lastClaim === yest.toDateString() ? (dr.streak || 0) + 1 : 1;
  Demo.update(st => {
    st.coins = (st.coins || 0) + 20;
    st.dailyReward = { lastClaim: today, streak: newStreak, claimHistory: (dr.claimHistory || []).concat([{ date: today, amount: 20 }]) };
    if (st.checklist) st.checklist.reward = true;
  });
  Demo.notify('Daily Reward', 'You earned 20 PC', 'reward');
  showToast('+20 PC!', 'success'); playSound('reward');
  loadDailyReward(); updateBalanceUI();
}

// ============================================================
// BUY COINS
// ============================================================
function buyCoins(costNgn, coinsAmount) {
  const b = getBalances();
  if (b.deposit < costNgn) return showToast('Insufficient deposit. Need ' + formatPrice(costNgn), 'error');
  if (!confirm('Buy ' + coinsAmount + ' PC for ' + formatPrice(costNgn) + '?')) return;
  Demo.update(s => { s.depositBalance -= costNgn; s.coins = (s.coins || 0) + coinsAmount; });
  Demo.log({ type: 'coin_buy', amount: costNgn });
  Demo.notify('Coins Purchased', 'You bought ' + coinsAmount + ' PC', 'info');
  showToast('+' + coinsAmount + ' PC', 'success'); playSound('reward');
  loadDailyReward(); updateBalanceUI();
}

// ============================================================
// WELCOME
// ============================================================
function sendWelcomeNotification() {
  const s = Demo.state();
  if (!s || s.welcomeSent) return;
  Demo.update(st => { st.welcomeSent = true; });
  Demo.notify('Welcome to Panda Card', 'You are in Demo Mode. Everything is simulated — no real money at risk.', 'info');
}

// ============================================================
// UI UPDATE
// ============================================================
function updateBalanceUI() {
  const b = getBalances();
  const a = Demo.account(); if (!a) return;
  const nm = document.getElementById('sidebarName'); if (nm) nm.textContent = a.fullName || 'User';
  const un = document.getElementById('sidebarUsername'); if (un) un.textContent = '@' + (a.username || 'user');
  const eEl = document.getElementById('sidebarEarnings'); if (eEl) eEl.textContent = formatPrice(b.earnings);
  const dEl = document.getElementById('sidebarDeposit'); if (dEl) dEl.textContent = formatPrice(b.deposit);
  updateNotificationBadge();
}

// ============================================================
// ADMIN SIMULATORS — ONLY REFERRALS LEFT
// ============================================================
function injectAdminSimulators() {
  const refContainer = document.querySelector('#section-referral .content-area');
  if (refContainer && !document.getElementById('adminSimRefBtn')) {
    const btn = document.createElement('button');
    btn.id = 'adminSimRefBtn';
    btn.className = 'btn-primary';
    btn.style.cssText = 'background:#9B59B6; margin-top:20px; width:100%;';
    btn.innerHTML = '🛠️ Simulate 10 Referrals (Demo)';
    btn.onclick = () => {
      Demo.update(s => { s.totalReferrals = (s.totalReferrals || 0) + 10; });
      Demo.notify('Referrals', 'Simulated 10 referrals added.', 'reward');
      showToast('Added 10 referrals', 'success');
      loadReferral();
    };
    refContainer.appendChild(btn);
  }
}

// ============================================================
// MIDNIGHT RESET LOGIC
// ============================================================
function checkMidnightReset() {
  const today = new Date().toISOString().slice(0, 10);
  const lastReset = localStorage.getItem('pandacard_demo_last_reset');
  
  if (lastReset !== today) {
    const resetScreen = document.getElementById('midnightResetScreen');
    if (resetScreen) resetScreen.style.display = 'flex';
    
    setTimeout(async () => {
      localStorage.setItem('pandacard_demo_last_reset', today);
      
      // Shuffle cards for demo
      const seed = (Demo.account()?.id || 'demo_seed') + '_' + today;
      APP.cards = APP.cards.filter(c => {
        if (c.is_disappearing) return true;
        const hashStr = `${seed}-${c.id}`;
        let hash = 0;
        for (let i = 0; i < hashStr.length; i++) hash = ((hash << 5) - hash) + hashStr.charCodeAt(i);
        return Math.abs(hash) % 100 < 50; // 50% for demo
      });

      if (document.getElementById('section-mining').classList.contains('active')) loadMining();
      if (document.getElementById('section-combo').classList.contains('active')) loadDailyCombo();
      if (resetScreen) resetScreen.style.display = 'none';
      showToast('Your new day is ready!', 'success');
    }, 3000); // Wait 3 seconds to simulate server sync
    return true;
  }
  return false;
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  setTimeout(() => {
    const sp = document.getElementById('splash');
    if (sp) { sp.style.opacity = '0'; setTimeout(() => sp.style.display = 'none', 600); }
  }, 1500);

  const account = demoGetSession();
  if (!account) { window.location.href = 'auth.html'; return; }

  APP.user = { id: account.id, email: account.email };
  APP.profile = account;

  try {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb.from('cards').select('*').eq('is_active', true).order('name');
      APP.cards = (data || []).filter(c => {
        if (c.is_disappearing) {
          const now = new Date().toISOString();
          return c.disappear_appears_at && c.disappear_appears_at <= now && c.disappear_expires_at > now;
        }
        return true;
      });

      // Check Midnight Reset
      const isResetting = checkMidnightReset();
      
      if (!isResetting) {
        // If not resetting, apply the current day's shuffle
        const todayStr = new Date().toISOString().slice(0, 10);
        const seed = (account.id || 'demo_seed') + '_' + todayStr;
        APP.cards = APP.cards.filter(c => {
          if (c.is_disappearing) return true;
          const hashStr = `${seed}-${c.id}`;
          let hash = 0;
          for (let i = 0; i < hashStr.length; i++) hash = ((hash << 5) - hash) + hashStr.charCodeAt(i);
          return Math.abs(hash) % 100 < 50;
        });
      }
    }
  } catch (e) { console.warn('Cards load failed', e); APP.cards = []; }

  startDemoBotEngine();
  sendWelcomeNotification();

  updateBalanceUI();
  updateCoinPricesUI();

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
window.tapMiningSlot = tapMiningSlot;
window.startMining = startMining;
window.completeDailyCombo = completeDailyCombo;
window.completeComboWithDisappearing = completeComboWithDisappearing;
window.claimSaturdayReward = claimSaturdayReward;
window.useDisappearingForStreak = useDisappearingForStreak;
window.demoSimulateDp = demoSimulateDp;
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
window.simulateReferral = simulateReferral;
window.submitContact = submitContact;
window.claimDailyReward = claimDailyReward;
window.buyCoins = buyCoins;
window.dismissWelcome = dismissWelcome;
window.installPWA = installPWA;
window.closeInstallModal = closeInstallModal;
window.togglePushNotifications = togglePushNotifications;
