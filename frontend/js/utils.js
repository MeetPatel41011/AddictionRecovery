import { S } from './state.js';
import { MOOD_VALS, AV_COLORS, LEVELS } from './constants.js';

export function $(id) { return document.getElementById(id); }
export function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

export function getLevel(xp) {
  return LEVELS.find(l => xp >= l.min && xp < l.max) || LEVELS[LEVELS.length - 1];
}

export function daysSince(d) {
  const s = new Date(d), n = new Date();
  s.setHours(0, 0, 0, 0); n.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((n - s) / 86400000));
}

export function todayStr() { return new Date().toISOString().slice(0, 10); }

export function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateShort(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function streak() {
  const cis = S.checkins;
  if (!cis.length) return 0;
  const sorted = [...cis].sort((a, b) => new Date(b.date) - new Date(a.date));
  let k = 0;
  let d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i++) {
    const ds = d.toISOString().slice(0, 10);
    if (sorted.find(c => c.date === ds)) { k++; }
    else if (i === 0) { } // today not yet checked — skip
    else break;
    d.setDate(d.getDate() - 1);
  }
  return k;
}

export function avgMood(cis) {
  if (!cis || !cis.length) return 0;
  return (cis.reduce((s, c) => s + (MOOD_VALS[c.mood] || 3), 0) / cis.length).toFixed(1);
}

export function avgUrge(cis) {
  if (!cis || !cis.length) return 0;
  const total = cis.reduce((s, c) => s + (parseInt(c.urge) || 0), 0);
  return (total / cis.length).toFixed(1);
}

export function calculateRiskLevel(patient) {
  const checkins = patient.checkins || [];
  if (!checkins.length) return 'mid'; // Default if no data
  
  // Calculate recent urge (last 3 checkins)
  const recent = checkins.slice(-3);
  const recentUrge = recent.reduce((s, c) => s + (parseInt(c.urge) || 0), 0) / recent.length;
  
  // Check for recent crisis
  const hasCrisis = recent.some(c => c.mood === 'crisis' || c.mood === 'hard');
  
  // Check for missed checkins > 3 days
  const lastCheckin = checkins[checkins.length - 1];
  const daysSinceCI = Math.floor((new Date() - new Date(lastCheckin.date)) / 86400000);
  const isMissed = daysSinceCI > 3;

  if (recentUrge >= 7 || hasCrisis || isMissed) return 'high';
  if (recentUrge >= 4 || daysSinceCI > 1) return 'mid';
  return 'low';
}

export function calculateLiveAssessment(patient) {
  const checkins = patient.checkins || [];
  const assess = patient.assessment || {};
  
  // Withdrawal severity based on last 5 checkins
  let wd = parseInt(assess.wd || '5');
  if (checkins.length > 0) {
    const recent = checkins.slice(-5);
    const avgRecentUrge = recent.reduce((s, c) => s + (parseInt(c.urge) || 0), 0) / recent.length;
    wd = Math.round(avgRecentUrge);
  }

  // Motivation based on XP
  let mot = parseInt(assess.mot || '5');
  const userXP = patient.xp || 0;
  if (userXP > 500) mot = Math.min(10, mot + 3);
  else if (userXP > 100) mot = Math.min(10, mot + 1);

  return { ...assess, wd, mot };
}

export function avatarColors(name) {
  return AV_COLORS[name.charCodeAt(0) % AV_COLORS.length];
}

export function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2);
}

export function riskBadge(r) {
  const m = { low: ['risk-low', 'Low Risk'], mid: ['risk-mid', 'Moderate Risk'], high: ['risk-high', 'High Risk'] };
  const [cls, txt] = m[r] || m.mid;
  return `<span class="badge-tag ${cls}">${txt}</span>`;
}

export function toast(msg, type = '', dur = 3000) {
  const tc = $('toast-container');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 400);
  }, dur);
}

export function notifBanner(title, text, type = 'nb-green', dur = 5000) {
  let nb = document.getElementById('notif-banner');
  if (nb) nb.remove();
  nb = document.createElement('div');
  nb.id = 'notif-banner';
  nb.className = `notif-banner ${type}`;
  nb.innerHTML = `<span class="nb-icon">🔔</span><div class="nb-body"><div class="nb-title">${title}</div><div class="nb-text">${text}</div></div><button class="nb-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(nb);
  setTimeout(() => nb && nb.remove(), dur);
}

export function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

export function showModal(title, body) {
  const mt = $('modal-title');
  const mb = $('modal-body');
  const mo = $('modal-overlay');
  if (mt) mt.textContent = title;
  if (mb) mb.innerHTML = body;
  if (mo) mo.classList.remove('hidden');
}

export function hideModal() { 
  const mo = $('modal-overlay');
  if (mo) mo.classList.add('hidden'); 
}
