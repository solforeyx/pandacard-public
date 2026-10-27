// ============================================================
// PANDA CARD — MAIN APP (LIVE MODE ONLY)
// ============================================================

const VAPID_PUBLIC_KEY = 'BCVPOe8TdN7OghMRpOHMZkPZ1F7oU7mKApl3LcEyDEM9I7Q1fLb_oBq-LX7k3ASviUG73jqnx7FRHbkdiX4M9kE';

// ✅ RESTORED SERVICE WORKER (Fixes Offline, 404, and Notifications)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}

let deferredPrompt = null;
const INSTALL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const APP = {
  user: null,
  profile: null,
  cards: [],
  assignedComboCardId: null, // Tracks your daily combo to hide from market
  dashTab: 'marketplace',
  tradeTab: 'buy',
  tradeFilter: 'all',
  tradeSearch: '',
  inventorySearch: '',
  portfolioDays: 7,
  portfolioChart: null,
  paymentMethod: null,
  livePublished: false,
  ratesLoaded: false
};

// ============================================================
// LOCAL NOTIFICATION & OS BAR CLEARING
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
// GETTERS
// ============================================================
function getBalances() {
  const p = APP.profile;
  return {
    earnings: p?.earnings_balance || 0,
    deposit: p?.deposit_balance || 0,
    coins: p?.coins || 0,
    dp: p?.diamond_points || 0,
    lifetimeEarned: p?.lifetime_earned || 0,
    lifetimeWithdrawn: p?.lifetime_withdrawn || 0,
    totalReferrals: p?.total_referrals || 0
  };
}

function getInventory() {
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
function isPWAInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        hideInstallUI();
      } else {
        localStorage.setItem('pwa_prompt_dismissed', Date.now());
      }
      deferredPrompt = null;
    });
  } else {
    window.location.href = '/PandaCard.apk';
  }
}

function closeInstallModal() {
  const modal = document.getElementById('installModal');
  if (modal) modal.classList.remove('open');
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
  
  const { count: liveCount } = await getSupabase()
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', APP.user.id)
    .eq('read', false);
  count = liveCount || 0;
  
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

async function togglePushNotifications() {
  const pushToggle = document.getElementById('settingsPushToggle');

  if (Notification.permission === 'granted') {
    showToast('To disable notifications, go to your browser/app settings.', 'info');
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('Notifications are blocked. Please allow them in your browser settings.', 'error');
    return;
  }

  const permission = await Notification.requestPermission();
  
  if (permission === 'granted') {
    if (pushToggle) pushToggle.classList.add('active');
    await subscribeUserToPush(false);
  } else {
    showToast('Notification permission denied.', 'error');
    if (pushToggle) pushToggle.classList.remove('active');
  }
}

async function subscribeUserToPush(isSilent = false) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (!isSilent) showToast('Push notifications are not supported on this device.', 'error');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    
    // If not, subscribe
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const sb = getSupabase();
    if (sb && APP.user) {
      const { error } = await sb.from('push_subscriptions').upsert({
        user_id: APP.user.id,
        subscription: subscription.toJSON()
      }, { onConflict: 'user_id' });
      
      if (error) throw error; 
      if (!isSilent) showToast('Push notifications enabled!', 'success');
    }
  } catch (err) {
    console.error('Push subscription failed:', err);
    if (!isSilent) showToast('Failed to enable push notifications: ' + err.message, 'error');
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
    if (c) {
      const qty = inv[id]?.quantity !== undefined ? inv[id].quantity : (inv[id] || 0);
      portfolioValue += (c.current_price || c.original_price || 0) * qty;
    }
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

  const welcomeSeen = localStorage.getItem('pandacard_welcome_seen');
  if (!welcomeSeen) {
    let name = APP.profile?.full_name || 'trader';
    el.innerHTML = `
      <div class="banner-alert info" style="margin-bottom:12px;">
        <span class="material-icons">celebration</span>
        <span class="banner-text">Welcome to Panda Card, ${escapeHtml(name)}! Your account is ready. Start trading!</span>
        <button class="banner-dismiss" onclick="dismissWelcome()">&times;</button>
      </div>
    `;
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
  
  const pinDone = !!APP.profile?.pin_hash;
  const installDone = isPWAInstalled();
  const pushDone = (typeof Notification !== 'undefined' && Notification.permission === 'granted');
  
  const today = new Date().toISOString().slice(0, 10);
  const rewardDone = APP.profile?.last_daily_claim === today;
  const depositDone = Number(APP.profile?.deposit_balance) > 0;
  const learnDone = localStorage.getItem('pandacard_learned') === 'true';
  const announcementDone = localStorage.getItem('pandacard_announce_read') === 'true';
  const buyDone = APP.profile?.owned_ever?.length > 0;

  if (pinDone && installDone && pushDone && rewardDone && depositDone && learnDone && announcementDone && buyDone) {
    el.innerHTML = '';
    return;
  }

  const rows = [
    { key: 'install', label: 'Install the Panda App', action: "installPWA()", done: installDone },
    { key: 'push', label: 'Enable Push Notifications', action: "navigateTo('settings')", done: pushDone },
    { key: 'pin', label: 'Set your security PIN', action: "navigateTo('settings');setTimeout(()=>openPinModal('set'), 300)", done: pinDone },
    { key: 'reward', label: 'Claim your daily reward', action: "navigateTo('dailyreward')", done: rewardDone },
    { key: 'deposit', label: 'Make your first deposit', action: "navigateTo('wallet')", done: depositDone },
    { key: 'learn', label: 'Learn how the app works', action: "localStorage.setItem('pandacard_learned','true'); navigateTo('live'); renderChecklist();", done: learnDone },
    { key: 'announcement', label: 'Check latest announcements', action: "localStorage.setItem('pandacard_announce_read','true'); navigateTo('announcements'); renderChecklist();", done: announcementDone },
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

// ============================================================
// THE NEW GRAPH LOGIC (ACCURATE CASH FLOW)
// ============================================================
let chartInstance = null;
let currentColourStage = 2; 

const COLOURS = [
    { name: "Red",    hex: "#ff4d5a" },
    { name: "Orange", hex: "#ff963d" },
    { name: "Yellow", hex: "#ffd54f" },
    { name: "Lemon",  hex: "#dfff00" },
    { name: "Green",  hex: "#29d391" }
];

const ICONS = {
    start: "circle-dot",
    card_purchase: "shopping-cart",
    card_sale: "tag",
    someone_bought_card: "hand-coins",
    coin_purchase: "coins",
    someone_bought_coins: "wallet",
    mining: "pickaxe",
    daily_combo: "gem",
    value_decrease: "trending-down"
};

const ICON_COLORS = {
    start: "#ffd54f",
    card_purchase: "#29d391",
    card_sale: "#ff6378",
    someone_bought_card: "#65a8ff",
    coin_purchase: "#ffd54f",
    someone_bought_coins: "#bb91ff",
    mining: "#65a8ff",
    daily_combo: "#ffc857",
    value_decrease: "#ff6378"
};

async function renderPortfolioChart() {
  const canvas = document.getElementById('portfolioChart');
  const chartInner = document.getElementById('chartInner');
  const chartScroll = document.getElementById('chartScroll');
  const markerLayer = document.getElementById('markerLayer');
  
  if (!canvas || typeof Chart === 'undefined') return;
  
  const ctx = canvas.getContext('2d');
  if (chartInstance) { try { chartInstance.destroy(); } catch (e) {} }
  if (markerLayer) markerLayer.innerHTML = '';

  // 1. Fetch all transactions
  const { data: txs } = await getSupabase().from('transactions')
    .select('*')
    .eq('user_id', APP.user.id)
    .order('created_at', { ascending: true });

  const events = [];
  let runningTotal = 0;
  currentColourStage = 2;

  // Initial state
  events.push({
    id: 0,
    type: 'start',
    title: 'Starting Balance',
    shortLabel: 'Start',
    assetName: 'Cash Flow',
    quantityLabel: 'Starting point',
    transactionAmount: 0,
    change: 0,
    before: 0,
    after: 0,
    colourStage: 2,
    time: new Date(Date.now() - (APP.portfolioDays * 24 * 60 * 60 * 1000))
  });

  (txs || []).forEach(tx => {
    let type = 'adjustment';
    let change = 0;
    let title = '';
    let val = Number(tx.amount) || 0; // ✅ Use ACTUAL amount from tx

    if (tx.type === 'deposit') {
        type = 'coin_purchase'; // Green
        change = val;
        title = 'Deposit';
    } else if (tx.type === 'marketplace_buy' || tx.type === 'trade_buy') {
      type = 'card_purchase'; // Red
      change = -val; // Money leaves deposit
      title = 'Card Purchased';
    } else if (tx.type === 'trade_sell') {
      type = 'someone_bought_card'; // Blue
      change = val; // Money enters earnings
      title = 'Card Sold';
    } else if (tx.type === 'mining_reward') {
      type = 'mining'; // Blue
      change = val; 
      title = 'Mining Reward';
    } else if (tx.type === 'daily_combo') {
      type = 'daily_combo'; // Gold
      change = val; 
      title = 'Combo Reward';
    } else if (tx.type === 'coin_buy') {
      type = 'coin_purchase';
      change = -val; 
      title = 'Coins Bought';
    } else if (tx.type === 'withdraw') {
        type = 'value_decrease';
        change = -val;
        title = 'Withdrawal';
    } else {
        return; // Skip Admin Adjust and unknown types
    }

    if (change === 0) return;

    if (change > 0) currentColourStage = Math.min(4, currentColourStage + 1);
    else if (change < 0) currentColourStage = Math.max(0, currentColourStage - 1);

    const before = runningTotal;
    runningTotal = Math.max(0, runningTotal + change);

    events.push({
      id: tx.id,
      type,
      title,
      shortLabel: title,
      assetName: 'Cash Flow',
      quantityLabel: '1 event',
      transactionAmount: Math.abs(val),
      change: change,
      before: before,
      after: runningTotal,
      colourStage: currentColourStage,
      time: new Date(tx.created_at)
    });
  });

  const cutoff = Date.now() - (APP.portfolioDays * 24 * 60 * 60 * 1000);
  const filteredEvents = events.filter(e => e.time.getTime() >= cutoff);
  
  if (filteredEvents.length > 0 && filteredEvents[0].type !== 'start') {
      filteredEvents.unshift({
          id: 0,
          type: 'start',
          title: 'Start of Period',
          shortLabel: 'Start',
          assetName: 'Cash Flow',
          quantityLabel: 'Starting point',
          transactionAmount: 0,
          change: 0,
          before: filteredEvents[0].before,
          after: filteredEvents[0].before,
          colourStage: 2,
          time: new Date(cutoff)
      });
  }

  const labels = filteredEvents.map(e => e.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const data = filteredEvents.map(e => e.after);

  if (chartInner) {
    chartInner.style.width = Math.max(650, (data.length + 1) * 150) + 'px';
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: COLOURS[2].hex,
        borderWidth: 3,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: false,
        segment: {
          borderColor: ctx => {
            const idx = ctx.p1DataIndex;
            if (idx === 0) return '#FFD700';
            return COLOURS[filteredEvents[idx].colourStage].hex;
          }
        }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#999', font: { size: 10 }, maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#999', font: { size: 10 }, callback: v => formatPrice(v) } }
      },
      animation: {
        onComplete: function() {
            drawMarkers(filteredEvents, markerLayer);
        }
      }
    }
  });

  setTimeout(() => {
    if (chartScroll) chartScroll.scrollLeft = chartScroll.scrollWidth;
    drawMarkers(filteredEvents, markerLayer);
  }, 100);
}

function drawMarkers(events, layer) {
    if (!layer) return;
    layer.innerHTML = '';
    const meta = chartInstance.getDatasetMeta(0);
    if (!meta || !meta.data) return;

    events.forEach((event, index) => {
        const point = meta.data[index];
        if (!point) return;

        const pos = point.getProps(['x', 'y'], true);
        
        const btn = document.createElement('div');
        btn.className = 'graph-marker';
        
        if (index === 0) {
            btn.classList.add('start-marker');
            btn.innerHTML = `<i data-lucide="circle-dot"></i>`;
        } else {
            const iconColor = ICON_COLORS[event.type] || '#FFD700';
            btn.style.setProperty('--icon-color', iconColor);
            
            const iconName = ICONS[event.type] || 'activity';
            btn.innerHTML = `
                <i data-lucide="${iconName}"></i>
                <span class="marker-label">
                    ${escapeHtml(event.title)}<br>
                    <span style="color:${iconColor};">${escapeHtml(formatPrice(event.transactionAmount))}</span>
                </span>
            `;
        }

        btn.style.left = pos.x + 'px';
        btn.style.top = pos.y + 'px';
        layer.appendChild(btn);
    });

    if (window.lucide) {
        window.lucide.createIcons({ root: layer, attrs: { 'stroke-width': 2 } });
    }
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
// MARKETPLACE (HIDES ASSIGNED COMBO CARD)
// ============================================================
async function renderMarketplaceGrid() {
  const grid = document.getElementById('marketplaceGrid');
  if (!grid) return;
  if (!APP.cards.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><span class="material-icons">inventory_2</span><p>No cards available</p></div>';
    return;
  }

  // 1. Fetch today's assigned combo card
  const today = new Date().toISOString().slice(0, 10);
  const { data: combo } = await getSupabase().from('daily_combo').select('assigned_card_id').eq('user_id', APP.user.id).eq('combo_date', today).maybeSingle();
  APP.assignedComboCardId = combo?.assigned_card_id || null;

  // 2. Apply 20% hiding + Combo hiding
  const todayStr = new Date().toISOString().slice(0, 10);
  const userSeed = (APP.user?.id || 'live_seed') + '_' + todayStr;
  const visiblePct = 80;
  
  const visibleCards = APP.cards.filter(c => {
    if (APP.assignedComboCardId && c.id === APP.assignedComboCardId) return false;
    if (c.is_disappearing) return true;
    
    const hashString = `${userSeed}-${c.id}`;
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) hash = ((hash << 5) - hash) + hashString.charCodeAt(i);
    return Math.abs(hash) % 100 < visiblePct;
  });

  const inv = getInventory();
  const grouped = { disappearing: [], bonus: [], vip: [], standard: [], newly: [] };
  let disappearingSeen = 0;

  visibleCards.forEach(c => {
    if (c.is_disappearing && c.is_active) {
      if (disappearingSeen < 1) { grouped.disappearing.push(c); disappearingSeen++; }
    }
    else if (c.is_bonus) grouped.bonus.push(c);
    else if (c.is_vip) grouped.vip.push(c);
    else if (c.status === 'newly') grouped.newly.push(c);
    else grouped.standard.push(c);
  });

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
  const grid = document.getElementById('dashInventoryGrid');
  const countEl = document.getElementById('dashInventoryCount');
  if (!grid) return;
  const inv = getInventory();
  const ids = Object.keys(inv).filter(id => (inv[id].quantity > 0 || inv[id] > 0));
  if (countEl) countEl.textContent = ids.length + ' cards';
  if (!ids.length) {
    grid.innerHTML = '<div class="empty-state"><span class="material-icons">inbox</span><p>No cards yet</p></div>';
    return;
  }
  
  grid.innerHTML = ids.slice(0, 9).map(id => {
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

  const qty = inv?.[card.id]?.quantity !== undefined ? inv[card.id].quantity : (inv?.[card.id] || 0);
  const owned = qty > 0 ? '<div style="position:absolute; bottom:8px; right:8px; background:#22C55E; color:#fff; padding:2px 8px; border-radius:10px; font-size:9px; font-weight:700; z-index:2;">OWNED</div>' : '';

  let timerHtml = '';
  if (card.is_disappearing && card.disappear_expires_at && qty === 0) {
    const expires = new Date(card.disappear_expires_at).getTime();
    const diff = expires - Date.now();
    if (diff > 0) {
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      timerHtml = `<div style="position:absolute; bottom:8px; left:8px; background:rgba(0,0,0,0.8); color:#fff; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; z-index:2; display:flex; align-items:center; gap:4px;"><span class="material-icons" style="font-size:10px;">schedule</span> ${hours}h ${mins}m</div>`;
    }
  } else if (card.status === 'newly' && card.created_at) {
    const created = new Date(card.created_at).getTime();
    const expires = created + (24 * 60 * 60 * 1000); 
    const diff = expires - Date.now();
    if (diff > 0) {
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      timerHtml = `<div style="position:absolute; bottom:8px; left:8px; background:rgba(0,0,0,0.8); color:#fff; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; z-index:2; display:flex; align-items:center; gap:4px;"><span class="material-icons" style="font-size:10px;">schedule</span> ${hours}h ${mins}m</div>`;
    }
  }

  let priceHtml = '';
  if (card.is_bonus) {
    priceHtml = `<div class="card-price" style="color:#FF6B35; font-weight:800; font-size:13px;">${card.bonus_referral_threshold || 10} Refs</div>`;
  } else {
    priceHtml = `<div class="card-price">${formatPrice(card.current_price || card.original_price || 0)}</div>`;
  }

  return `
    <div class="card-item ${frameClass}" data-card-id="${card.id}" onclick="openCardModal('${card.id}')">
      <div class="card-image">
        <img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
        ${badge}${owned}${timerHtml}
      </div>
      <div class="card-name">${escapeHtml(card.name)}</div>
      ${priceHtml}
    </div>`;
}

// ============================================================
// CARD MODAL
// ============================================================
function openCardModal(cardId) {
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  playSound('click');

  const inv = getInventory();
  const owned = inv[cardId]?.quantity !== undefined ? inv[cardId].quantity : (inv[cardId] || 0);
  const b = getBalances();
  const isVip = !!card.is_vip;
  const isBonus = !!card.is_bonus;
  const isDisappearing = !!card.is_disappearing;
  
  const coinFee = isBonus ? 0 : coinFeeForBuy(card.status || 'neutral', isVip);
  const originalPrice = card.original_price || card.current_price || 0;
  const currentPrice = card.current_price || originalPrice;
  const ceiling = originalPrice * 10;

  let actions = '';
  if (isBonus) {
    const req = card.bonus_referral_threshold || 10;
    const has = b.totalReferrals || 0;
    if (owned > 0) {
      actions = `<div style="text-align:center; padding:12px; background:#f0f0f5; border-radius:12px; font-weight:700; color:#999;">Already Claimed</div>`;
    } else if (has >= req) {
      actions = `<button class="btn-primary" onclick="claimBonusCard('${cardId}')">Claim Free Card</button>`;
    } else {
      actions = `<button class="btn-buy" disabled style="background:#ccc;color:#666;">Need ${req - has} More Referrals</button>`;
    }
  } else if (isDisappearing) {
    if (owned > 0) {
      actions = `<div style="text-align:center; padding:12px; background:#f0f0f5; border-radius:12px; font-weight:700; color:#999;">Already Owned</div>`;
    } else {
      actions = `<button class="btn-buy" onclick="closeCardModal();buyFromMarketplace('${cardId}')">Buy — ${formatPrice(currentPrice)} + ${coinFee} PC</button>`;
    }
  } else if (owned > 0) {
    actions = `
      <button class="btn-sell" onclick="closeCardModal();openSellModal('${cardId}')">Sell This Card</button>
      <button class="btn-primary" onclick="closeCardModal();navigateTo('inventory')">Go to Inventory</button>
    `;
  } else {
    const hasBought = APP.profile?.owned_ever?.includes(cardId); 
    if (hasBought) {
      actions = `<button class="btn-buy" onclick="closeCardModal();navigateTo('trade'); setTimeout(()=>{ document.getElementById('tradeSearchInput').value = '${card.name.replace(/'/g, "\\'")}'; filterTradeListings(); }, 300)">Find in Trade</button>`;
    } else {
      actions = `<button class="btn-buy" onclick="closeCardModal();buyFromMarketplace('${cardId}')">Buy — ${formatPrice(currentPrice)} + ${coinFee} PC</button>`;
    }
  }

  let detailRows = '';
  if (isBonus) {
    detailRows = `
      <div class="detail-row"><span class="label">Referrals Required</span><span class="value gold">${card.bonus_referral_threshold || 10}</span></div>
      <div class="detail-row"><span class="label">Your Referrals</span><span class="value">${b.totalReferrals || 0}</span></div>
    `;
  } else if (isDisappearing) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = card.disappear_day !== undefined ? days[card.disappear_day] : 'Special';
    detailRows = `
      <div class="detail-row"><span class="label">Availability</span><span class="value" style="color:#9B59B6;">${dayName} Card</span></div>
      <div class="detail-row"><span class="label">Current Price</span><span class="value gold">${formatPrice(currentPrice)}</span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value">SPECIAL</span></div>
    `;
  } else {
    detailRows = `
      <div class="detail-row"><span class="label">Original Price</span><span class="value">${formatPrice(originalPrice)}</span></div>
      <div class="detail-row"><span class="label">Current Price</span><span class="value gold">${formatPrice(currentPrice)}</span></div>
      <div class="detail-row"><span class="label">Floor</span><span class="value">${formatPrice(originalPrice)}</span></div>
      <div class="detail-row"><span class="label">Ceiling</span><span class="value">${formatPrice(ceiling)}</span></div>
      <div class="detail-row"><span class="label">Status</span><span class="value">${(card.status || 'neutral').toUpperCase()}</span></div>
      <div class="detail-row"><span class="label">Coin Fee</span><span class="value gold">${coinFee} PC</span></div>
    `;
  }

  document.getElementById('cardModalBody').innerHTML = `
    <div class="modal-card-image"><img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" alt="" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" /></div>
    <div class="modal-card-title">${escapeHtml(card.name)}</div>
    <div class="modal-card-id">ID: ${escapeHtml(card.card_code || card.id)}</div>
    
    ${detailRows}
    
    ${card.description ? `<div style="font-size:13px;color:#666;padding:12px 0;line-height:1.5;">${escapeHtml(card.description)}</div>` : ''}
    <div class="modal-actions">${actions}</div>
  `;
  document.getElementById('cardModal').classList.add('open');
}
function closeCardModal() { document.getElementById('cardModal').classList.remove('open'); }

async function claimBonusCard(cardId) {
  showLoading('Claiming...');
  try {
    const { data, error } = await getSupabase().functions.invoke('claim-bonus-card', { body: { cardId } });
    if (error || data?.error) throw new Error(data?.error || error.message);
    showToast('Bonus Card Claimed!', 'success');
    playSound('reward');
    await refreshLiveProfile();
    closeCardModal();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// BUY FROM MARKETPLACE
// ============================================================
async function buyFromMarketplace(cardId) {
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  const b = getBalances();
  const price = card.current_price || card.original_price || 0;
  const statusForFee = card.status === 'newly' ? 'newly' : (card.status || 'neutral');
  const coinFee = card.is_bonus ? 0 : coinFeeForBuy(statusForFee, !!card.is_vip);

  if (b.deposit < price) { showToast('Need ' + formatPrice(price) + ' in deposit balance', 'error'); playSound('error'); return; }
  if (b.coins < coinFee) { showToast('Need ' + coinFee + ' PC. You have ' + b.coins + '.', 'error'); playSound('error'); return; }

  if (!confirm('Buy ' + card.name + ' for ' + formatPrice(price) + ' + ' + coinFee + ' PC?')) return;
  showLoading('Purchasing...');

  try {
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
// SELL CARD
// ============================================================
function openSellModal(cardId) {
  const card = APP.cards.find(c => c.id === cardId);
  if (!card) return;
  const inv = getInventory();
  const invItem = inv[cardId];
  const qty = invItem?.quantity !== undefined ? invItem.quantity : (invItem || 0);
  
  if (qty <= 0) { showToast('You do not own this card', 'error'); return; }
  if (card.is_bonus || card.is_disappearing) { showToast('This card cannot be sold', 'error'); return; }

  playSound('click');
  const b = getBalances();
  const floor = card.original_price || card.current_price || 0;
  const ceiling = invItem?.ceiling_price || (floor * 10);
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
  
  const inv = getInventory();
  const invItem = inv[cardId];
  const ceiling = invItem?.ceiling_price || (floor * 10);

  if (!price || price < floor || price > ceiling) {
    showToast('Price must be between ' + formatPrice(floor) + ' and ' + formatPrice(ceiling), 'error');
    return;
  }

  const b = getBalances();
  if (b.coins < CONFIG.LISTING_COIN_FEE) {
    showToast('Need ' + CONFIG.LISTING_COIN_FEE + ' PC', 'error');
    return;
  }

  const qty = invItem?.quantity !== undefined ? invItem.quantity : (invItem || 0);
  if (qty <= 0) { showToast('You do not own this card', 'error'); return; }

  showLoading('Creating listing...');
  try {
    const { data, error } = await getSupabase().functions.invoke('create-listing', { body: { cardId, price } });
    if (error || data?.error) throw new Error(data?.error || error.message);
    showToast('Listed successfully', 'success'); playSound('reward'); closeSellModal();
    await refreshLiveProfile(); loadInventory(); loadTrade(); loadDashboard();
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
  let myId = APP.user.id;

  const { data } = await getSupabase().from('listings').select('*').eq('status', 'active').gt('remaining', 0);
  listings = data || [];

  listings = listings.filter(l => l.status === 'active' && l.remaining > 0 && (l.sellerId || l.seller_id) !== myId);
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
    
    const qty = inv[card.id]?.quantity !== undefined ? inv[card.id].quantity : (inv[card.id] || 0);
    const owned = qty > 0;

    html += `
      <div class="listing-item" style="display:flex; align-items:center; gap:12px; padding:12px;">
        <img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:50px; height:65px; border-radius:8px; object-fit:cover;" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
        <div class="info" style="flex:1;">
          <div class="name" style="color:#1A1A2E; font-weight:700;">${escapeHtml(card.name)}</div>
          <div class="price" style="color:#FFD700; font-weight:800;">${formatPrice(l.current_effective_price || l.price)}</div>
          <div class="units" style="font-size:11px; color:#999;">${l.remaining}/${l.units} units</div>
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
  
  const { data } = await getSupabase().from('listings').select('*').eq('status', 'active').eq('seller_id', APP.user.id);
  mine = data || [];

  if (!mine.length) {
    el.innerHTML = '<div class="empty-state"><span class="material-icons">sell</span><p>No active listings</p><button class="btn-action" style="max-width:200px;margin:16px auto 0;" onclick="navigateTo(\'inventory\')">Go to Inventory</button></div>';
    return;
  }
  
  el.innerHTML = mine.map(l => {
    const card = APP.cards.find(c => c.id === (l.cardId || l.card_id)) || { name: 'Card' };
    const canCancel = l.remaining === l.units;
    return `
      <div class="listing-item" style="display:flex; align-items:center; gap:12px; padding:12px;">
        <img src="${escapeHtml(card.image_url || 'https://i.imgur.com/9aLmHyS.png')}" style="width:50px; height:65px; border-radius:8px; object-fit:cover;" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
        <div class="info" style="flex:1;">
          <div class="name" style="font-weight:700;">${escapeHtml(card.name)}</div>
          <div class="price" style="color:#FFD700; font-weight:800;">${formatPrice(l.price)}</div>
          <div class="units" style="font-size:11px; color:#999;">${l.remaining}/${l.units} units</div>
        </div>
        ${canCancel ? `<button class="buy-btn sell" onclick="cancelListing('${l.id}')">Cancel</button>` : `<button class="buy-btn" disabled style="background:#ccc;color:#666;font-size:11px;">1 Sold</button>`}
      </div>`;
  }).join('');
}

async function buyFromTrade(listingId) {
  if (!confirm('Buy this card?')) return;
  showLoading('Purchasing...');
  try {
    const { data, error } = await getSupabase().functions.invoke('buy-from-trade', { body: { listingId } });
    if (error || data?.error) throw new Error(data?.error || error.message);
    await refreshLiveProfile();
    loadTrade(); loadDashboard();
    showToast('Purchased!', 'success'); playSound('reward');
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
    const { data, error } = await getSupabase().functions.invoke('cancel-listing', { body: { listingId } });
    if (error || data?.error) throw new Error(data?.error || error.message);
    await refreshLiveProfile();
    loadTrade(); loadInventory();
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
}

function renderInventoryFull() {
  const grid = document.getElementById('inventoryFullGrid');
  if (!grid) return;
  const inv = getInventory();
  let ids = Object.keys(inv).filter(id => (inv[id].quantity > 0 || inv[id] > 0));
  if (APP.inventorySearch) {
    ids = ids.filter(id => {
      const c = APP.cards.find(x => x.id === id);
      return c && c.name.toLowerCase().includes(APP.inventorySearch);
    });
  }
  if (!ids.length) {
    grid.innerHTML = '<div class="empty-state"><span class="material-icons">inbox</span><p>No cards in inventory</p></div>';
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
// MINING (FULL FRONTEND LOGIC WITH PERMANENT BLACKLIST)
// ============================================================
let currentMiningSlots = [null, null, null];

async function loadMining() {
  const sb = getSupabase();
  if (!sb) return;

  const createdDate = new Date(APP.profile?.created_at || 0).toDateString();
  const todayDate = new Date().toDateString();
  
  if (createdDate === todayDate) {
    document.getElementById('miningCostInfo').textContent = "Your account is new. Mining starts tomorrow!";
    ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('miningStartBtn').disabled = true;
    return;
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentHour = now.getUTCHours();
  const sessionSlot = currentHour < 12 ? 'AM' : 'PM';

  let { data: assignment, error: fetchErr } = await sb.from('daily_mining')
    .select('*')
    .eq('user_id', APP.user.id)
    .eq('session_date', today)
    .eq('session_slot', sessionSlot)
    .maybeSingle();

  if (fetchErr) {
    alert("DB FETCH ERROR: " + fetchErr.message);
    return;
  }

  if (assignment && (!assignment.card_ids || assignment.card_ids.length === 0)) {
    await sb.from('daily_mining').delete().eq('id', assignment.id);
    assignment = null;
  }

  if (!assignment) {
    if (!APP.cards || APP.cards.length === 0) {
       alert("APP.CARDS IS EMPTY! The cards did not load from the database.");
       document.getElementById('miningCostInfo').textContent = "No cards loaded. Please refresh.";
       return;
    }

    // ✅ 1. GET PERMANENT HISTORY (Blacklist)
    const { data: pastMining } = await sb.from('daily_mining')
      .select('card_ids')
      .eq('user_id', APP.user.id);
      
    const minedBlacklist = new Set();
    if (pastMining) {
      pastMining.forEach(record => {
        if (record.card_ids) {
          record.card_ids.forEach(id => minedBlacklist.add(id));
        }
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const userSeed = (APP.user?.id || 'live_seed') + '_' + todayStr;
    
    // 2. Apply 20% hiding filter
    const visibleCards = APP.cards.filter(c => {
      if (c.is_disappearing) return true;
      const hashString = `${userSeed}-${c.id}`;
      let hash = 0;
      for (let i = 0; i < hashString.length; i++) hash = ((hash << 5) - hash) + hashString.charCodeAt(i);
      return Math.abs(hash) % 100 < 80; // 80% visible
    });

    const stage = getStage();
    const cfg = getStageConfig(stage);
    
    // 3. Filter by stage, exclude bonus/disappearing, AND exclude the blacklist
    let pool = visibleCards.filter(c => 
      !c.is_bonus && !c.is_disappearing && c.is_active &&
      !minedBlacklist.has(c.id) && 
      (c.current_price || c.original_price) >= cfg.minCardPrice &&
      (c.current_price || c.original_price) <= cfg.maxCardPrice
    );

    if (pool.length < 3) {
      pool = visibleCards.filter(c => !c.is_bonus && !c.is_disappearing && c.is_active && !minedBlacklist.has(c.id));
    }

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const picked = shuffled.slice(0, 3).map(c => c.id);

    // ✅ EDGE CASE: What if they have mined ALL eligible cards?
    if (picked.length === 0) {
       alert("You have mined all eligible cards in your current stage! You must rank up to access new cards for mining.");
       document.getElementById('miningCostInfo').textContent = "All eligible cards have been mined.";
       document.getElementById('miningStartBtn').disabled = true;
       return;
    }

    if (sessionSlot === 'PM') {
      await sb.from('daily_mining').delete().eq('user_id', APP.user.id).eq('session_date', today).eq('session_slot', 'AM');
    }

    const { data: newAssign, error: insErr } = await sb.from('daily_mining').insert({
      user_id: APP.user.id,
      session_date: today,
      session_slot: sessionSlot,
      card_ids: picked,
      completed: false
    }).select().single();

    if (insErr) {
      alert("MINING SAVE ERROR: " + insErr.message);
      document.getElementById('miningCostInfo').textContent = "Save Error: " + insErr.message;
      return;
    }
    assignment = newAssign;
  }

  if (assignment && assignment.card_ids && assignment.card_ids.length > 0) {
    currentMiningSlots = assignment.card_ids;
    document.getElementById('miningSessionsUsed').textContent = (assignment.completed ? '1' : '0') + '/2';
    document.getElementById('miningCostInfo').textContent = "Tap the cards to verify ownership.";
    renderMiningUI();
  } else {
    document.getElementById('miningCostInfo').textContent = "No eligible cards for mining today.";
    document.getElementById('miningStartBtn').disabled = true;
    ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

function renderMiningUI() {
  const inv = getInventory();
  let allOwned = true;
  let filledSlots = 0;

  ['miningSlot1', 'miningSlot2', 'miningSlot3'].forEach((elId, index) => {
    const el = document.getElementById(elId);
    if (!el) return;
    
    const cardId = currentMiningSlots[index];
    if (!cardId) {
      el.style.display = 'none';
      return;
    }
    
    filledSlots++;
    el.style.display = 'block';
    el.className = 'card-item';
    el.onclick = null;
    
    const card = APP.cards.find(c => c.id === cardId);
    if (!card) {
      el.innerHTML = `<div style="padding:20px;text-align:center;font-size:10px;color:#999;">Card Missing</div>`;
      return;
    }

    const mktQty = (inv[card.id]?.marketplace_quantity || 0);
    const trdQty = (inv[card.id]?.trade_quantity || 0);

    let statusHtml = '';
    let opacity = '0.4';

    if (mktQty > 0) {
      allOwned = true;
      opacity = '1';
      statusHtml = `<div style="color:#22C55E;font-size:9px;font-weight:bold;">Ready</div>`;
    } else if (trdQty > 0) {
      allOwned = false;
      statusHtml = `<div style="color:#FF4444;font-size:9px;font-weight:bold;">Trade (Invalid)</div>`;
      el.onclick = () => handleTradeCardReRoll(index, card);
    } else {
      allOwned = false;
      statusHtml = `<div style="color:#FF4444;font-size:9px;font-weight:bold;">Need to buy</div>`;
      el.onclick = () => {
        showToast('Please buy this card from the Marketplace', 'info');
        navigateTo('dashboard'); 
        setTimeout(() => { switchDashTab('marketplace'); }, 300); 
      };
    }

    el.innerHTML = `
      <img src="${card.image_url || 'https://i.imgur.com/9aLmHyS.png'}" style="width:100%;border-radius:8px;opacity:${opacity};" onerror="this.src='https://i.imgur.com/9aLmHyS.png'" />
      <div style="font-size:10px;font-weight:bold;margin-top:4px;">${card.name}</div>
      ${statusHtml}
    `;
  });

  const btn = document.getElementById('miningStartBtn');
  if (allOwned && filledSlots > 0) {
    btn.disabled = false;
    btn.style.background = '#FFD700';
    document.getElementById('miningCostInfo').textContent = "All cards ready. Tap Start Mining.";
  } else {
    btn.disabled = true;
    btn.style.background = '#888';
    document.getElementById('miningCostInfo').textContent = "Fix the slots to proceed.";
  }
}

function handleTradeCardReRoll(index, card) {
  showToast('This card was bought from Trade and cannot be used for mining. Replacing it...', 'error');
  
  const stage = getStage();
  const cfg = getStageConfig(stage);
  const inv = getInventory();
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const userSeed = (APP.user?.id || 'live_seed') + '_' + todayStr;

  const visibleCards = APP.cards.filter(c => {
    if (c.is_disappearing) return true;
    const hashString = `${userSeed}-${c.id}`;
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) hash = ((hash << 5) - hash) + hashString.charCodeAt(i);
    return Math.abs(hash) % 100 < 80; 
  });
  
  const pool = visibleCards.filter(c => 
    !c.is_bonus && 
    !c.is_disappearing && 
    c.is_active &&
    (c.current_price || c.original_price) >= cfg.minCardPrice &&
    (c.current_price || c.original_price) <= cfg.maxCardPrice &&
    !currentMiningSlots.includes(c.id)
  );

  pool.sort(() => 0.5 - Math.random());
  
  let replacement = null;
  for (const c of pool) {
    const i = inv[c.id];
    if (!i || (i.marketplace_quantity || 0) > 0) {
      replacement = c.id;
      break;
    }
  }

  if (replacement) {
    currentMiningSlots[index] = replacement;
    showToast(`Replaced with ${APP.cards.find(c=>c.id===replacement).name}`, 'success');
    renderMiningUI();
  } else {
    currentMiningSlots[index] = null;
    showToast('No replacement card found. Slot removed.', 'error');
    renderMiningUI();
  }
}

async function startMining() {
  const validSlots = currentMiningSlots.filter(id => id !== null);
  if (validSlots.length === 0) return showToast('No cards selected', 'error');
  
  const inv = getInventory();
  let allReady = true;
  validSlots.forEach(id => {
    if ((inv[id]?.marketplace_quantity || 0) === 0) allReady = false;
  });
  
  if (!allReady) return showToast('You must own all cards from Marketplace', 'error');
  
  if (!confirm(`Mine these ${validSlots.length} cards? They will be permanently burned.`)) return;
  
  showLoading('Mining...');
  try {
    const { data, error } = await getSupabase().functions.invoke('mining', { body: { cardIds: validSlots } });
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
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// DAILY COMBO (SAT/SUN SCREENS & NEW USER LOGIC)
// ============================================================
async function loadDailyCombo() {
  const day = new Date().getDay();
  const weekdayScreen = document.getElementById('comboWeekdayScreen');
  const satScreen = document.getElementById('comboSaturdayScreen');
  const sunScreen = document.getElementById('comboSundayScreen');

  const createdAt = new Date(APP.profile?.created_at || 0);
  const isNewUser = (Date.now() - createdAt.getTime()) < (24 * 60 * 60 * 1000);
  
  if (day === 0) {
    weekdayScreen.style.display = 'none';
    satScreen.style.display = 'none';
    sunScreen.style.display = 'block';
    return;
  }
  
  if (day === 6) {
    weekdayScreen.style.display = 'none';
    satScreen.style.display = 'block';
    sunScreen.style.display = 'none';
    
    if (isNewUser) {
      document.getElementById('saturdayStreakSlots').innerHTML = `<div style="text-align:center; width:100%; color:#666; font-size:14px;">You just joined!</div>`;
      document.getElementById('saturdayRewardAction').innerHTML = `
        <div style="text-align:center; padding:20px;">
          <h3 style="color:#FFD700; font-size:20px; font-weight:800; margin-bottom:8px;">Happy Saturday!</h3>
          <p style="color:#666; font-size:14px;">Your daily combos will start on Monday.</p>
        </div>
      `;
      return;
    }

    const today = new Date();
    const fiveDaysAgo = new Date(today); fiveDaysAgo.setDate(today.getDate() - 5);
    const { data: combos } = await getSupabase().from('daily_combo')
      .select('combo_date, completed')
      .eq('user_id', APP.user.id)
      .gte('combo_date', fiveDaysAgo.toISOString().slice(0, 10))
      .order('combo_date', { ascending: true });
      
    let slotsHtml = '';
    for (let i = 0; i < 5; i++) {
      const d = new Date(fiveDaysAgo); d.setDate(d.getDate() + i + 1);
      const dStr = d.toISOString().slice(0, 10);
      const c = (combos || []).find(x => x.combo_date === dStr);
      const isDone = c && c.completed;
      
      slotsHtml += `
        <div class="streak-slot ${isDone ? 'done' : 'missed'}" onclick="${!isDone ? "useDisappearingForStreak()" : ""}">
          ${isDone ? '✓' : '✕'}
        </div>
      `;
    }
    document.getElementById('saturdayStreakSlots').innerHTML = slotsHtml;
    document.getElementById('saturdayRewardAction').innerHTML = `
      <button class="btn-primary" onclick="claimSaturdayReward()">Claim Week Reward (+40 DP)</button>
    `;
    return;
  }

  weekdayScreen.style.display = 'block';
  satScreen.style.display = 'none';
  sunScreen.style.display = 'none';

  if (isNewUser) {
    document.getElementById('comboCardArea').innerHTML = `
      <div class="empty-state">
        <span class="material-icons" style="font-size:48px; color:#FFD700; margin-bottom:12px;">wb_sunny</span>
        <h3 style="margin-bottom:8px; color:#1A1A2E;">Account is new!</h3>
        <p style="color:#666; font-size:13px;">Your Daily Combo starts tomorrow. Get ready!</p>
      </div>`;
    document.getElementById('comboActionArea').innerHTML = '';
    document.getElementById('comboProgress').innerHTML = '';
    return;
  }

  const sb = getSupabase();
  if (!sb) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data: combos } = await sb.from('daily_combo').select('*').eq('user_id', APP.user.id).eq('combo_date', today).limit(1);
  
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
    
    const inv = getInventory(); 
    const qty = inv[combo.assigned_card_id]?.quantity !== undefined ? inv[combo.assigned_card_id].quantity : (inv[combo.assigned_card_id] || 0);
    const owned = qty > 0;
    const action = document.getElementById('comboActionArea');
    
    if (combo.completed) {
      action.innerHTML = '<div style="text-align:center;padding:16px;background:#22C55E;color:#fff;border-radius:12px;font-weight:700;">Completed Today</div>';
    } else if (owned) {
      action.innerHTML = `<button class="btn-primary" onclick="completeDailyCombo('${combo.id}')">Complete Combo (+12 DP)</button>`;
    } else {
      action.innerHTML = `<button class="btn-primary" onclick="navigateTo('trade'); setTimeout(()=>{ document.getElementById('tradeSearchInput').value = '${card.name.replace(/'/g, "\\'")}'; filterTradeListings(); }, 300)">Find in Trade</button>`;
    }
  }
}

async function completeDailyCombo(comboId) {
  showLoading('Completing combo...');
  try {
    const { data, error } = await getSupabase().functions.invoke(
      'daily-combo?action=complete',
      { body: { comboId } }
    );
    if (error || data?.error) throw new Error(data?.error || error.message);
    
    if (data.reassigned) {
      showToast('You bought this from the Marketplace! Assigned a new card for you.', 'info');
      loadDailyCombo(); 
      return;
    }

    showToast(`Combo complete! Earned ${data.total_dp} DP`, 'success');
    playSound('reward');
    await refreshLiveProfile();
    loadDailyCombo();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function useDisappearingForStreak() {
  if (!confirm('Use 1 Disappearing Card to fill ALL missing days? It will be consumed.')) return;
  
  showLoading('Applying card...');
  try {
    const { data, error } = await getSupabase().functions.invoke(
      'daily-combo?action=fix-streak',
      { body: {} }
    );
    if (error || data?.error) throw new Error(data?.error || error.message);
    
    showToast('All missing days filled!', 'success');
    playSound('reward');
    await refreshLiveProfile();
    loadDailyCombo(); 
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// WALLET (ADMIN SIMULATORS)
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

  const isAdmin = APP.profile?.email === 'solforeyx@gmail.com'; 
  const container = document.querySelector('#section-wallet .content-area');
  
  if (isAdmin && container && !document.getElementById('adminSimDepositBtn')) {
    const btnDep = document.createElement('button');
    btnDep.id = 'adminSimDepositBtn';
    btnDep.className = 'btn-primary';
    btnDep.style.cssText = 'width:100%; margin-top:20px; background:#9B59B6;';
    btnDep.innerHTML = '🛠️ Admin: Simulate Deposit';
    btnDep.onclick = adminSimulateDeposit;
    container.appendChild(btnDep);
    
    const btnDp = document.createElement('button');
    btnDp.id = 'adminSimDpBtn';
    btnDp.className = 'btn-primary';
    btnDp.style.cssText = 'width:100%; margin-top:10px; background:#4A90D9;';
    btnDp.innerHTML = '🛠️ Admin: Simulate DP (+100)';
    btnDp.onclick = adminSimulateDp;
    container.appendChild(btnDp);
  }
}

async function adminSimulateDeposit() {
  if (APP.profile?.email !== 'solforeyx@gmail.com') return showToast('Not authorized', 'error');
  const amountStr = prompt('Enter amount to simulate (NGN):', '20000');
  if (!amountStr) return;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return showToast('Invalid amount', 'error');

  showLoading('Simulating...');
  try {
    const sb = getSupabase();
    const newBal = Number(APP.profile.deposit_balance || 0) + amount;
    await sb.from('users').update({ deposit_balance: newBal }).eq('id', APP.user.id);
    await sb.from('transactions').insert({ user_id: APP.user.id, type: 'deposit', amount: amount, reference: 'ADMIN_SIM_' + Date.now(), metadata: { gateway: 'admin' } });
    await refreshLiveProfile();
    loadWallet();
    showToast('Deposited ₦' + amount.toLocaleString(), 'success');
  } catch (err) { showToast(err.message, 'error'); } finally { hideLoading(); }
}

async function adminSimulateDp() {
  if (APP.profile?.email !== 'solforeyx@gmail.com') return showToast('Not authorized', 'error');
  showLoading('Simulating...');
  try {
    const sb = getSupabase();
    const newDp = Number(APP.profile.diamond_points || 0) + 100;
    await sb.from('users').update({ diamond_points: newDp }).eq('id', APP.user.id);
    await refreshLiveProfile();
    loadWallet();
    showToast('Added 100 DP', 'success');
  } catch (err) { showToast(err.message, 'error'); } finally { hideLoading(); }
}

function renderBankDetails() {
  const el = document.getElementById('walletBankDetails');
  if (!el) return;
  el.innerHTML = APP.profile?.bank_details ? `<div style="line-height:1.6;"><b>${escapeHtml(APP.profile.bank_details.bank)}</b><br/>${escapeHtml(APP.profile.bank_details.accountName)}<br/>${escapeHtml(APP.profile.bank_details.accountNumber)}</div>` : 'No bank details saved.';
}

async function renderWalletHistory() {
  const el = document.getElementById('walletHistory');
  if (!el) return;
  
  const { data } = await getSupabase().from('transactions').select('*').eq('user_id', APP.user.id).order('created_at', { ascending: false }).limit(15);
  if (!data || !data.length) { el.textContent = 'No recent transactions.'; return; }
  
  // ✅ MEANINGFUL DESCRIPTIONS
  el.innerHTML = data.map(tx => {
    let desc = tx.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let amtColor = '#666';
    let amtStr = '—';

    const metaCard = tx.metadata?.card_name || tx.metadata?.card || 'Card';

    if (tx.type === 'marketplace_buy') { desc = `Bought ${metaCard}`; amtColor = '#FF4444'; amtStr = `-${formatPrice(tx.amount)}`; }
    else if (tx.type === 'trade_buy') { desc = `Bought ${metaCard} (Trade)`; amtColor = '#FF4444'; amtStr = `-${formatPrice(tx.amount)}`; }
    else if (tx.type === 'trade_sell') { desc = `Sold ${metaCard}`; amtColor = '#22C55E'; amtStr = `+${formatPrice(tx.amount)}`; }
    else if (tx.type === 'deposit') { desc = 'Deposited Funds'; amtColor = '#22C55E'; amtStr = `+${formatPrice(tx.amount)}`; }
    else if (tx.type === 'withdraw') { desc = 'Withdrawal Request'; amtColor = '#FF4444'; amtStr = `-${formatPrice(tx.amount)}`; }
    else if (tx.type === 'mining_reward') { desc = 'Mining Reward'; amtColor = '#22C55E'; amtStr = `+${formatPrice(tx.amount)}`; }
    else if (tx.type === 'coin_buy') { desc = 'Coins Purchased'; amtColor = '#FF4444'; amtStr = `-${formatPrice(tx.amount)}`; }
    else if (tx.type === 'daily_combo') { desc = 'Daily Combo Reward'; amtColor = '#22C55E'; amtStr = `+${formatPrice(tx.amount)}`; }
    else if (tx.type === 'admin_adjust') { desc = `Admin: ${tx.metadata?.reason || 'Adjustment'}`; amtColor = '#666'; amtStr = formatPrice(tx.amount); }

    return `<div class="bank-info" style="padding:8px 0; border-bottom:1px solid #eee;"><span class="label">${escapeHtml(desc)}</span><span class="value" style="color:${amtColor}; font-weight:bold;">${amtStr}</span></div>`;
  }).join('');
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

  showLoading('Initializing payment...');
  try {
    const { data, error } = await getSupabase().functions.invoke('initialize-deposit', { body: { amount, gateway: APP.paymentMethod } });
    if (error || data?.error) throw new Error(data?.error || error.message);
    window.location.href = data.url; 
  } catch (err) {
    showToast(err.message, 'error'); hideLoading();
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
  const useBonus = document.getElementById('useBonusCard')?.checked;
  const minAmt = useBonus ? 5000 : 20000;
  const amt = parseFloat(document.getElementById('withdrawAmount')?.value) || 0;
  const dpNeeded = amt > 0 ? dpRequiredForWithdrawal(amt) : 0;
  el.innerHTML = `
    <div>Earnings: <b>${formatPrice(b.earnings)}</b></div>
    <div>DP: <b>${b.dp}</b>${amt > 0 ? ' / ' + dpNeeded + ' needed' : ''}</div>
    <div style="margin-top:4px;color:${b.earnings >= amt && amt >= minAmt ? '#22C55E' : '#FF4444'};">
      ${amt >= minAmt ? (b.earnings >= amt ? 'Ready' : 'Insufficient balance') : 'Minimum ' + formatPrice(minAmt)}
    </div>`;
}

function toggleBonusWithdraw() {
  const use = document.getElementById('useBonusCard').checked;
  const amtInput = document.getElementById('withdrawAmount');
  const container = document.getElementById('bonusCardSelectionContainer');
  
  if (amtInput) {
    amtInput.min = use ? 5000 : 20000;
    amtInput.placeholder = use ? 'Min ₦5,000' : 'Min ₦20,000';
  }

  if (!container) return;
  if (!use) { container.innerHTML = ''; return; }

  const inv = getInventory();
  const bonusIds = Object.keys(inv).filter(id => {
    const c = APP.cards.find(x => x.id === id);
    return c && c.is_bonus && (inv[id]?.quantity || 0) > 0;
  });
  
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

async function submitWithdraw() {
  const b = getBalances();
  const amt = parseFloat(document.getElementById('withdrawAmount').value);
  const pin = document.getElementById('withdrawPin').value;
  const useBonus = document.getElementById('useBonusCard').checked;
  const selectedBonusId = useBonus ? document.querySelector('input[name="bonusCardChoice"]:checked')?.value : null;

  if (!isValidPin(pin)) { alert('PIN must be 4 digits'); return; }
  if (!amt || amt < (useBonus ? 5000 : 20000)) { alert('Invalid amount'); return; }
  if (useBonus && !selectedBonusId) { alert('Please select a Bonus Card'); return; }
  
  showLoading('Processing withdrawal...');
  try {
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('https://dxxhlaxdudtiktplwvbq.supabase.co/functions/v1/withdrawal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount: amt, pin, useBonusCard: useBonus, bonusCardId: selectedBonusId })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert("WITHDRAWAL FAILED: " + (data.error || data.message || `Error ${res.status}`));
      throw new Error(data.error || data.message || `Error ${res.status}`);
    }

    showToast('Withdrawal requested successfully', 'success');
    playSound('reward');
    await refreshLiveProfile();
    closeWithdrawModal(); loadWallet(); loadDashboard();
  } catch (err) {
    // Do nothing here, alert already showed it
  } finally {
    hideLoading();
  }
}

function openBankDetailsModal() {
  const bankDetails = APP.profile?.bank_details;
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

  showLoading('Saving...');
  try {
    const { error } = await getSupabase().from('users').update({ bank_details: { bank, accountName: name, accountNumber: num } }).eq('id', APP.user.id);
    if (error) throw error;
    await refreshLiveProfile();
    showToast('Bank saved', 'success');
    closeBankModal(); renderBankDetails();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
// PROFILE
// ============================================================
function loadProfile() {
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

async function saveProfile() {
  const phone = document.getElementById('profilePhone').value.trim();
  const address = document.getElementById('profileAddress').value.trim();
  
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

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  const dm = document.getElementById('settingsDarkToggle');
  if (dm) dm.classList.toggle('active', document.body.classList.contains('dark-mode'));
  const snd = document.getElementById('settingsSoundToggle');
  if (snd) snd.classList.toggle('active', isSoundEnabled());

  const langEl = document.getElementById('settingsLanguage');
  if (langEl) {
    const saved = localStorage.getItem('pandacard_language') || 'en';
    langEl.textContent = languageName(saved);
  }

  const pinLabel = document.getElementById('pinSettingsLabel');
  if (pinLabel) {
    pinLabel.textContent = APP.profile?.pin_hash ? 'Change PIN' : 'Set PIN';
  }

  const mode = localStorage.getItem('pandacard_mode') || 'demo';
  const btnDemo = document.getElementById('modeBtnDemo');
  const btnLive = document.getElementById('modeBtnLive');
  if (btnDemo) btnDemo.classList.toggle('active', mode === 'demo');
  if (btnLive) btnLive.classList.toggle('active', mode === 'live');
  const helper = document.getElementById('modeHelperText');
  if (helper) helper.textContent = mode === 'demo' ? 'Demo mode: local data only' : 'Live mode: real money';

  const settingsContainer = document.querySelector('#section-settings .content-area');
  if (settingsContainer && !document.getElementById('settingsPushToggle')) {
    const pushSection = document.createElement('div');
    pushSection.className = 'section';
    pushSection.innerHTML = `
      <div class="section-title"><span class="material-icons">notifications_active</span> Alerts</div>
      <p style="font-size:12px;color:#999;margin-bottom:12px;">Get notified when your cards sell or when demand is high.</p>
      <div class="settings-item">
        <div class="left"><span class="material-icons">notifications</span><span class="label">Push Notifications</span></div>
        <div class="right">
          <div class="toggle" id="settingsPushToggle" onclick="togglePushNotifications()">
            <div class="thumb"></div>
          </div>
        </div>
      </div>
    `;
    settingsContainer.appendChild(pushSection);

    const pushToggle = document.getElementById('settingsPushToggle');
    if (pushToggle && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      pushToggle.classList.add('active');
    }
  }
}

function toggleSound() {
  const v = !isSoundEnabled();
  localStorage.setItem(STORAGE.SOUND, String(v));
  const el = document.getElementById('settingsSoundToggle');
  if (el) el.classList.toggle('active', v);
  showToast(v ? 'Sound on' : 'Sound off', 'success');
}

function openPinModal(mode) { 
  const currentGroup = document.getElementById('currentPinGroup');
  if (currentGroup) currentGroup.style.display = (mode === 'change' && APP.profile?.pin_hash) ? 'block' : 'none';
  document.getElementById('pinModal').classList.add('open'); 
}
function closePinModal() { document.getElementById('pinModal').classList.remove('open'); }

async function savePin() {
  const newP = document.getElementById('pinNew').value;
  const conf = document.getElementById('pinConfirm').value;
  if (!isValidPin(newP)) { showToast('PIN must be 4 digits', 'error'); return; }
  if (newP !== conf) { showToast('PINs do not match', 'error'); return; }
  
  showLoading('Saving PIN...');
  try {
    const { error } = await getSupabase().rpc('update_user_pin', { p_pin_hash: demoHashPassword(newP) });
    if (error) throw error;
    await refreshLiveProfile(); 
    showToast('PIN saved', 'success');
    closePinModal();
    loadSettings();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
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

function openDeleteAccountModal() { document.getElementById('deleteAccountModal').classList.add('open'); }
function closeDeleteAccountModal() { document.getElementById('deleteAccountModal').classList.remove('open'); }

async function confirmDeleteAccount() {
  const v = document.getElementById('deleteConfirmInput').value.trim();
  if (v !== 'DELETE') { showToast('Type DELETE to confirm', 'error'); return; }
  
  if (!confirm('This will start a 30-day permanent deletion countdown.\n\nYou can request revival before the timer ends. After that, your account and ALL data will be permanently erased.\n\nContinue?')) return;
  
  showLoading('Scheduling deletion...');
  try {
    const { data, error } = await getSupabase().functions.invoke('request-account-deletion', {
      body: { reason: 'User requested from settings', days: 30 }
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    
    closeDeleteAccountModal();
    showToast('Account scheduled for deletion. Redirecting...', 'success');
    setTimeout(() => { window.location.href = 'deletion-pending.html'; }, 1200);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to submit deletion request', 'error');
  }
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
  
  const { data } = await getSupabase().from('notifications').select('*').eq('user_id', APP.user.id).order('created_at', { ascending: false }).limit(50);
  notifs = (data || []).map(n => ({
    id: n.id, title: n.title, body: n.body, type: n.type, read: n.read, createdAt: new Date(n.created_at).getTime()
  }));
  
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
  
  updateNotificationBadge();
}

async function markNotifRead(id) {
  await getSupabase().from('notifications').update({ read: true }).eq('id', id);
  
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.ready;
    const notifs = await reg.getNotifications();
    notifs.forEach(n => n.close());
  }

  loadNotifications();
}

async function markAllNotificationsRead() {
  await getSupabase().from('notifications').update({ read: true }).eq('user_id', APP.user.id);
  
  await clearOsNotifications();

  loadNotifications();
  showToast('All read', 'success');
}

// ============================================================
// REFERRAL (WITH ADMIN SIMULATOR)
// ============================================================
function loadReferral() {
  const p = APP.profile;
  if (!p) return;
  const stage = p.stage || getStage();
  const rate = 10 + (stage - 1) * 5;
  const codeEl = document.getElementById('referralCode');
  if (codeEl) codeEl.value = p.referral_code || '...';
  const rateEl = document.getElementById('referralRate');
  if (rateEl) rateEl.textContent = rate + ' PC';
  const rate2El = document.getElementById('referralRate2');
  if (rate2El) rate2El.textContent = rate + ' PC';
  const cntEl = document.getElementById('referralCount');
  if (cntEl) cntEl.textContent = String(p.total_referrals || 0);
  const coinEl = document.getElementById('referralCoinsEarned');
  if (coinEl) coinEl.textContent = '0';

  const isAdmin = p.email === 'solforeyx@gmail.com';
  const container = document.getElementById('section-referral').querySelector('.content-area');
  
  if (isAdmin && container && !document.getElementById('adminSimRefBtn')) {
    const btn = document.createElement('button');
    btn.id = 'adminSimRefBtn';
    btn.className = 'btn-primary';
    btn.style.cssText = 'width:100%; margin-top:20px; background:#9B59B6;';
    btn.innerHTML = '🛠️ Admin: Simulate 10 Referrals';
    btn.onclick = adminSimulateReferral;
    container.appendChild(btn);
  }
}

async function adminSimulateReferral() {
  if (APP.profile?.email !== 'solforeyx@gmail.com') return showToast('Not authorized', 'error');
  
  showLoading('Simulating referrals...');
  try {
    const sb = getSupabase();
    const current = Number(APP.profile.total_referrals || 0);
    const newTotal = current + 10;
    
    const { error } = await sb.from('users').update({ total_referrals: newTotal }).eq('id', APP.user.id);
    if (error) throw error;

    await refreshLiveProfile();
    loadReferral();
    showToast('Added 10 referrals!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
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
  if (navigator.share) navigator.share({ title: 'Panda Card', text: 'Join Panda Card', link }).catch(copyReferral);
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

    const { data, error } = await sb.from('announcements').select('*').order('created_at', { ascending: false });
      
    if (data && data.length > 0) {
      if (hardcoded) hardcoded.style.display = 'none';
      const dynamicHtml = data.map(a => `
        <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);border-left:4px solid #22C55E;">
          <h3 style="margin-bottom:8px;font-size:16px;font-weight:800;">${escapeHtml(a.title)}</h3>
          <p style="font-size:14px;color:#555;line-height:1.6;">${escapeHtml(a.body)}</p>
          <div style="font-size:11px;color:#999;margin-top:12px;">${formatDate(a.created_at)}</div>
        </div>
      `).join('');
      el.innerHTML = dynamicHtml;
    }
  } catch (err) {}
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

    const response = await fetch("https://api.web3forms.com/submit", { method: "POST", body: formData });
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
  updateCoinPricesUI();
  const btn = document.getElementById('claimRewardBtn');
  
  const sb = getSupabase();
  const [profileRes, claimsRes] = await Promise.all([
    sb.from('users').select('last_daily_claim, created_at').eq('id', APP.user.id).single(),
    sb.from('daily_reward_claims')
      .select('claim_date, coins_awarded')
      .eq('user_id', APP.user.id)
      .order('claim_date', { ascending: false })
      .limit(90)
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const profile = profileRes.data;
  const claims = claimsRes.data || [];

  if (profile?.last_daily_claim === today) {
    if (btn) { btn.disabled = true; btn.textContent = 'Claimed Today'; btn.style.background = '#888'; }
  } else {
    if (btn) { btn.disabled = false; btn.textContent = 'Claim (20 PC)'; btn.style.background = '#FFD700'; }
  }
  document.getElementById('rewardTotal').textContent = '20';

  const history = claims.map(c => {
    const [y, m, d] = c.claim_date.split('-').map(Number);
    return { date: new Date(y, m - 1, d).toDateString(), amount: c.coins_awarded };
  });

  const dayCountEl = document.getElementById('rewardDayCount');
  if (dayCountEl) dayCountEl.textContent = String(history.length);
  const daysLeftEl = document.getElementById('rewardDaysRemaining');
  if (daysLeftEl) daysLeftEl.textContent = String(Math.max(0, 90 - history.length));

  const claimedSet = new Set(history.map(h => h.date));
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!claimedSet.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (claimedSet.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const streakEl = document.getElementById('rewardStreak');
  if (streakEl) streakEl.textContent = String(streak);

  const createdAt = new Date(profile?.created_at || Date.now()).getTime();
  renderRewardCalendar(history, createdAt, new Date().toDateString());
}

function renderRewardCalendar(history, createdAt, todayStr) {
  const container = document.getElementById('rewardCalendar');
  if (!container) return;
  const dates = history.map(h => h.date);
  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date(todayStr);
  today.setHours(0, 0, 0, 0);
  let html = '';
  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
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

function updateCoinPricesUI() {
  const section = document.getElementById('coinPurchaseSection');
  if (!section) return;
  const buttons = section.querySelectorAll('button');
  const coins = [10, 50, 100, 500, 1000];
  const ngn = [100, 500, 1000, 5000, 10000];
  buttons.forEach((btn, index) => {
    if (index < coins.length) {
      btn.innerHTML = `${coins[index]} PC<br/><span style="font-size:10px;">${formatPrice(ngn[index])}</span>`;
    }
  });
}

async function claimDailyReward() {
  showLoading('Claiming...');
  try {
    const { data, error } = await getSupabase().functions.invoke('claim-daily-reward');
    if (error || data?.error) throw new Error(data?.error || error.message);
    showToast('+20 PC!', 'success'); playSound('reward');
    await refreshLiveProfile(); loadDailyReward(); updateBalanceUI();
  } catch (err) { showToast(err.message, 'error'); } finally { hideLoading(); }
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

// ============================================================
// WELCOME
// ============================================================
function sendWelcomeNotification() {
  const welcomed = localStorage.getItem('pandacard_live_welcome_sent');
  if (!welcomed) {
    getSupabase().from('notifications').insert({
      user_id: APP.user.id,
      title: 'Welcome to Panda Card!',
      body: 'Your account is ready. Complete your profile and start trading.',
      type: 'info',
      read: false
    }).then(() => {
      localStorage.setItem('pandacard_live_welcome_sent', 'true');
      loadNotifications();
      updateNotificationBadge();
    });
  }
}

// ============================================================
// UI UPDATE
// ============================================================
function updateBalanceUI() {
  const b = getBalances();
  
  let nm = 'User';
  let un = 'user';

  if (APP.profile) {
    nm = APP.profile.full_name || 'User';
    un = APP.profile.username || 'user';
  }

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
  if (!APP.user) return null;
  const sb = getSupabase();
  if (!sb) return null;
  
  const { data, error } = await sb.from('users').select('*, inventory(card_id, quantity, marketplace_quantity, trade_quantity, ceiling_price)').eq('id', APP.user.id).single();
  
  if (data) {
    const formattedInv = {};
    if (data.inventory) {
      data.inventory.forEach(i => {
        if (i.quantity > 0) {
          formattedInv[i.card_id] = {
            quantity: i.quantity,
            marketplace_quantity: i.marketplace_quantity || 0,
            trade_quantity: i.trade_quantity || 0,
            ceiling_price: i.ceiling_price
          };
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
    
    const now = new Date().toISOString();
    
    APP.cards = (data || []).map(c => {
      if (c.status === 'newly' && c.created_at) {
        const hoursSinceCreated = (Date.now() - new Date(c.created_at).getTime()) / 3600000;
        if (hoursSinceCreated > 24) {
          let newStatus = 'neutral';
          if (c.demand_score >= 70) newStatus = 'hot';
          else if (c.demand_score <= 30) newStatus = 'cold';
          return { ...c, status: newStatus };
        }
      }
      return c;
    });

    APP.cards = APP.cards.filter(c => {
      if (c.is_disappearing) {
        return c.disappear_appears_at && 
               c.disappear_appears_at <= now && 
               c.disappear_expires_at > now;
      }
      return true; 
    });

  } catch (e) {
    console.error('loadCards failed', e);
    APP.cards = [];
  }
}

// ============================================================
// MIDNIGHT RESET LOGIC
// ============================================================
function checkMidnightReset() {
  const today = new Date().toISOString().slice(0, 10);
  const lastReset = localStorage.getItem('pandacard_last_reset_day');
  
  if (lastReset !== today) {
    const resetScreen = document.getElementById('midnightResetScreen');
    if (resetScreen) resetScreen.style.display = 'flex';
    
    setTimeout(async () => {
      localStorage.setItem('pandacard_last_reset_day', today);
      await loadCards();
      if (document.getElementById('section-mining').classList.contains('active')) loadMining();
      if (document.getElementById('section-combo').classList.contains('active')) loadDailyCombo();
      if (resetScreen) resetScreen.style.display = 'none';
      showToast('Your new day is ready!', 'success');
    }, 3000); 
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

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (!isPWAInstalled()) {
      const headerBtn = document.getElementById('pwaInstallBtn');
      if (headerBtn) headerBtn.style.display = 'block';
      
      const lastDismissed = localStorage.getItem('pwa_prompt_dismissed');
      const now = Date.now();
      
      if (!lastDismissed || (now - parseInt(lastDismissed)) > INSTALL_COOLDOWN_MS) {
        setTimeout(() => {
          if (!isPWAInstalled()) installPWA();
        }, 2000);
      }
    }
  });

  window.addEventListener('appinstalled', (evt) => {
    hideInstallUI();
    localStorage.removeItem('pwa_prompt_dismissed');
    showToast('App installed successfully!', 'success');
  });

  if (isPWAInstalled()) {
    hideInstallUI();
  }

  try {
    await loadExchangeRates();
    APP.ratesLoaded = true;
  } catch (e) { console.warn('rates failed', e); }

  try { APP.livePublished = await checkLivePublished(); } catch (e) { APP.livePublished = false; }
  applyModeUI();

  const user = await getCurrentUser();
  if (!user) { window.location.href = 'auth.html'; return; }
  APP.user = user;

  const profile = await refreshLiveProfile();
  APP.profile = profile;
  
  if (profile) {
    if (profile.deletion_status === 'pending_deletion') {
      window.location.href = 'deletion-pending.html';
      return;
    }
    window.currentUserProfile = {
      currency: profile.currency || 'NGN',
      name: profile.full_name,
      username: profile.username
    };
  }
  sendWelcomeNotification();

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    subscribeUserToPush(true);
  }

  const isResetting = checkMidnightReset();
  if (!isResetting) {
    await loadCards();
  }

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
window.useDisappearingForStreak = useDisappearingForStreak;
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
window.togglePushNotifications = togglePushNotifications;
window.installPWA = installPWA;
window.closeInstallModal = closeInstallModal;
window.claimBonusCard = claimBonusCard;
