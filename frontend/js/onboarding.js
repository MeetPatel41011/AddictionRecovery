import { S, save } from './state.js';
import { $, show, todayStr, toast } from './utils.js';
import { showOTP } from './otp.js';
import { initPatientApp } from './patient.js';
import { awardBadge } from './progress.js';
import { showPendingScreen } from './approvals.js';
import { scheduleNotifs } from './patient.js';

export function initLanding() {
  // No op for now since resume logic is removed
}

export function showPatLogin() {
  show('s-pat-login');
}

export async function patientLogin() {
  const contact = $('pat-login-contact')?.value.trim();
  const password = $('pat-login-pass')?.value;
  if (!contact || !password) {
    toast('Please enter email/phone and password', '');
    return;
  }
  
  try {
    const resp = await fetch('/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact, password })
    });
    const data = await resp.json();
    if (data.status === 'success' && data.user) {
      S.user_id = data.user.id;
      if (!S.profile) {
        S.profile = { name: data.user.name, contact: data.user.contact, addictions: data.user.addiction_types || [], goal: 'abstinence', startDate: data.user.created_at || todayStr() };
        S.xp = 0; S.checkins = []; S.journal = []; S.badges = [];
        S.chatHistory = []; S.chatSessions = []; S.copingCount = 0;
      }
      
      await save();
      
      if (data.user.status === 'pending') {
        showPendingScreen();
        return;
      }
      
      showOTP('patient', () => {
        show('s-patient');
        initPatientApp();
      });
    } else {
      toast(data.detail || 'Invalid email/phone or password', '');
    }
  } catch(e) {
    console.warn('Login failed:', e);
    toast('Login failed. Ensure backend is running.', '');
  }
}

export function startPatient() {
  S.ob = { step: 1, addictions: [], gender: '', reason: '', goal: '' };
  renderObStep();
  show('s-onboard');
}

export function goFacilityLogin() { show('s-fac-login'); }

export function renderObStep() {
  const { step } = S.ob;
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  const sEl = $(`ob-s${step}`);
  if (sEl) sEl.classList.add('active');
  
  const prog = $('ob-prog');
  if(prog) prog.style.width = (step * 20) + '%';
  
  const sl = $('ob-step-lbl');
  if (sl) sl.textContent = `${step} / 5`;
  
  const n = $('ob-next');
  if (n) n.textContent = step === 5 ? 'Start my journey 🌱' : 'Continue →';
  
  const b = $('ob-back');
  if (b) b.style.visibility = step === 1 ? 'hidden' : 'visible';
}

export function obBack() {
  if (S.ob.step > 1) { S.ob.step--; renderObStep(); }
  else show('s-land');
}

export async function obNext() {
  const { step } = S.ob;
  if (step === 1) {
    const n = $('ob-name')?.value.trim();
    if (!n) { toast('Please enter your name 😊', ''); return; }
    const contact = $('ob-contact')?.value.trim();
    if (!contact) { toast('Email or Mobile Number is required', ''); return; }
    const pass = $('ob-pass')?.value;
    if (!pass) { toast('Please set a password', ''); return; }

    // Check if contact is already registered
    try {
      const resp = await fetch(`/user/check-contact?contact=${encodeURIComponent(contact)}`);
      const data = await resp.json();
      if (data.exists) {
        toast('This email/phone is already registered. Please login instead.', '');
        return;
      }
    } catch (e) {
      console.warn('Contact check failed (offline mode):', e);
    }
  }
  if (step === 2) {
    if (!S.ob.addictions.length) { toast('Select at least one addiction to track'); return; }
  }
  if (step === 4) {
    if (!S.ob.goal) { toast('Please choose your primary goal'); return; }
  }
  if (step === 5) {
    // OTP gate: generate code, show alert, then show OTP overlay
    showOTP('patient', () => finishOnboard());
    return;
  }
  S.ob.step++;
  renderObStep();
}

export function pill(el, groupId, key) {
  document.querySelectorAll(`#${groupId} .pill`).forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  S.ob[key] = el.textContent.trim();
}

export function toggleA(el) {
  el.classList.toggle('on');
  const id = el.dataset.id;
  if (el.classList.contains('on')) {
    if (!S.ob.addictions.includes(id)) S.ob.addictions.push(id);
  } else {
    S.ob.addictions = S.ob.addictions.filter(a => a !== id);
  }
}

export function radio(el, name) {
  document.querySelectorAll(`[name="${name}"]`).forEach(r => r.closest('.radio-item')?.classList.remove('on'));
  el.classList.add('on');
  const inputEl = el.querySelector('input');
  if(inputEl) inputEl.checked = true;
  if (name === 'q-goal' && inputEl) S.ob.goal = inputEl.value;
}

/** Calculate age from a date-of-birth string (YYYY-MM-DD) */
function calcAge(dobStr) {
  if (!dobStr) return '?';
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export async function finishOnboard() {
  const code = $('ob-code')?.value.trim().toUpperCase() || '';
  const dob = $('ob-dob')?.value || null;
  const contact = $('ob-contact')?.value.trim() || '';
  S.profile = {
    name: $('ob-name')?.value.trim() || '',
    contact,
    age: calcAge(dob),
    dob: dob,
    gender: S.ob.gender,
    reason: S.ob.reason,
    addictions: S.ob.addictions,
    goal: S.ob.goal,
    why: $('ob-why')?.value.trim() || '',
    code,
    startDate: todayStr(),
    createdAt: new Date().toISOString(),
    notifs: {
      morning: { on: $('n-morn-on')?.checked || false, time: $('n-morn')?.value || '08:00' },
      evening: { on: $('n-eve-on')?.checked || false, time: $('n-eve')?.value || '20:00' }
    },
    assessment: {
      wd: parseInt($('q-wd')?.value || '5'),
      impact: document.querySelector('[name=q-impact]:checked')?.value || 'moderate',
      mental: document.querySelector('[name=q-mental]:checked')?.value || 'sometimes',
      att: document.querySelector('[name=q-att]:checked')?.value || '1-2',
      sup: document.querySelector('[name=q-sup]:checked')?.value || 'neutral',
      mot: parseInt($('q-mot')?.value || '5')
    }
  };
  S.xp = 0; S.checkins = []; S.journal = []; S.badges = [];
  S.chatHistory = []; S.chatSessions = []; S.copingCount = 0;
  await save();
  if (code) {
    await awardBadge('linked', true);
    setTimeout(() => toast('Linked to your clinic!', 'amber'), 1200);
  }

  // Register user with backend API for RL + premium pipeline
  try {
    const resp = await fetch('/user/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: S.profile.name,
        password: $('ob-pass')?.value || '1234',
        contact: contact || null,
        addiction_types: S.profile.addictions,
        facility_code: code || null,
        is_premium: false,
        dob: dob
      })
    });
    const data = await resp.json();
    if (resp.status === 409) {
      // Duplicate contact — redirect to login
      toast(data.detail || 'Already registered. Please login.', '');
      show('s-pat-login');
      return;
    }
    if (data.user && data.user.id) {
      S.user_id = data.user.id;
      await save();
      console.log('User registered with backend:', S.user_id);

      // If user has a facility code, backend sets status='pending'
      // Show pending screen instead of patient app
      if (code && data.user.status === 'pending') {
        showPendingScreen();
        return;
      }
    }
  } catch (e) {
    console.warn('Backend user registration failed (offline mode):', e);
  }

  show('s-patient');
  initPatientApp();
  scheduleNotifs();
}
