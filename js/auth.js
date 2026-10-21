// ============================================================
// PANDA CARD — AUTH (Demo + Live in one file)
// ============================================================

let currentUser = null;
let currentUserProfile = null;

// ============================================================
// DEMO AUTH — localStorage only
// ============================================================
function demoGetAccounts() {
  return storageGet(STORAGE.DEMO_ACCOUNTS, {});
}

function demoSetAccounts(accounts) {
  storageSet(STORAGE.DEMO_ACCOUNTS, accounts);
}

function demoHashPassword(password) {
  // Simple hash — not for production, just to avoid plaintext storage
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash) + password.charCodeAt(i);
    hash = hash & hash;
  }
  return String(hash);
}

async function demoCreateAccount(data) {
  const accounts = demoGetAccounts();
  if (accounts[data.email.toLowerCase()]) {
    return { error: 'An account with this email already exists' };
  }

  // Add fallbacks for missing form data
  const email = data.email.toLowerCase();
  const fullName = data.fullName || email.split('@')[0];
  const username = data.username || email.split('@')[0] + '_' + Math.floor(1000 + Math.random() * 9000);

  const now = Date.now();
  const account = {
    id: generateId('demo'),
    email: email,
    passwordHash: demoHashPassword(data.password),
    fullName: fullName,
    username: username,
    country: data.country || 'Nigeria',
    countryCode: data.countryCode || 'NG',
    currency: data.currency || 'NGN',
    currencySymbol: getCurrencySymbol(data.currency || 'NGN'),
    dob: data.dob || '',
    phone: data.phone || '',
    address: data.address || '',
    referralCode: generateReferralCode(),
    referredBy: data.referredBy || null,
    createdAt: now,
    isDemo: true,
    pin: '',
    bankDetails: null,
    state: {
      depositBalance: 0,
      earningsBalance: 0,
      coins: data.referredBy ? 10 : 0,
      diamondPoints: 0,
      stage: 1,
      lifetimeEarned: 0,
      lifetimeWithdrawn: 0,
      winRate: 0,
      totalTrades: 0,
      cardsOwned: {},
      inventory: {},
      transactions: [],
      listings: [],
      notifications: [],
      miningSessions: [],
      dailyCombo: null,
      comboStreak: 0,
      lastComboDate: '',
      dailyReward: { lastClaim: '', streak: 0, claimHistory: [] },
      checklist: { reward: false, deposit: false, learn: false, announcement: false, buy: false },
      bankDetails: null,
      createdAt: now
    }
  };

  accounts[account.email] = account;
  demoSetAccounts(accounts);
  localStorage.setItem(STORAGE.DEMO_SESSION, account.email);

  // 🚨 FIXED: Added 'await' so the app waits for Brevo to finish before redirecting
  try {
    const sb = getSupabase();
    if (sb) {
      await sb.functions.invoke('add-demo-lead', { 
        body: { email: account.email, name: account.fullName } 
      });
    }
  } catch (e) {
    console.error('Failed to invoke Brevo function', e);
  }

  return { account };
}

function demoLogin(email, password) {
  const accounts = demoGetAccounts();
  const account = accounts[email.toLowerCase()];
  if (!account) {
    return { error: 'No account with that email' };
  }
  if (account.passwordHash !== demoHashPassword(password)) {
    return { error: 'Incorrect password' };
  }
  localStorage.setItem(STORAGE.DEMO_SESSION, account.email);
  return { account };
}

function demoGetSession() {
  const email = localStorage.getItem(STORAGE.DEMO_SESSION);
  if (!email) return null;
  const accounts = demoGetAccounts();
  return accounts[email] || null;
}

function demoLogout() {
  localStorage.removeItem(STORAGE.DEMO_SESSION);
}

function demoUpdateAccount(email, updates) {
  const accounts = demoGetAccounts();
  const account = accounts[email];
  if (!account) return null;
  Object.assign(account, updates);
  accounts[email] = account;
  demoSetAccounts(accounts);
  return account;
}

function demoUpdateState(email, stateUpdates) {
  const accounts = demoGetAccounts();
  const account = accounts[email];
  if (!account) return null;
  Object.assign(account.state, stateUpdates);
  accounts[email] = account;
  demoSetAccounts(accounts);
  return account;
}

// ============================================================
// LIVE AUTH — Supabase
// ============================================================
async function liveSignup(data) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not available' };

  // 🚨 FALLBACKS: Prevent blank profiles if auth.html form is missing data
  const email = data.email.toLowerCase();
  const fullName = data.fullName || email.split('@')[0];
  const username = data.username || email.split('@')[0] + '_' + Math.floor(1000 + Math.random() * 9000);

  const { data: authData, error: authError } = await sb.auth.signUp({
    email: email,
    password: data.password
  });

  if (authError) return { error: authError.message };
  if (!authData.user) return { error: 'Signup failed' };

  // 🚨 FIXED: Prevent duplicate Brevo emails by checking if user already existed
  // If identities array is empty, it means the user already had an account
  const isNewUser = authData.user.identities && authData.user.identities.length > 0;
  if (!isNewUser) {
    return { error: 'This email is already registered. Please log in instead.' };
  }

  // 🚨 UPSERT: Prevents duplicate key errors if a trigger exists
  const { error: profileError } = await sb.from('users').upsert({
    id: authData.user.id,
    email: email,
    full_name: fullName,
    username: username,
    country: data.country || 'Nigeria',
    country_code: data.countryCode || 'NG',
    currency: data.currency || 'NGN',
    dob: data.dob || null,
    phone: data.phone || null,
    address: data.address || null,
    referral_code: generateReferralCode(),
    referred_by: data.referredBy || null,
    deposit_balance: 0,
    earnings_balance: 0,
    coins: data.referredBy ? 10 : 0,
    diamond_points: 0,
    stage: 1,
    lifetime_earned: 0,
    lifetime_withdrawn: 0
  });

  if (profileError) {
    console.error("Profile creation failed in Supabase:", profileError);
    return { error: profileError.message };
  }

  // 🚨 FIXED: Added 'await' so the app waits for Brevo to finish
  try {
    await sb.functions.invoke('welcome-email', { 
      body: { email: email, name: fullName } 
    });
  } catch (e) {
    console.error('Failed to invoke Brevo function', e);
    // We don't return an error here. If Brevo fails, the user is still signed up.
  }

  return { user: authData.user };
}

async function liveLogin(email, password) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not available' };

  const { data, error } = await sb.auth.signInWithPassword({
    email: email.toLowerCase(),
    password: password
  });

  if (error) return { error: error.message };
  return { user: data.user, session: data.session };
}

async function liveLogout() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

async function liveGetUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

async function liveGetProfile(userId) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('users').select('*').eq('id', userId).single();
  if (error) {
    console.warn("Could not fetch profile:", error.message);
    return null;
  }
  return data;
}

// ============================================================
// UNIFIED AUTH INTERFACE
// ============================================================
async function signup(data) {
  if (isDemo()) {
    return demoCreateAccount(data);
  }
  return liveSignup(data);
}

async function login(email, password) {
  if (isDemo()) {
    return demoLogin(email, password);
  }
  return liveLogin(email, password);
}

async function logout() {
  if (isDemo()) {
    demoLogout();
    window.location.href = 'auth.html'; 
    return { success: true };
  }
  await liveLogout();
  window.location.href = 'auth.html'; 
  return { success: true };
}

async function getCurrentUser() {
  if (isDemo()) {
    const account = demoGetSession();
    if (!account) return null;
    return {
      uid: account.id,
      email: account.email,
      displayName: account.fullName,
      demo: true
    };
  }
  return liveGetUser();
}

async function getCurrentProfile() {
  if (isDemo()) {
    const account = demoGetSession();
    if (!account) return null;
    return account;
  }
  const user = await liveGetUser();
  if (!user) return null;
  return liveGetProfile(user.id);
}

// ============================================================
// AUTH GUARD
// ============================================================
async function requireAuth(redirectTo) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo || 'auth.html';
    return null;
  }
  return user;
}

async function redirectIfAuthed(target) {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = target || 'app.html';
  }
}

// ============================================================
// PASSWORD RESET (mode-aware)
// ============================================================
async function requestPasswordReset(email) {
  if (isDemo()) {
    const accounts = demoGetAccounts();
    if (!accounts[email.toLowerCase()]) {
      return { error: 'No account with that email' };
    }
    return { success: true, demo: true };
  }
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not available' };
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/auth.html?reset=true'
  });
  if (error) return { error: error.message };
  return { success: true };
}

// ============================================================
// PIN MANAGEMENT
// ============================================================
async function setPin(pin) {
  if (!isValidPin(pin)) return { error: 'PIN must be 4 digits' };

  if (isDemo()) {
    const account = demoGetSession();
    if (!account) return { error: 'Not logged in' };
    demoUpdateAccount(account.email, { pin });
    return { success: true };
  }

  const sb = getSupabase();
  const user = await liveGetUser();
  if (!user) return { error: 'Not logged in' };

  const { error } = await sb.from('users').update({ pin_hash: demoHashPassword(pin) }).eq('id', user.id);
  if (error) return { error: error.message };
  return { success: true };
}

async function verifyPin(pin) {
  if (isDemo()) {
    const account = demoGetSession();
    if (!account) return false;
    return account.pin === pin;
  }

  const sb = getSupabase();
  const user = await liveGetUser();
  if (!user) return false;

  const { data } = await sb.from('users').select('pin_hash').eq('id', user.id).single();
  if (!data || !data.pin_hash) return false;
  return data.pin_hash === demoHashPassword(pin);
}

// ============================================================
// EXPORTS
// ============================================================
window.signup = signup;
window.login = login;
window.logout = logout;
window.getCurrentUser = getCurrentUser;
window.getCurrentProfile = getCurrentProfile;
window.requireAuth = requireAuth;
window.redirectIfAuthed = redirectIfAuthed;
window.requestPasswordReset = requestPasswordReset;
window.setPin = setPin;
window.verifyPin = verifyPin;
window.demoGetAccounts = demoGetAccounts;
window.demoCreateAccount = demoCreateAccount;
window.demoLogin = demoLogin;
window.demoGetSession = demoGetSession;
window.demoLogout = demoLogout;
window.demoUpdateAccount = demoUpdateAccount;
window.demoUpdateState = demoUpdateState;
window.demoHashPassword = demoHashPassword;
