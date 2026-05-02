import { S, FAC_PTS, persist_tp } from './state.js';
import { $, show, toast, avatarColors, initials, riskBadge, daysSince, avgUrge, avgMood, fmtDate, fmtDateShort, hideModal, showModal, todayStr, calculateRiskLevel, calculateLiveAssessment } from './utils.js';
import { showOTP } from './otp.js';
import { ADDICTION_NAMES, MOOD_CLASSES, API, MODEL } from './constants.js';
import { loadPendingUsers } from './approvals.js';

export function showFacRegister() {
  show('s-fac-register');
}

export async function facilityRegister() {
  const name = $('fac-reg-name')?.value.trim();
  const password = $('fac-reg-pass')?.value;
  if (!name || !password) { toast('Please enter facility name and password'); return; }

  try {
    const resp = await fetch('/facility/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    const data = await resp.json();
    if (data.status === 'success') {
      $('fac-reg-form').classList.add('hidden');
      $('fac-reg-success').classList.remove('hidden');
      $('new-fac-code').textContent = data.facility.code;
    } else {
      toast('Registration failed', '');
    }
  } catch (e) {
    console.warn('Facility registration failed:', e);
    toast('Registration failed. Ensure backend is running.', '');
  }
}

export async function facilityLogin() {
  const codeInput = $('fac-code-in');
  const passInput = $('fac-pass-in');
  const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
  const password = passInput ? passInput.value : '';
  if (!code || !password) { toast('Please enter code and password'); return; }

  try {
    const resp = await fetch('/facility/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password })
    });
    const data = await resp.json();
    if (data.status === 'success' && data.facility) {
      S.facName = data.facility.name;
      S.facCode = data.facility.code;
      const fbs = $('fac-bar-sub');
      if (fbs) fbs.textContent = S.facName + ' · Clinic Portal';

      showOTP('facility', async () => {
        show('s-fac-app');
        await loadFacilityPatients();
        renderFacPts();
        populatePtSelects();
        renderFacAlerts();
        loadPendingUsers();

        // Start live polling for real-time updates
        if (S.facPollTimer) clearInterval(S.facPollTimer);
        S.facPollTimer = setInterval(async () => {
          if ($('s-fac-app') && !$('s-fac-app').classList.contains('hidden')) {
            await loadFacilityPatients();
            populatePtSelects(); // Keep dropdowns fresh
            // If on dashboard, re-render automatically
            const ftDash = $('ft-dash');
            if (ftDash && ftDash.classList.contains('active')) {
              renderFacPts($('fac-pt-search')?.value || '');
            }
          }
        }, 10000);
      });
    } else {
      toast('Invalid access code or password', '');
    }
  } catch (e) {
    console.warn('Facility login failed:', e);
    toast('Login failed. Ensure backend is running.', '');
  }
}

/**
 * Fetches real approved patients from the backend API for this facility.
 */
export async function loadFacilityPatients() {
  if (!S.facCode) return;
  try {
    const resp = await fetch(`/facility/patients/${S.facCode}`);
    const data = await resp.json();
    const pts = data.patients || [];
    // Clear and repopulate the shared FAC_PTS array
    FAC_PTS.length = 0;
    pts.forEach(p => FAC_PTS.push(p));
    console.log(`Loaded ${FAC_PTS.length} patients for facility ${S.facCode}`);
  } catch (e) {
    console.warn('Failed to load facility patients:', e);
    toast('Could not load patients. Ensure backend is running.', 'red');
  }
}

export function renderFacPts(filter = '') {
  const pts = filter
    ? FAC_PTS.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
    : FAC_PTS;
  const pc = $('pt-count');
  if (pc) pc.textContent = `(${pts.length})`;

  const pl = $('pt-list');
  if (!pl) return;
  if (!pts.length) {
    pl.innerHTML = `<div class="empty-state"><div class="empty-ico">📋</div><h3>No patients yet</h3><p>Patients who register with your facility code and are approved will appear here.</p></div>`;
    return;
  }
  pl.innerHTML = pts.map(p => {
    const days = daysSince(p.startDate);
    const lastCI = (p.checkins || [])[(p.checkins || []).length - 1];
    const daysSinceCI = lastCI ? Math.floor((new Date() - new Date(lastCI.date)) / 86400000) : 99;
    const [bg, fg] = avatarColors(p.name);
    const liveRisk = calculateRiskLevel(p);
    return `<div class="pt-card" onclick="RC.viewPt('${p.id}')">
  <div class="pt-top">
    <div class="pt-ava" style="background:${bg};color:${fg}">${initials(p.name)}</div>
    <div class="pt-info">
      <div class="pt-name">${p.name}</div>
      <div class="pt-meta">${(p.addictions || []).map(a => ADDICTION_NAMES[a] || a).join(', ')} · ${p.age || '?'}y ${p.gender || ''}</div>
    </div>
    ${riskBadge(liveRisk)}
  </div>
  <div class="pt-stats-row">
    <span>📅 ${days} days</span>
    <span>✅ ${(p.checkins || []).length} check-ins</span>
    <span>📓 ${(p.journal || []).length} entries</span>
    <span style="color:${daysSinceCI > 3 ? 'var(--r500)' : 'var(--text-muted)'}">Last: ${daysSinceCI === 0 ? 'Today' : daysSinceCI + 'd ago'}</span>
  </div>
</div>`;
  }).join('');
}

export function filterPts() {
  const ps = $('pt-search');
  if (ps) renderFacPts(ps.value);
}

export function renderFacAlerts() {
  const highRisk = FAC_PTS.filter(p => calculateRiskLevel(p) === 'high');
  const missed = FAC_PTS.filter(p => {
    const checkins = p.checkins || [];
    const lci = checkins[checkins.length - 1];
    return lci ? Math.floor((new Date() - new Date(lci.date)) / 86400000) > 4 : true;
  });
  const alerts = [
    ...highRisk.map(p => `⚠️ High-risk patient: <strong>${p.name}</strong> — urge scores trending high, check their detail`),
    ...missed.filter(p => !highRisk.includes(p)).map(p => `📅 Missed check-ins: <strong>${p.name}</strong> hasn't logged in recently`)
  ];
  const fa = $('fac-alerts');
  // if(fa) {
  //   if (alerts.length === 0 && FAC_PTS.length === 0) {
  //     fa.innerHTML = '<div class="alert-row"><span class="alert-ico">📋</span><span class="alert-msg">No patients linked to your facility yet. Share your facility code with patients during their registration.</span></div>';
  //   } else if (alerts.length === 0) {
  //     fa.innerHTML = '<div class="alert-row"><span class="alert-ico">✅</span><span class="alert-msg">All patients are on track. No alerts at this time.</span></div>';
  //   } else {
  //     fa.innerHTML = alerts.map(msg => `<div class="alert-row"><span class="alert-ico">🔔</span><span class="alert-msg">${msg}</span></div>`).join('');
  //   }
  // }
}

export async function viewPt(id) {
  // Live flow: fetch fresh patient data first
  await loadFacilityPatients();

  const p = FAC_PTS.find(x => x.id === id);
  if (!p) return;
  S.currentPt = p;
  const days = daysSince(p.startDate);
  const [bg, fg] = avatarColors(p.name);

  // Live flow: fetch fresh treatment plan from server
  let tp = null;
  try {
    const res = await fetch(`/treatment-plan/${id}`);
    const data = await res.json();
    if (data.has_plan && data.plan) {
      tp = data.plan;
      S.tplans[id] = tp; // Update local cache
    }
  } catch (e) { }

  const checkins = p.checkins || [];
  const journal = p.journal || [];
  const allEvents = [...checkins, ...journal];
  const avgU = avgUrge(checkins);
  const avgM = avgMood(allEvents);
  const liveRisk = calculateRiskLevel(p);
  const assess = calculateLiveAssessment(p);
  const pdc = $('pt-detail-content');
  if (!pdc) return;
  pdc.innerHTML = `
<div class="pt-detail-head">
  <div class="pt-detail-ava" style="background:${bg};color:${fg}">${initials(p.name)}</div>
  <div>
    <div class="pt-detail-name">${p.name}</div>
    <div class="pt-detail-sub">${p.age || '?'}y · ${p.gender || '?'} · Goal: ${p.goal || 'abstinence'}</div>
    <div style="margin-top:6px">${riskBadge(liveRisk)}</div>
  </div>
</div>
<div class="detail-stats mb-16">
  <div class="ds-box"><div class="ds-n" style="color:var(--b600)">${days}</div><div class="ds-l">Days in recovery</div></div>
  <div class="ds-box"><div class="ds-n" style="color:var(--b600)">${checkins.length}</div><div class="ds-l">Check-ins logged</div></div>
  <div class="ds-box"><div class="ds-n" style="color:${parseFloat(avgU) > 6 ? 'var(--r500)' : 'var(--a500)'}">${avgU}</div><div class="ds-l">Avg urge / 10</div></div>
  <div class="ds-box"><div class="ds-n" style="color:var(--g700)">${avgM}</div><div class="ds-l">Avg mood / 5</div></div>
</div>
<div class="chip-info" style="margin-bottom:14px">
  <div class="home-sec-title">Addictions tracked</div>
  <div class="pill-group">${(p.addictions || []).map(a => `<span class="chip" style="cursor:default">${ADDICTION_NAMES[a] || a}</span>`).join('') || '<span class="c-muted fs-13">None specified</span>'}</div>
</div>
<div class="home-sec-title">Dynamic Clinical Assessment</div>
<div class="detail-stats mb-16" style="display:flex;flex-direction:column;gap:12px">
  <div class="ds-box" style="width:100%;flex-direction:row;justify-content:space-between;align-items:center;padding:16px"><div class="ds-l" style="font-size:14px;color:var(--text-main);font-weight:600;margin:0">Craving - withdrawal severity</div><div class="ds-n" style="font-size:18px;color:${parseInt(assess.wd) > 6 ? 'var(--r500)' : 'var(--a600)'}">${assess.wd || '?'}/10</div></div>
  <div class="ds-box" style="width:100%;flex-direction:row;justify-content:space-between;align-items:center;padding:16px"><div class="ds-l" style="font-size:14px;color:var(--text-main);font-weight:600;margin:0">Clinical motivation score</div><div class="ds-n" style="font-size:18px;color:var(--g700)">${assess.mot || '?'}/10</div></div>
</div>
${tp ? `<div class="card-sm card-teal mb-16"><div style="font-weight:700;color:var(--g700);margin-bottom:6px">🗒️ Active Treatment Plan</div><div class="fs-13 c-muted">${tp.therapy || 'Therapy assigned'} · ${tp.diagnosis || 'Diagnosis pending'}</div>${tp.notes ? `<div class="fs-13" style="margin-top:6px;color:var(--text-mid)">${tp.notes}</div>` : ''}</div>` : `<div class="card-sm card-amber mb-16"><div class="fs-13" style="color:var(--a600)">⚠️ No treatment plan assigned. <span style="cursor:pointer;font-weight:600;text-decoration:underline" onclick="RC.facTab('treatment',document.querySelectorAll('.fac-nav-btn')[2]);document.getElementById('tp-sel').value='${p.id}';RC.loadTP()">Create one →</span></div></div>`}
<div class="home-sec-title">Recent check-ins (last 5)</div>
<div class="card-flush mb-16" style="padding:4px 14px">
  ${checkins.length ? checkins.slice(-5).reverse().map(c => `<div class="ci-mini"><span class="ci-mini-date">${fmtDateShort(c.date)}</span><span class="mood-tag ${MOOD_CLASSES[c.mood] || 'mt-ok'}" style="font-size:10px">${c.mood}</span><span class="ci-mini-urge" style="background:${c.urge >= 7 ? 'var(--r50)' : 'var(--a50)'};color:${c.urge >= 7 ? 'var(--r500)' : 'var(--a600)'}">${c.urge}/10</span>${(c.triggers || []).length ? `<span class="fs-13 c-muted">${c.triggers.slice(0, 2).join(', ')}</span>` : ''}</div>`).join('') : '<div class="fs-13 c-muted" style="padding:12px 0">No check-ins recorded yet.</div>'}
</div>
<div class="home-sec-title">Journal excerpts (last 3)</div>
<div class="card-flush mb-16" style="padding:4px 14px">
  ${journal.length ? journal.slice(-3).reverse().map(j => `<div class="j-mini"><div class="j-mini-date">${fmtDateShort(j.date)} · <span class="mood-tag ${MOOD_CLASSES[j.mood] || 'mt-ok'}" style="font-size:10px">${j.mood}</span></div><div class="j-mini-text">${j.text}</div></div>`).join('') : '<div class="fs-13 c-muted" style="padding:12px 0">No journal entries yet.</div>'}
</div>
<div class="row-2" style="gap:8px">
  <button class="btn btn-blue" onclick="RC.facTab('treatment',document.querySelectorAll('.fac-nav-btn')[2]);document.getElementById('tp-sel').value='${p.id}';RC.loadTP()">🗒️ Treatment Plan</button>
  <button class="btn btn-ghost" onclick="RC.facTab('reports',document.querySelectorAll('.fac-nav-btn')[3]);document.getElementById('rep-sel').value='${p.id}';RC.loadRepPt()">📄 Generate Report</button>
</div>
`;
  facTab('detail', document.querySelectorAll('.fac-nav-btn')[1]);
}

export function populatePtSelects() {
  const opts = FAC_PTS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if ($('tp-sel')) $('tp-sel').innerHTML = '<option value="">— Choose a patient —</option>' + opts;
  if ($('rep-sel')) $('rep-sel').innerHTML = '<option value="">— Select patient —</option>' + opts;
  if ($('clin-upload-sel')) $('clin-upload-sel').innerHTML = '<option value="">-- Choose a patient --</option>' + opts;
}

export async function loadTP() {
  const idEl = $('tp-sel');
  if (!idEl) return;
  const id = idEl.value;
  const form = $('tp-form');
  if (!id) { if (form) form.innerHTML = ''; return; }
  const p = FAC_PTS.find(x => x.id === id);
  if (!p) { if (form) form.innerHTML = '<div class="c-muted fs-13">Patient not found.</div>'; return; }

  if (form) form.innerHTML = '<div class="dot-loader" style="margin:20px 0"><span></span><span></span><span></span></div>';

  // Live flow: fetch fresh treatment plan from server
  let tp = { diagnosis: '', meds: '', therapy: '', goals: [], notes: '', cnotes: '', appt: '' };
  try {
    const res = await fetch(`/treatment-plan/${id}`);
    const data = await res.json();
    if (data.has_plan && data.plan) {
      tp = data.plan;
      S.tplans[id] = tp; // Update local cache
    }
  } catch (e) { }

  if (form) form.innerHTML = `
<div class="card">
  <div style="font-size:16px;font-weight:700;margin-bottom:18px">Treatment Plan — ${p.name}</div>
  <div class="tp-sec-title">Diagnosis & Medications</div>
  <div class="field"><label class="field-label">Primary diagnosis (ICD-10)</label><input class="field-input" id="tp-dx" value="${tp.diagnosis}" placeholder="e.g. Alcohol Use Disorder, Severe (F10.20)"></div>
  <div class="field"><label class="field-label">Current medications</label><input class="field-input" id="tp-meds" value="${tp.meds}" placeholder="e.g. Naltrexone 50mg daily, Bupropion 150mg"></div>
  <div class="tp-sec-title">Therapy & Approach</div>
  <div class="field"><label class="field-label">Treatment modality</label>
    <select class="field-input" id="tp-therapy" style="border-color:var(--b200)">
      <option value="">Select approach...</option>
      ${['CBT (Cognitive Behavioral Therapy)', 'Motivational Enhancement Therapy (MET)', 'Contingency Management', '12-Step Facilitation', 'Dialectical Behavior Therapy (DBT)', 'EMDR Trauma Therapy', 'Matrix Model', 'Harm Reduction'].map(t => `<option value="${t}" ${tp.therapy === t ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
  </div>
  <div class="tp-sec-title">Recovery Goals</div>
  <div id="tp-goals">${(tp.goals || []).map((g, i) => `<div class="goal-row"><input type="checkbox" ${g.done ? 'checked' : ''} onchange="RC.toggleGoal('${id}',${i})"><span class="goal-text">${g.text}</span><button class="goal-del" onclick="RC.delGoal('${id}',${i})">✕</button></div>`).join('')}</div>
  <div class="add-goal-row"><input class="add-goal-input" id="tp-new-goal" placeholder="Add a recovery goal..." type="text"><button class="add-goal-btn" onclick="RC.addGoal('${id}')">Add</button></div>
  <div class="tp-sec-title">Notes</div>
  <div class="field"><label class="field-label">Treatment notes (visible to patient)</label><textarea class="field-input" id="tp-notes" rows="3">${tp.notes}</textarea></div>
  <div class="field"><label class="field-label">Clinician notes (private — never shown to patient)</label><textarea class="field-input" id="tp-cnotes" rows="3" style="border-color:var(--r100)">${tp.cnotes}</textarea></div>
  <div class="field"><label class="field-label">Next appointment</label><input class="field-input" type="date" id="tp-appt" value="${tp.appt}"></div>
  <button class="btn btn-blue mt-8" onclick="RC.saveTP('${id}')">💾 Save Treatment Plan</button>
</div>
`;
}

export async function saveTP(id) {
  const tp = S.tplans[id] || { goals: [] };
  tp.diagnosis = $('tp-dx')?.value || '';
  tp.meds = $('tp-meds')?.value || '';
  tp.therapy = $('tp-therapy')?.value || '';
  tp.notes = $('tp-notes')?.value || '';
  tp.cnotes = $('tp-cnotes')?.value || '';
  tp.appt = $('tp-appt')?.value || '';
  tp.updatedAt = new Date().toISOString();
  S.tplans[id] = tp;
  await persist_tp();

  // Also persist to backend so patients can see it
  try {
    await fetch('/treatment-plan/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: id,
        diagnosis: tp.diagnosis,
        meds: tp.meds,
        therapy: tp.therapy,
        goals: tp.goals || [],
        notes: tp.notes,
        cnotes: tp.cnotes,
        appt: tp.appt
      })
    });
  } catch (e) {
    console.warn('Backend treatment plan save failed:', e);
  }

  toast('✅ Treatment plan saved!');
}
export async function saveTP_store() { await persist_tp(); }

export async function addGoal(pid) {
  const inp = $('tp-new-goal');
  const txt = inp?.value.trim() || '';
  if (!txt) return;
  if (!S.tplans[pid]) S.tplans[pid] = { goals: [] };
  if (!S.tplans[pid].goals) S.tplans[pid].goals = [];
  S.tplans[pid].goals.push({ text: txt, done: false });
  await persist_tp();
  if (inp) inp.value = '';
  renderGoals(pid);
}

export async function toggleGoal(pid, idx) {
  if (S.tplans[pid]?.goals?.[idx]) {
    S.tplans[pid].goals[idx].done = !S.tplans[pid].goals[idx].done;
    await persist_tp();
    renderGoals(pid);
  }
}

export async function delGoal(pid, idx) {
  if (S.tplans[pid]?.goals?.[idx]) {
    S.tplans[pid].goals.splice(idx, 1);
    await persist_tp();
    renderGoals(pid);
  }
}

function renderGoals(pid) {
  const container = $('tp-goals');
  if (!container) return;
  const tp = S.tplans[pid];
  container.innerHTML = (tp?.goals || []).map((g, i) => `<div class="goal-row"><input type="checkbox" ${g.done ? 'checked' : ''} onchange="RC.toggleGoal('${pid}',${i})"><span class="goal-text">${g.text}</span><button class="goal-del" onclick="RC.delGoal('${pid}',${i})">✕</button></div>`).join('');
}

// showAddPatient and addPatient removed — patients now come from real registrations.
// Facility shares its code with patients; patients register with that code and get approved.
export function showAddPatient() {
  toast('Patients register themselves using your facility code. Share your code with new patients and approve them in the Approvals tab.', '', 6000);
}
export function addPatient() {
  // no-op — kept for compatibility with window.RC exports
}

export function loadRepPt() {
  const rs = $('rep-sel');
  const id = rs ? rs.value : null;
  const prev = $('rep-preview');
  if (!id) { if (prev) prev.innerHTML = ''; return; }
  const p = FAC_PTS.find(x => x.id === id);
  if (!p) return;
  const days = daysSince(p.startDate);
  const [bg, fg] = avatarColors(p.name);
  const liveRisk = calculateRiskLevel(p);
  if (prev) prev.innerHTML = `<div class="rep-patient-preview"><div class="pt-ava" style="background:${bg};color:${fg};width:40px;height:40px;font-size:14px">${initials(p.name)}</div><div><div style="font-weight:700">${p.name}</div><div class="fs-13 c-muted">${days} days · ${(p.checkins || []).length} check-ins · ${riskBadge(liveRisk)}</div></div></div>`;
}

export async function genFacReport() {
  const rs = $('rep-sel');
  const id = rs ? rs.value : null;
  if (!id) { toast('Select a patient first'); return; }
  const p = FAC_PTS.find(x => x.id === id);
  if (!p) { toast('Patient not found'); return; }
  const btn = $('gen-rep-btn');
  const area = $('fac-report-area');
  if (area) area.innerHTML = '<div class="ai-gen-row"><div class="dot-loader"><span></span><span></span><span></span></div><span>Generating AI clinical report...</span></div>';
  if (btn) btn.disabled = true;
  const tp = S.tplans[id];
  const checkins = p.checkins || [];
  const journal = p.journal || [];
  const days = daysSince(p.startDate);
  const allEvents = [...checkins, ...journal];
  const liveRisk = calculateRiskLevel(p);
  const liveAssess = calculateLiveAssessment(p);
  const avgU = avgUrge(checkins);
  const avgM = avgMood(allEvents);
  const prompt = `Generate a formal clinical progress report for a licensed addiction treatment facility. Write in professional clinical language suitable for a patient chart.

Patient: ${p.name}, ${p.age || '?'} years old, ${p.gender || '?'}
Addictions: ${(p.addictions || []).map(a => ADDICTION_NAMES[a] || a).join(', ') || 'unspecified'}
Primary goal: ${p.goal || 'abstinence'}
Days in recovery: ${days}
Total check-ins: ${checkins.length}
Average urge intensity: ${avgU}/10
Average mood: ${avgM}/5
Current risk level: ${liveRisk}
Assessment profile: Withdrawal severity ${liveAssess.wd || '?'}/10, Life impact: ${liveAssess.impact || '?'}, Mental health co-occurrence: ${liveAssess.mental || '?'}, Prior attempts: ${liveAssess.att || '?'}, Support environment: ${liveAssess.sup || '?'}, Motivation: ${liveAssess.mot || '?'}/10
${tp ? `Active treatment: ${tp.therapy || 'unspecified'}, Diagnosis: ${tp.diagnosis || 'pending'}, Medications: ${tp.meds || 'none documented'}` : 'No treatment plan currently assigned.'}
Recent mood trend (last 5): ${checkins.slice(-5).map(c => c.mood).join(', ') || 'insufficient data'}
Journal entries reviewed: ${journal.length}

Write sections: (1) Clinical Summary, (2) Progress Assessment, (3) Risk & Protective Factors, (4) Treatment Response, (5) Clinical Recommendations, (6) Next Steps. Use formal clinical language, 320–400 words total.`;
  try {
    const resp = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) });
    let d;
    try { d = await resp.json(); } catch(e) {}
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text && !resp.ok) throw new Error(`Status ${resp.status}`);
    const finalText = text || 'Unable to generate report.';
    if (area) area.innerHTML = `<div class="clin-report">
  <h3>Clinical Progress Report — ${p.name}</h3>
  <div class="report-meta">Generated ${fmtDate(todayStr())} · ${S.facName || 'Recovery Compass Clinic'}</div>
  <div class="report-metrics">
    <div class="report-metric"><div class="rm-n">${days}</div><div class="rm-l">Days</div></div>
    <div class="report-metric"><div class="rm-n">${checkins.length}</div><div class="rm-l">Check-ins</div></div>
    <div class="report-metric"><div class="rm-n">${avgU}</div><div class="rm-l">Avg urge</div></div>
    <div class="report-metric"><div class="rm-n" style="font-size:15px;color:${liveRisk === 'high' ? 'var(--r500)' : liveRisk === 'mid' ? 'var(--a500)' : 'var(--g700)'}">${liveRisk === 'high' ? 'High' : liveRisk === 'mid' ? 'Moderate' : 'Low'}</div><div class="rm-l">Risk</div></div>
  </div>
  <div class="divider"></div>
  <div class="report-text">${finalText}</div>
  <div class="clin-disclaimer">⚠️ This AI-generated report is a clinical decision-support tool and must be reviewed by a licensed clinician before use in treatment decisions. Recovery Compass does not replace professional medical judgment. Substance use disorder records may be protected under 42 CFR Part 2.</div>
</div>`;
  } catch (e) {
    if (area) area.innerHTML = '<div class="card-red card-sm">Could not generate report. Please check your connection.</div>';
  }
  if (btn) btn.disabled = false;
}

export async function facTab(name, el) {
  if (name === 'dash') {
    await loadFacilityPatients();
    renderFacPts();
    renderFacAlerts();
  }
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.fac-nav-btn').forEach(b => b.classList.remove('active'));
  const ft = $(`ft-${name}`);
  if (ft) ft.classList.add('active');
  if (el) el.classList.add('active');
}
