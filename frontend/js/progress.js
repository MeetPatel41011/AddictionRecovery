import { S, save } from './state.js';
import { $, qs, daysSince, streak, toast, fmtDate, todayStr, avgMood, avgUrge, getLevel } from './utils.js';
import { BADGES, MOOD_VALS, API, MODEL, ADDICTION_NAMES } from './constants.js';

export function setPeriod(p, el) {
  S.period = p;
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderCharts();
}

export function renderCharts() {
  const days = S.period === 'week' ? 7 : 30;
  const labels = [], moodData = [], urgeData = [];
  const copingMap = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    labels.push(days === 7 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : d.getDate() + '');
    const ci = S.checkins.find(c => c.date === ds);
    moodData.push(ci ? (MOOD_VALS[ci.mood] || 3) : null);
    urgeData.push(ci ? ci.urge : null);
    if (ci) ci.coping.forEach(c => copingMap[c] = (copingMap[c] || 0) + 1);
  }

  const makeChart = (id, data, color, label, min, max, yLabels, prev) => {
    if (prev) prev.destroy();
    const cvs = $(id);
    if(!cvs) return null;
    const ctx = cvs.getContext('2d');
    if (!ctx) return null;
    return new window.Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + '18', fill: true, tension: .45, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: color, spanGaps: true, label }] },
      options: {
        responsive: true, interaction: { mode: 'nearest', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: v => yLabels ? yLabels[v.raw] || v.raw : v.raw } } },
        scales: { y: { min, max, ticks: { stepSize: yLabels ? 1 : 2, callback: v => yLabels ? yLabels[v] || v : v }, grid: { color: 'rgba(0,0,0,.04)' } }, x: { grid: { display: false } } }
      }
    });
  };

  S.moodChart = makeChart('mood-chart', moodData, '#2d7a5e', 'Mood', 1, 5, { 1: 'Crisis', 2: 'Hard', 3: 'Okay', 4: 'Good', 5: 'Great' }, S.moodChart);
  S.urgeChart = makeChart('urge-chart', urgeData, '#d4850a', 'Urge', 0, 10, null, S.urgeChart);

  // Coping bar chart
  if (S.copingChartInst) S.copingChartInst.destroy();
  const cCvs = $('coping-chart');
  const copingCtx = cCvs ? cCvs.getContext('2d') : null;
  if (copingCtx && Object.keys(copingMap).length) {
    const sorted = Object.entries(copingMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    S.copingChartInst = new window.Chart(copingCtx, {
      type: 'bar',
      data: { labels: sorted.map(e => e[0]), datasets: [{ data: sorted.map(e => e[1]), backgroundColor: '#2d7a5e44', borderColor: '#2d7a5e', borderWidth: 2, borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,.04)' } }, y: { grid: { display: false } } } }
    });
  } else if (copingCtx) {
    S.copingChartInst = new window.Chart(copingCtx, {
      type: 'bar', data: { labels: ['No data yet'], datasets: [{ data: [0], backgroundColor: '#e0d9cf' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }
}

export function checkBadges(days, str) {
  const ms = { 3: 'day_3', 7: 'day_7', 14: 'day_14', 30: 'day_30', 90: 'day_90', 180: 'day_180', 365: 'day_365' };
  Object.entries(ms).forEach(([d, id]) => { if (str >= parseInt(d)) awardBadge(id, false); });
  if (S.checkins.length >= 1) awardBadge('first_ci', false);
  if (S.journal.length >= 1) awardBadge('first_j', false);
  if (S.checkins.length >= 10) awardBadge('ci_10', false);
  if (S.checkins.length >= 30) awardBadge('ci_30', false);
  if (S.journal.length >= 10) awardBadge('j_10', false);
  if ((S.copingCount || 0) >= 5) awardBadge('coping_5', false);
  if (S.profile?.code === 'CLINIC001') awardBadge('linked', false);
  if (S.tplans[S.profile?.code + '_' + S.profile?.name]) awardBadge('has_plan', false);
}

export async function awardBadge(id, announce = true) {
  if (!S.badges) S.badges = [];
  if (S.badges.includes(id)) return;
  const b = BADGES.find(x => x.id === id);
  if (!b) return;
  S.badges.push(id);
  S.xp = (S.xp || 0) + b.xp;
  await save();
  if (announce) toast(`${b.ico} Badge: ${b.name}! +${b.xp} XP`, 'amber', 4000);
  renderBadges();
  if (window.RC && window.RC.renderHome) window.RC.renderHome();
}

export function renderBadges() {
  const earned = S.badges || [];
  const bg = $('badge-grid');
  if(!bg) return;
  bg.innerHTML = BADGES.map(b => {
    const has = earned.includes(b.id);
    return `<div class="badge-cell ${has ? 'earned' : 'locked'}" title="${b.desc}">
  <span class="badge-ico">${b.ico}</span>
  <div class="badge-name">${b.name}</div>
  <div class="badge-desc">${b.desc}</div>
  <div class="badge-xp">${has ? '✓ +' + b.xp + ' XP' : 'Locked'}</div>
</div>`;
  }).join('');
}

export async function genPatientReport() {
  const area = $('patient-report');
  if(!area) return;
  area.innerHTML = '<div class="ai-gen-row"><div class="dot-loader"><span></span><span></span><span></span></div><span>Generating your progress report...</span></div>';
  const btn = qs('#tp-progress .btn-ghost');
  if (btn) btn.disabled = true;
  const p = S.profile || {};
  const days = daysSince(p.startDate);
  const str = streak();
  const checkins = S.checkins || [];
  const journal = S.journal || [];
  const badges = S.badges || [];
  const addictions = p.addictions || [];
  const prompt = `Write a warm, personalized recovery progress report for ${p.name || '-'}. Data: ${days} days since starting, ${str}-day current streak, ${checkins.length} total check-ins, ${journal.length} journal entries, ${badges.length} badges earned, average mood ${avgMood([...checkins, ...journal])}/5, average urge ${avgUrge(checkins)}/10. Tracking: ${addictions.length ? addictions.map(a => ADDICTION_NAMES[a] || a).join(', ') : '-'}. Goal: ${p.goal || '-'}. Recent moods (last 5): ${checkins.slice(-5).map(c => c.mood).join(', ') || '-'}. Format in 4 sections with headers: Progress Summary, What's Working, Areas to Watch, This Week's Focus. Total ~220 words. Warm, personal, encouraging tone.`;
  try {
    const resp = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) });
    let d;
    try { d = await resp.json(); } catch (e) {}
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text && !resp.ok) throw new Error(`Status ${resp.status}`);
    const finalText = text || 'Unable to generate report.';
    area.innerHTML = `<div class="report-block">
  <div style="font-family:'Lora',serif;font-size:18px;font-weight:600;color:var(--g800);margin-bottom:4px">📄 Your Progress Report</div>
  <div class="report-meta">Generated ${fmtDate(todayStr())} · ${getLevel(S.xp).name}</div>
  <div class="report-metrics">
    <div class="report-metric"><div class="rm-n">${days}</div><div class="rm-l">Days</div></div>
    <div class="report-metric"><div class="rm-n">${str}</div><div class="rm-l">Streak</div></div>
    <div class="report-metric"><div class="rm-n">${checkins.length}</div><div class="rm-l">Check-ins</div></div>
    <div class="report-metric"><div class="rm-n">${badges.length}</div><div class="rm-l">Badges</div></div>
  </div>
  <div class="report-text">${finalText}</div>
</div>`;
  } catch (e) {
    area.innerHTML = `<div class="card-red card-sm" style="word-break:break-all"><b>Error:</b> ${e.message || e}<br>Please check your connection and try again.</div>`;
  }
  if (btn) btn.disabled = false;
}
