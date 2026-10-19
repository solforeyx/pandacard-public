// ============================================
// PANDA CARD — CONFIG (PUBLIC / SAFE TO COMMIT)
// ============================================
// This file contains only keys designed for browser use.
// Secret keys (service_role, webhook hashes) live ONLY in Supabase Edge Functions.

const CONFIG = {
  APP_NAME: 'Panda Card',
  APP_OWNER: 'Solforeyx',
  APP_TAGLINE: 'Trade Smart. Stay Cute.',
  DOMAIN: 'pandacard.solforeyx.com',

  SUPABASE_URL: 'https://dxxhlaxdudtiktplwvbq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4eGhsYXhkdWR0aWt0cGx3dmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDUzNzIsImV4cCI6MjEwNzkyMTM3Mn0.tSFal0bYl1jO-EMjwq_9A0KLfD0YLLqO0F7kgXeZ2aI',

  PAYSTACK_PUBLIC_KEY: 'pk_live_907d880d385cdfad3442ca9fd3686a8fea0bf38e',
  FLUTTERWAVE_PUBLIC_KEY: 'FLWPUBK-8ec47505341e1bbaff2a67cf31c7a304-X',

  LOGO_URL: 'https://i.imgur.com/9aLmHyS.png',
  MINING_ICON_URL: 'https://i.imgur.com/xMhvhIA.png',

  EXCHANGE_RATE_API: 'https://open.er-api.com/v6/latest/NGN',
  EXCHANGE_REFRESH_HOURS: 24,

  MIN_DEPOSIT_NGN: 20000,
  MIN_WITHDRAWAL_NGN: 20000,
  WITHDRAWAL_FEE_PCT: 15,
  LISTING_COIN_FEE: 20,
  MAX_PRICE_MULTIPLIER: 10,
};

// ============================================
// LOCAL STORAGE KEYS
// ============================================
const STORAGE = {
  MODE: 'pandacard_mode',                 // 'demo' | 'live'
  DEMO_ACCOUNTS: 'pandacard_demo_accounts',   // { [email]: { account, password_hash, state } }
  DEMO_SESSION: 'pandacard_demo_session',     // currently logged-in demo email
  LANGUAGE: 'pandacard_language',
  DARK_MODE: 'pandacard_darkmode',
  SOUND: 'pandacard_sound',
  DEMO_SEED: 'pandacard_demo_seed',       // for deterministic demo random
};

// ============================================
// CURRENT MODE HELPERS
// ============================================
function getMode() {
  return localStorage.getItem(STORAGE.MODE) || 'demo';
}
function setMode(mode) {
  if (mode !== 'demo' && mode !== 'live') return;
  localStorage.setItem(STORAGE.MODE, mode);
}
function isDemo() { return getMode() === 'demo'; }
function isLive() { return getMode() === 'live'; }

// ============================================
// SUPABASE CLIENT (used only in LIVE mode)
// ============================================
let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ============================================
// FEATURE FLAGS
// ============================================
const FEATURES = {
  DEMO_ENABLED: true,
  LIVE_ENABLED: true,
  PUSH_NOTIFICATIONS: false,
  EMAIL_NOTIFICATIONS: false,
  ACHIEVEMENTS: false,
  LEADERBOARD: false,
};

// ============================================
// VERSION
// ============================================
const APP_VERSION = '1.0.0';

window.CONFIG = CONFIG;
window.STORAGE = STORAGE;
window.FEATURES = FEATURES;
window.APP_VERSION = APP_VERSION;
window.getMode = getMode;
window.setMode = setMode;
window.isDemo = isDemo;
window.isLive = isLive;
window.getSupabase = getSupabase;