import { S, save } from './state.js';
import { $, qs, daysSince, todayStr, fmtDate, streak, avgMood, avgUrge, toast, notifBanner, showModal, getLevel } from './utils.js';
import { MOOD_VALS, URGE_DESC, LEVELS, QUOTES } from './constants.js';
import { checkBadges, renderBadges, awardBadge } from './progress.js';
import { renderCharts } from './progress.js';
import { renderJournal } from './journal.js';
import { initChat } from './coach.js';



export function initPatientApp() {
  const p = S.profile;
  const hp = $('home-prof');
  if (hp) hp.innerHTML = `<div class="hp-av">${p.name[0]}</div><div class="hp-name">${p.name}</div><div class="hp-meta">${p.goal === 'abstinence' ? 'Abstinence' : 'Reduction'} · Started ${fmtDate(p.startDate)}</div>`;
  const cn = $('c-name');
  if(cn) cn.textContent = p.name;
  renderHome();
  renderJournal();
  initChat();
  renderCharts();
  
  if (S.period === undefined) {
    S.period = 'week';
  }

  // Update check-in view
  const today = todayStr();
  const done = S.checkins.some(c => c.date === today);
  const cd = $('ci-done-card');
  const cf = $('ci-form');
  if(cd && cf) {
    cd.classList.toggle('hidden', !done);
    cf.classList.toggle('hidden', done);
  }

  checkNotifAlerts();
}

export function renderHome() {
  const p = S.profile;
  if (!p) return;
  const days = daysSince(p.startDate);
  const str = streak();

  const rd = $('rc-days');
  if(rd) rd.textContent = days;
  
  const xpEl = $('xp-txt');
  if(xpEl) xpEl.textContent = S.xp + ' XP';
  
  const lvl = getLevel(S.xp);
  const lb = $('lvl-badge');
  if(lb) lb.textContent = lvl.name;
  
  const pfill = $('xp-fill');
  if(pfill) {
    const pct = Math.min(100, Math.floor(((S.xp - lvl.min) / (lvl.max - lvl.min)) * 100));
    pfill.style.width = pct + '%';
  }

  const hq = $('home-quote');
  if(hq && (!hq.textContent || hq.textContent === 'Loading...')) {
    hq.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  const userStreak = streak();
  const lastCheckin = S.checkins.length > 0 ? S.checkins[S.checkins.length - 1] : null;
  const currentMood = lastCheckin ? (MOOD_VALS[lastCheckin.mood] || 3) : 3;
  const currentUrge = lastCheckin ? lastCheckin.urge : 5;

  const tl = $('task-list');
  if (tl) {
    tl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">Loading personalized tasks...</div>';
    
    const taskParams = new URLSearchParams({
      mood: currentMood,
      urge: currentUrge,
      streak: userStreak
    });
    if (S.user_id) taskParams.append('user_id', S.user_id);
    if (p.addictions && p.addictions.length) taskParams.append('addiction_type', p.addictions[0]);

    fetch(`/get-tasks?${taskParams}`)
      .then(res => res.json())
      .then(data => {
        const aw = $('avoid-warnings');
        if (data.avoid_tasks && data.avoid_tasks.length > 0) {
          if(aw) aw.innerHTML = data.avoid_tasks.map(t => `
        <div class="home-alert card-red" style="margin-bottom:10px">
          <span class="ha-icon">&#9888;</span>
          <span class="ha-text" style="color:var(--r600)"><strong>AVOID:</strong> ${t.name}</span>
        </div>`).join('');
        } else {
          if(aw) aw.innerHTML = '';
        }

        if (data.tasks && data.tasks.length > 0) {
          tl.innerHTML = data.tasks.map(task => {
            const sourceTag = task.source === 'clinician'
              ? '<span style="font-size:10px;background:var(--b50);color:var(--b600);padding:2px 6px;border-radius:var(--r999);margin-left:6px;font-weight:700">Prescribed</span>'
              : '';
            return `
        <div class="task-row" onclick="RC.completeRlTask('${task.id}', this)" style="cursor:pointer">
          <div class="task-check"></div>
          <span class="task-label">${task.name}${sourceTag}</span>
          <span class="task-xp">+15 XP</span>
        </div>`;
          }).join('');
        } else {
          tl.innerHTML = '<div style="padding:16px;">No tasks available right now.</div>';
        }
      })
      .catch(err => {
        console.error("Failed to load RL tasks:", err);
        tl.innerHTML = '<div style="padding:16px; color: var(--r500);">Failed to connect to recommendation engine. Ensure the Python server is running.</div>';
      });
  }

  // Stats
  if($('st-ci')) $('st-ci').textContent = S.checkins.length;
  if($('st-jn')) $('st-jn').textContent = S.journal.length;
  if($('st-bd')) $('st-bd').textContent = S.badges.length;
  const maxStr = Math.max(str, 0);
  if($('st-ls')) $('st-ls').textContent = maxStr;

  // Alerts
  const alerts = [];
  const lastCI = S.checkins[S.checkins.length - 1];
  if (lastCI?.mood === 'crisis') alerts.push({ ico: '🆘', msg: 'You reported a crisis recently. Please reach out for support.', cls: 'card-red ha-text', style: 'color:var(--r600)', fn: 'RC.showSOS()' });
  if (lastCI?.urge >= 8 && lastCI?.mood !== 'crisis') alerts.push({ ico: '⚠️', msg: 'High urge reported. Consider calling your sponsor or counselor.', cls: 'card-amber ha-text', style: 'color:var(--a600)', fn: 'RC.showSOS()' });
  const daysMissed = lastCI ? Math.floor((new Date() - new Date(lastCI.date)) / 86400000) : null;
  if (daysMissed !== null && daysMissed >= 2) alerts.push({ ico: '📅', msg: `It's been ${daysMissed} days since your last check-in. Every day counts.`, cls: 'card-teal ha-text', style: 'color:var(--g700)', fn: "RC.tab('checkin',null)" });
  
  const ha = $('home-alerts');
  if(ha) ha.innerHTML = alerts.map(a => `<div class="home-alert ${a.cls}" onclick="${a.fn}" style="margin-bottom:10px"><span class="ha-icon">${a.ico}</span><span class="ha-text" style="${a.style}">${a.msg}</span></div>`).join('');

  // Live Treatment plan fetch
  const tphp = $('tp-home-plan');
  if (S.user_id && tphp) {
    fetch(`/treatment-plan/${S.user_id}`).then(r => r.json()).then(data => {
      if (data.has_plan && data.plan) {
        const tp = data.plan;
        tphp.classList.remove('hidden');
        tphp.innerHTML = `<div class="card-sm card-teal" style="margin-bottom:14px"><div style="font-size:14px;font-weight:700;color:var(--g700);margin-bottom:6px">🗒️ Your Treatment Plan</div><div class="fs-13 c-muted" style="line-height:1.6">${tp.notes || 'Treatment plan active — assigned by your clinic.'}</div>${tp.appt ? `<div style="font-size:12px;color:var(--g600);margin-top:8px;font-weight:600">📅 Next appointment: ${tp.appt}</div>` : ''}</div>`;
      } else {
        tphp.classList.add('hidden');
      }
    }).catch(e => console.warn('Offline: could not fetch treatment plan', e));
  }

  checkBadges(days, str);
  renderBadges();
}

export function moodCI(el) {
  S.moodCI = el.dataset.m;
  document.querySelectorAll('#tp-checkin .mood-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

export function urgeUpdate() {
  const v = parseInt($('urge-sl')?.value || '5');
  if($('urge-val')) $('urge-val').textContent = v;
  if($('urge-big')) $('urge-big').textContent = v;
  if($('urge-desc')) $('urge-desc').textContent = URGE_DESC[v] || '';
}

export function toggleChip(el, type) {
  const cls = type === 't' ? 'trigger-on' : 'coping-on';
  el.classList.toggle(cls);
}

export async function saveCI() {
  if (!S.moodCI) { toast('Please select your mood'); return; }
  const today = todayStr();
  if (S.checkins.some(c => c.date === today)) { toast('Already checked in today! See you tomorrow 😊'); return; }
  const urge = parseInt($('urge-sl')?.value || '5');
  const triggers = [...document.querySelectorAll('#trigger-chips .trigger-on')].map(c => c.textContent.trim());
  const coping = [...document.querySelectorAll('#coping-chips .coping-on')].map(c => c.textContent.trim());
  const noteVal = $('ci-note')?.value.trim() || '';
  S.checkins.push({ date: today, mood: S.moodCI, urge, triggers, coping, note: noteVal, ts: new Date().toISOString() });
  S.xp += 10;
  if (coping.length) S.copingCount = (S.copingCount || 0) + 1;
  await save();
  await awardBadge('first_ci');
  if (S.checkins.length >= 10) await awardBadge('ci_10');
  if (S.checkins.length >= 30) await awardBadge('ci_30');
  if ((S.copingCount || 0) >= 5) await awardBadge('coping_5');
  toast('✅ Check-in saved! +10 XP');
  
  if($('ci-done-card')) $('ci-done-card').classList.remove('hidden');
  if($('ci-form')) $('ci-form').classList.add('hidden');
  
  if (S.moodCI === 'crisis') setTimeout(() => {
    const so = $('sos-overlay');
    if(so) so.classList.remove('hidden');
  }, 700);
  
  renderHome();
  
  // reset chips
  document.querySelectorAll('#trigger-chips .trigger-on').forEach(c => c.classList.remove('trigger-on'));
  document.querySelectorAll('#coping-chips .coping-on').forEach(c => c.classList.remove('coping-on'));
  if($('ci-note')) $('ci-note').value = '';
  S.moodCI = '';
  document.querySelectorAll('#tp-checkin .mood-btn').forEach(b => b.classList.remove('on'));
}

export function scheduleNotifs() {
  const p = S.profile;
  if (!p?.notifs) return;
  const schedule = (timeStr, title, text) => {
    const [h, m] = timeStr.split(':');
    const next = new Date();
    next.setHours(parseInt(h), parseInt(m), 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    setTimeout(() => {
      notifBanner(title, text);
      scheduleNotifs();
    }, next - new Date());
  };
  if (p.notifs.morning?.on && p.notifs.morning?.time) schedule(p.notifs.morning.time, '🌅 Morning intention', 'Start your day with a check-in and clear purpose.');
  if (p.notifs.evening?.on && p.notifs.evening?.time) schedule(p.notifs.evening.time, '🌙 Evening reflection', 'How did today go? Your journal is waiting.');
}

export function checkNotifAlerts() {
  const cis = S.checkins;
  if (!cis.length) return;
  const daysMissed = Math.floor((new Date() - new Date(cis[cis.length - 1].date)) / 86400000);
  if (daysMissed >= 2) {
    setTimeout(() => notifBanner('💙 We miss you', `It's been ${daysMissed} days since your last check-in. Your streak is waiting for you.`), 2000);
  }
}

export function tab(name, el) {
  document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`tp-${name}`)?.classList.add('active');
  if (el) el.classList.add('active');
  else {
    const btns = document.querySelectorAll('.nav-btn');
    const map = { home: 0, checkin: 1, journal: 2, coach: 3, progress: 4, mycare: 5 };
    if(btns[map[name]]) btns[map[name]].classList.add('active');
  }
  if (name === 'checkin') {
    const today = todayStr();
    const done = S.checkins.some(c => c.date === today);
    if($('ci-done-card')) $('ci-done-card').classList.toggle('hidden', !done);
    if($('ci-form')) $('ci-form').classList.toggle('hidden', done);
  }
  if (name === 'progress') setTimeout(() => renderCharts(), 80);
  if (name === 'coach') {
    const m = $('chat-msgs');
    if(m) m.scrollTop = m.scrollHeight;
  }
  if (name === 'mycare') loadMyCare();
}

export async function loadMyCare() {
  if (!S.user_id) {
    const el = $('mycare-content');
    if (el) el.innerHTML = '<div class="card" style="text-align:center;padding:32px"><div style="font-size:40px;margin-bottom:12px">🔗</div><h3>Not linked to a clinic</h3><p class="fs-13 c-muted">If your clinic gave you a facility code, you can enter it during registration to link your account.</p></div>';
    return;
  }

  const label = $('mycare-facility-label');
  const content = $('mycare-content');

  try {
    const resp = await fetch(`/patient/my-care/${S.user_id}`);
    const data = await resp.json();

    if (label) {
      if (data.facility_name) {
        label.textContent = `Your care team at ${data.facility_name} (${data.facility_code})`;
      } else {
        label.textContent = 'You are not currently linked to a clinic.';
      }
    }

    let html = '';

    // Treatment Plan section
    if (data.treatment_plan) {
      const tp = data.treatment_plan;
      const goalsHtml = (tp.goals || []).map(g =>
        `<div style="display:flex;align-items:center;gap:8px;padding:6px 0">
          <span style="color:${g.done ? 'var(--g700)' : 'var(--text-muted)'};font-size:16px">${g.done ? '✅' : '⬜'}</span>
          <span style="text-decoration:${g.done ? 'line-through' : 'none'};color:${g.done ? 'var(--text-muted)' : 'var(--text-main)'}">${g.text}</span>
        </div>`
      ).join('') || '<p class="fs-13 c-muted">No goals set yet.</p>';

      html += `
      <div class="card mb-12" style="border-left:4px solid var(--b600)">
        <div style="font-weight:700;font-size:16px;margin-bottom:12px;color:var(--b700)">🗒️ Treatment Plan</div>
        ${tp.therapy ? `<div class="mb-8"><span class="fs-13 c-muted">Approach:</span> <strong>${tp.therapy}</strong></div>` : ''}
        ${tp.diagnosis ? `<div class="mb-8"><span class="fs-13 c-muted">Diagnosis:</span> <strong>${tp.diagnosis}</strong></div>` : ''}
        ${tp.meds ? `<div class="mb-8"><span class="fs-13 c-muted">Medications:</span> <strong>${tp.meds}</strong></div>` : ''}
        ${tp.appt ? `<div class="mb-8"><span class="fs-13 c-muted">Next appointment:</span> <strong>${fmtDate(tp.appt)}</strong></div>` : ''}
        ${tp.notes ? `<div class="card-sm card-teal mb-8"><div class="fs-13" style="color:var(--g700)">📝 Notes from your clinician</div><div style="margin-top:6px">${tp.notes}</div></div>` : ''}
        <div style="margin-top:12px">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px">Recovery Goals</div>
          ${goalsHtml}
        </div>
        ${tp.updated_at ? `<div class="fs-13 c-muted" style="margin-top:12px;text-align:right">Last updated: ${tp.updated_at.slice(0, 10)}</div>` : ''}
      </div>`;
    } else if (data.facility_name) {
      html += `<div class="card mb-12" style="text-align:center;padding:24px;border-left:4px solid var(--a400)">
        <div style="font-size:32px;margin-bottom:8px">📋</div>
        <h3 style="margin-bottom:4px">No treatment plan yet</h3>
        <p class="fs-13 c-muted">Your care team hasn't created a treatment plan yet. Check back soon.</p>
      </div>`;
    }

    // Clinician Tasks section
    if (data.clinician_tasks && data.clinician_tasks.length > 0) {
      const taskRows = data.clinician_tasks.map(t => {
        const typeColor = t.task_type === 'avoid' ? 'var(--r500)' : 'var(--g700)';
        const typeLabel = t.task_type === 'avoid' ? '⚠️ Avoid' : '✅ Do';
        const diffColor = t.difficulty === 'High' ? 'var(--r500)' : t.difficulty === 'Medium' ? 'var(--a500)' : 'var(--g700)';
        return `
        <div class="card-sm mb-8" style="border-left:3px solid ${typeColor}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-weight:600;color:${typeColor};font-size:12px">${typeLabel}</span>
            <span style="font-size:11px;color:${diffColor};font-weight:600">${t.difficulty || 'Medium'}</span>
          </div>
          <div style="font-weight:600;margin-bottom:4px">${t.actionable_task}</div>
          ${t.condition_trigger ? `<div class="fs-13 c-muted">When: ${t.condition_trigger}</div>` : ''}
          ${t.addiction_type ? `<div class="fs-13 c-muted" style="margin-top:2px">For: ${t.addiction_type}</div>` : ''}
        </div>`;
      }).join('');

      html += `
      <div style="margin-top:16px">
        <div style="font-weight:700;font-size:16px;margin-bottom:12px;color:var(--b700)">📋 Clinical Tasks (${data.task_count})</div>
        ${taskRows}
      </div>`;
    } else if (data.facility_name) {
      html += `<div class="card mb-12" style="text-align:center;padding:24px;border-left:4px solid var(--a400)">
        <div style="font-size:32px;margin-bottom:8px">📝</div>
        <h3 style="margin-bottom:4px">No clinical tasks</h3>
        <p class="fs-13 c-muted">Your care team hasn't assigned any clinical tasks yet.</p>
      </div>`;
    }

    // Not linked state
    if (!data.facility_name) {
      html = `<div class="card" style="text-align:center;padding:32px">
        <div style="font-size:40px;margin-bottom:12px">🔗</div>
        <h3>Not linked to a clinic</h3>
        <p class="fs-13 c-muted" style="margin-top:8px">If your clinic gave you a facility code, enter it during registration to link your recovery data to their portal. Your care team can then create treatment plans and assign tasks visible here.</p>
      </div>`;
    }

    if (content) content.innerHTML = html;

  } catch (e) {
    console.warn('Failed to load care data:', e);
    if (content) content.innerHTML = '<div class="card-red card-sm">Could not load care information. Ensure the backend is running.</div>';
  }
}
