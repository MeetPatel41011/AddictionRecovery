// No more demo data — real patients are fetched from the API
export let FAC_PTS = [];

export let S = {
  // patient
  profile: null,
  user_id: null,
  checkins: [],
  journal: [],
  badges: [],
  xp: 0,
  chatHistory: [],
  chatSessions: [],
  lastChatDate: '',
  copingCount: 0,
  // onboarding temp
  ob: { step: 1, addictions: [], gender: '', reason: '', goal: '' },
  // facility
  facName: '',
  facCode: '',
  // ui
  moodCI: '', moodJ: '', period: 'week',
  currentPt: null,
  tplans: {},
  moodChart: null, urgeChart: null, copingChartInst: null,
  // OTP
  otpCode: '',
  otpCallback: null,
  pendingPollTimer: null,
};

export async function load() {
  try {
    const r = window.localStorage.getItem('rc_v2');
    if (r) {
      const d = JSON.parse(r);
      S = { ...S, ...d, ob: S.ob };
    }
  } catch (e) { }
  try {
    const t = window.localStorage.getItem('rc_tplans');
    if (t) S.tplans = JSON.parse(t);
  } catch (e) { }
}

export async function save() {
  const persist = {
    profile: S.profile, user_id: S.user_id, checkins: S.checkins, journal: S.journal,
    badges: S.badges, xp: S.xp, chatHistory: S.chatHistory,
    chatSessions: S.chatSessions, lastChatDate: S.lastChatDate, copingCount: S.copingCount
  };
  try { window.localStorage.setItem('rc_v2', JSON.stringify(persist)); } catch (e) { }
  // Also sync to server so facility can see patient data
  syncToServer();
}

/**
 * Pushes patient data to the backend so the facility portal can read it.
 * Fires asynchronously — does not block the UI.
 */
export function syncToServer() {
  if (!S.user_id || !S.profile) return;
  fetch('/patient/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: S.user_id,
      checkins: S.checkins || [],
      journal: S.journal || [],
      profile: S.profile || {},
      xp: S.xp || 0,
      badges: S.badges || []
    })
  }).catch(e => console.warn('Sync failed (offline):', e));
}

export async function persist_tp() {
  try { window.localStorage.setItem('rc_tplans', JSON.stringify(S.tplans)); } catch (e) { }
}
