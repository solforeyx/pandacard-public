// ============================================================
// PANDA CARD — UTILITIES (FIXED)
// Dual-source exchange rates + AI translation
// ============================================================

// ---------- TOAST ----------
function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---------- SOUND (AudioContext — no files) ----------
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function isSoundEnabled() {
  const v = localStorage.getItem(STORAGE.SOUND);
  return v === null ? true : v === 'true';
}
function playSound(name) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  switch (name) {
    case 'click':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now); osc.stop(now + 0.08);
      break;
    case 'success':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
      break;
    case 'error':
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.setValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now); osc.stop(now + 0.3);
      break;
    case 'reward':
      [523, 659, 784, 1047].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.12);
        g.gain.setValueAtTime(0.15, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.2);
        o.start(now + i * 0.12); o.stop(now + i * 0.12 + 0.2);
      });
      break;
    case 'notification':
      [600, 800].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.1);
        o.frequency.setValueAtTime(freq * 1.1, now + i * 0.1 + 0.05);
        g.gain.setValueAtTime(0.2, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.2);
        o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.2);
      });
      break;
    default:
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now); osc.stop(now + 0.05);
  }
}
function playNotificationSound() { playSound('notification'); }

// ============================================================
// CURRENCY — DUAL-SOURCE EXCHANGE RATES
// ============================================================
const CURRENCY_SYMBOLS = {
  NGN: '₦', USD: '$', EUR: '€', GBP: '£',
  GHS: '₵', KES: 'KSh', ZAR: 'R', EGP: 'E£',
  CAD: 'CA$', AUD: 'A$', INR: '₹', CNY: '¥',
  JPY: '¥', KRW: '₩', BRL: 'R$', MXN: 'MX$',
  AED: 'د.إ', SAR: '﷼', TRY: '₺', RUB: '₽',
  XAF: 'FCFA', XOF: 'CFA', MAD: 'DH', TND: 'DT', DZD: 'DA',
  UGX: 'USh', TZS: 'TSh', RWF: 'FRw', ZMW: 'ZK', BWP: 'P',
  MZN: 'MT', AOA: 'Kz', ETB: 'Br', SOS: 'Sh', SDG: 'ج.س.',
  CDF: 'FC', XCD: '$', TTD: 'TT$', JMD: 'J$', BSD: '$',
  BBD: '$', BZD: 'BZ$', GTQ: 'Q', HNL: 'L', NIO: 'C$',
  CRC: '₡', PAB: 'B/.', DOP: 'RD$', HTG: 'G', ARS: '$',
  CLP: '$', COP: '$', PEN: 'S/', UYU: '$U', PYG: '₲',
  BOB: 'Bs.', VES: 'Bs.'
};

let _exchangeRates = null;
const RATES_CACHE_KEY = 'pandacard_rates_v2';
const RATES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedRates() {
  if (_exchangeRates) return _exchangeRates;
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.ts && Date.now() - parsed.ts < RATES_CACHE_TTL) {
        _exchangeRates = parsed.rates || null;
        return _exchangeRates;
      }
    }
  } catch (e) {}
  return null;
}

function setCachedRates(rates) {
  _exchangeRates = rates;
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates, ts: Date.now() }));
  } catch (e) {}
}

async function loadExchangeRates() {
  const cached = getCachedRates();
  if (cached && cached.USD) return cached;

  const sources = [
    { name: 'er-api', url: 'https://open.er-api.com/v6/latest/NGN' },
    { name: 'exchangerate-host', url: 'https://api.exchangerate.host/latest?base=NGN' }
  ];

  const results = await Promise.allSettled(
    sources.map(s =>
      fetch(s.url, { signal: AbortSignal.timeout(10000) })
        .then(r => r.json())
        .then(d => ({ name: s.name, rates: d?.rates || d?.data?.rates || null }))
    )
  );

  const valid = results
    .filter(r => r.status === 'fulfilled' && r.value?.rates && Object.keys(r.value.rates).length > 0)
    .map(r => r.value.rates);

  if (valid.length === 0) {
    console.warn('All rate sources failed. Using cache fallback.');
    const old = getCachedRates();
    return old || { NGN: 1 };
  }

  if (valid.length === 1) {
    valid[0].NGN = 1;
    setCachedRates(valid[0]);
    return valid[0];
  }

  const merged = { NGN: 1 };
  const keys = new Set();
  valid.forEach(v => Object.keys(v).forEach(k => keys.add(k)));
  keys.forEach(k => {
    const vals = valid.map(v => v[k]).filter(x => typeof x === 'number' && x > 0);
    if (vals.length > 0) {
      merged[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  });

  setCachedRates(merged);
  return merged;
}

function getCurrencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] || currency || '₦';
}

function convertPrice(ngnPrice, targetCurrency, rates) {
  const r = rates || getCachedRates() || { NGN: 1 };
  if (!targetCurrency || targetCurrency === 'NGN') return ngnPrice;
  const rate = r[targetCurrency];
  if (!rate) return ngnPrice;
  const converted = ngnPrice * rate;
  if (converted < 0.01) return parseFloat(converted.toFixed(8));
  if (converted < 1) return parseFloat(converted.toFixed(6));
  if (converted < 100) return parseFloat(converted.toFixed(2));
  return Math.round(converted);
}

function convertToNGN(userPrice, userCurrency, rates) {
  const r = rates || getCachedRates() || { NGN: 1 };
  if (!userCurrency || userCurrency === 'NGN') return userPrice;
  const rate = r[userCurrency];
  if (!rate || rate <= 0) return userPrice;
  return Math.round(userPrice / rate);
}

function getUserCurrency() {
  if (window.currentUserProfile && window.currentUserProfile.currency) {
    return window.currentUserProfile.currency;
  }
  if (typeof isDemo === 'function' && isDemo() && typeof demoGetSession === 'function') {
    const acct = demoGetSession();
    if (acct && acct.currency) return acct.currency;
  }
  return 'NGN';
}

// Cleanly handles 0, null, and undefined values
function formatPrice(ngnAmount, currency) {
  const c = currency || getUserCurrency();
  const symbol = getCurrencySymbol(c);
  
  // Force any null, undefined, or invalid numbers to 0
  let amount = Number(ngnAmount);
  if (isNaN(amount) || amount === null || amount === undefined) amount = 0;
  
  // If the balance is exactly 0, return just "₦0" instead of "₦0.00000000"
  if (amount === 0) return symbol + '0';

  const converted = convertPrice(amount, c);
  
  if (typeof converted !== 'number' || isNaN(converted)) return symbol + '0';
  const abs = Math.abs(converted);
  if (abs < 0.01) return symbol + converted.toFixed(8);
  if (abs < 1) return symbol + converted.toFixed(6);
  if (abs < 100) return symbol + converted.toFixed(2);
  return symbol + Math.round(converted).toLocaleString();
}

function formatNaira(amount) {
  return '₦' + Math.round(amount || 0).toLocaleString();
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

// ============================================================
// AI TRANSLATION (Free — MyMemory + Chrome native fallback)
// ============================================================
const TRANSLATION_CACHE_PREFIX = 'trans_';

async function translateText(text, targetLang) {
  if (!text || !targetLang || targetLang === 'en') return text;
  if (text.trim().length === 0) return text;

  const cacheKey = TRANSLATION_CACHE_PREFIX + targetLang + '_' + btoa(unescape(encodeURIComponent(text))).slice(0, 40);
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch (e) {}

  try {
    const url = 'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(text) +
      '&langpair=en|' + encodeURIComponent(targetLang);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated && !translated.includes('MYMEMORY WARNING')) {
      try { localStorage.setItem(cacheKey, translated); } catch (e) {}
      return translated;
    }
  } catch (e) {
    console.warn('translation failed for:', text.slice(0, 30));
  }
  return text;
}

async function translatePageContent(targetLang) {
  if (!targetLang || targetLang === 'en') return;
  document.documentElement.setAttribute('lang', targetLang);

  const selectors = [
    '.section-header h2',
    '.menu-item',
    '.btn-action',
    '.btn-primary',
    '.balance-card .label',
    '.stat-item .stat-label',
    '.card-name',
    '.settings-item .label',
    '.faq-item .q',
    '.faq-item .a'
  ];

  const elements = document.querySelectorAll(selectors.join(','));
  for (const el of elements) {
    const original = el.getAttribute('data-original-text') || el.textContent.trim();
    if (!original || original.length < 2) continue;
    if (!el.getAttribute('data-original-text')) {
      el.setAttribute('data-original-text', original);
    }
    const translated = await translateText(original, targetLang);
    if (translated && translated !== original) {
      el.textContent = translated;
    }
  }
}

// ============================================================
// DATES / COUNTDOWN
// ============================================================
function formatDate(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function timeAgo(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return formatDate(d);
}
function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
    String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' +
    String(s % 60).padStart(2, '0');
}

// ============================================================
// STAGE SYSTEM
// ============================================================
const STAGE_CONFIG = {
  1: { name: 'Egg', minWithdrawal: 20000, minCardPrice: 500, maxCardPrice: 6500, unlockAt: 0, dpPerCombo: 12 },
  2: { name: 'Sprout', minWithdrawal: 20000, minCardPrice: 500, maxCardPrice: 16500, unlockAt: 50000, dpPerCombo: 14 },
  3: { name: 'Growing', minWithdrawal: 20000, minCardPrice: 1000, maxCardPrice: 33000, unlockAt: 100000, dpPerCombo: 17 },
  4: { name: 'Rising', minWithdrawal: 20000, minCardPrice: 2000, maxCardPrice: 66000, unlockAt: 200000, dpPerCombo: 20 },
  5: { name: 'Strong', minWithdrawal: 20000, minCardPrice: 5000, maxCardPrice: 166000, unlockAt: 500000, dpPerCombo: 24 },
  6: { name: 'Mature', minWithdrawal: 20000, minCardPrice: 10000, maxCardPrice: 333000, unlockAt: 1000000, dpPerCombo: 28 },
  7: { name: 'Elite', minWithdrawal: 20000, minCardPrice: 20000, maxCardPrice: 666000, unlockAt: 2000000, dpPerCombo: 35 },
  8: { name: 'Master Panda', minWithdrawal: 20000, minCardPrice: 50000, maxCardPrice: 1666000, unlockAt: 5000000, dpPerCombo: 52 }
};
function getStageConfig(stage) { return STAGE_CONFIG[stage] || STAGE_CONFIG[1]; }
function getStageName(stage) { return getStageConfig(stage).name; }
function getStageByEarnings(lifetimeEarned) {
  for (let s = 8; s >= 1; s--) if (lifetimeEarned >= STAGE_CONFIG[s].unlockAt) return s;
  return 1;
}
function getNextStageThreshold(stage) {
  const next = STAGE_CONFIG[stage + 1];
  return next ? next.unlockAt : null;
}
function getProgressToNextStage(lifetimeEarned) {
  const stage = getStageByEarnings(lifetimeEarned);
  if (stage >= 8) return { stage: 8, progress: 100, next: null, remaining: 0, label: 'Max Stage' };
  const cur = STAGE_CONFIG[stage].unlockAt;
  const next = STAGE_CONFIG[stage + 1].unlockAt;
  const progress = Math.min(100, ((lifetimeEarned - cur) / (next - cur)) * 100);
  return {
    stage,
    progress: Math.max(0, progress),
    next,
    remaining: Math.max(0, next - lifetimeEarned),
    label: 'To ' + STAGE_CONFIG[stage + 1].name
  };
}

// ============================================================
// DIAMOND POINTS
// ============================================================
function dpRequiredForWithdrawal(amountNgn) {
  return Math.round((amountNgn / 20000) * 600);
}

// ============================================================
// COIN FEES
// ============================================================
function coinFeeForBuy(status, isVip) {
  const s = (status || '').toLowerCase();
  if (isVip) {
    if (s === 'newly') return 20;
    if (s === 'cold') return 30;
    if (s === 'neutral') return 50;
    if (s === 'hot') return 100;
    return 50;
  }
  if (s === 'newly') return 20;
  if (s === 'cold') return 20;
  if (s === 'neutral') return 30;
  if (s === 'hot') return 40;
  return 20;
}

// ============================================================
// PRICE HELPERS
// ============================================================
function getFloorPrice(card) {
  return card.original_price || card.originalPrice || card.start_price || card.price || 0;
}
function getCeilingPrice(card) {
  return getFloorPrice(card) * CONFIG.MAX_PRICE_MULTIPLIER;
}
function getListingMax(card, currentMarketPrice) {
  const floor = getFloorPrice(card);
  const ceiling = getCeilingPrice(card);
  if (!currentMarketPrice || !floor) return ceiling;
  const ratio = currentMarketPrice / floor;
  return Math.min(ceiling, Math.round(ceiling * ratio));
}

// ============================================================
// HTML / STORAGE / UTILS
// ============================================================
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch (e) { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { showToast('Storage full or unavailable', 'error'); return false; }
}
function storageRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }
function generateId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
}
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PANDA';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// ============================================================
// VALIDATION
// ============================================================
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidPassword(pwd) {
  return pwd && pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd);
}
function passwordError(pwd) {
  if (!pwd || pwd.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(pwd)) return 'Password must contain a digit';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Password must contain a symbol (!@#$%^&*)';
  return null;
}
function isValidUsername(name) {
  if (!name || name.length < 3 || name.length > 30) return false;
  if (/\s/.test(name)) return false;
  if (!/^[A-Za-z0-9_]+$/.test(name)) return false;
  const reserved = ['admin', 'support', 'panda', 'pandacard', 'solforeyx', 'root', 'system', 'moderator', 'help', 'official'];
  return !reserved.includes(name.toLowerCase());
}
function isValidPin(pin) { return /^\d{4}$/.test(pin || ''); }

// ============================================================
// DEBOUNCE / THROTTLE
// ============================================================
function debounce(fn, delay) {
  let t;
  return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), delay); };
}
function throttle(fn, limit) {
  let active;
  return function (...a) {
    if (!active) { fn.apply(this, a); active = true; setTimeout(() => active = false, limit); }
  };
}

// ============================================================
// LOADING
// ============================================================
function showLoading(text) {
  let el = document.getElementById('loadingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.className = 'loading-overlay';
    el.innerHTML = '<div class="spinner"></div><div class="loading-text"></div>';
    document.body.appendChild(el);
  }
  const txt = el.querySelector('.loading-text');
  if (txt) txt.textContent = text || 'Loading...';
  el.classList.remove('hide');
}
function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.add('hide');
}

// ============================================================
// MODE / DARK MODE
// ============================================================
function applyModeUI() {
  if (isDemo()) {
    document.body.classList.add('demo-mode');
    let banner = document.getElementById('demoBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'demoBanner';
      banner.className = 'demo-banner';
      banner.textContent = 'DEMO MODE';
      document.body.prepend(banner);
    }
  } else {
    document.body.classList.remove('demo-mode');
    const banner = document.getElementById('demoBanner');
    if (banner) banner.remove();
  }
}
async function checkLivePublished() {
  try {
    const cached = localStorage.getItem('pandacard_live_published');
    const cachedTs = localStorage.getItem('pandacard_live_published_ts');
    if (cached !== null && cachedTs && Date.now() - Number(cachedTs) < 300000) {
      return cached === 'true';
    }
    const sb = getSupabase();
    if (!sb) return false;
    const { data, error } = await sb.from('app_config').select('value').eq('key', 'live_published').single();
    if (error) return false;
    const published = data && data.value === 'true';
    localStorage.setItem('pandacard_live_published', String(published));
    localStorage.setItem('pandacard_live_published_ts', String(Date.now()));
    return published;
  } catch (e) { return false; }
}
function applyDarkMode() {
  const saved = localStorage.getItem(STORAGE.DARK_MODE);
  if (saved === 'true') document.body.classList.add('dark-mode');
  else document.body.classList.remove('dark-mode');
}
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem(STORAGE.DARK_MODE, String(isDark));
  const toggle = document.getElementById('settingsDarkToggle');
  if (toggle) toggle.classList.toggle('active', isDark);
  showToast(isDark ? 'Dark mode on' : 'Light mode on', 'success');
}

// ============================================================
// INIT + EXPORTS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  applyDarkMode();
  applyModeUI();
});

window.showToast = showToast;
window.playSound = playSound;
window.playNotificationSound = playNotificationSound;
window.getAudioContext = getAudioContext;
window.isSoundEnabled = isSoundEnabled;
window.formatPrice = formatPrice;
window.formatNaira = formatNaira;
window.formatNumber = formatNumber;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.timeAgo = timeAgo;
window.formatCountdown = formatCountdown;
window.convertPrice = convertPrice;
window.convertToNGN = convertToNGN;
window.getCurrencySymbol = getCurrencySymbol;
window.getUserCurrency = getUserCurrency;
window.loadExchangeRates = loadExchangeRates;
window.getCachedRates = getCachedRates;
window.setCachedRates = setCachedRates;
window.translateText = translateText;
window.translatePageContent = translatePageContent;
window.getStageConfig = getStageConfig;
window.getStageName = getStageName;
window.getStageByEarnings = getStageByEarnings;
window.getNextStageThreshold = getNextStageThreshold;
window.getProgressToNextStage = getProgressToNextStage;
window.dpRequiredForWithdrawal = dpRequiredForWithdrawal;
window.coinFeeForBuy = coinFeeForBuy;
window.getFloorPrice = getFloorPrice;
window.getCeilingPrice = getCeilingPrice;
window.getListingMax = getListingMax;
window.escapeHtml = escapeHtml;
window.storageGet = storageGet;
window.storageSet = storageSet;
window.storageRemove = storageRemove;
window.generateId = generateId;
window.generateReferralCode = generateReferralCode;
window.isValidEmail = isValidEmail;
window.isValidPassword = isValidPassword;
window.passwordError = passwordError;
window.isValidUsername = isValidUsername;
window.isValidPin = isValidPin;
window.debounce = debounce;
window.throttle = throttle;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.applyModeUI = applyModeUI;
window.applyDarkMode = applyDarkMode;
window.toggleDarkMode = toggleDarkMode;
window.checkLivePublished = checkLivePublished;
window.STAGE_CONFIG = STAGE_CONFIG;
