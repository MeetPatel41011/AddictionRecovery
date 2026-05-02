import { S, save } from './state.js';
import { $, toast, fmtDate, todayStr } from './utils.js';
import { awardBadge } from './progress.js';
import { PROMPTS, MOOD_CLASSES, MOOD_LABELS } from './constants.js';

export function shufflePrompt() {
  const p = $('jp-text');
  if(p) p.textContent = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

export function moodJ(el) {
  S.moodJ = el.dataset.m;
  document.querySelectorAll('#tp-journal .mood-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

export async function saveJournal() {
  const jt = $('j-text');
  const text = jt ? jt.value.trim() : '';
  if (!text) { toast('Write something first 📝'); return; }
  S.journal.push({
    date: todayStr(), mood: S.moodJ || 'ok',
    text, prompt: $('jp-text')?.textContent || '',
    ts: new Date().toISOString()
  });
  S.xp += 15;
  await save();
  await awardBadge('first_j');
  if (S.journal.length >= 10) await awardBadge('j_10');
  toast('📓 Journal saved! +15 XP');
  if(jt) jt.value = '';
  S.moodJ = '';
  document.querySelectorAll('#tp-journal .mood-btn').forEach(b => b.classList.remove('on'));
  renderJournal();
  if (window.RC && window.RC.renderHome) window.RC.renderHome();
}

export function renderJournal() {
  const jp = $('jp-text');
  if(jp && (!jp.textContent || jp.textContent === 'Loading...')) {
    shufflePrompt();
  }

  const entries = [...S.journal].reverse();
  const jl = $('journal-list');
  if(!jl) return;
  if (!entries.length) {
    jl.innerHTML = `<div class="empty-state"><div class="empty-ico">📓</div><h3>No entries yet</h3><p>Your first journal entry is waiting for you above.</p></div>`;
    return;
  }
  jl.innerHTML = entries.map((e, i) => `
<div class="j-entry" onclick="RC.viewEntry(${S.journal.length - 1 - i})" style="cursor:pointer">
  <div class="j-entry-head">
    <span class="j-date">${fmtDate(e.date)}</span>
    <span class="mood-tag ${MOOD_CLASSES[e.mood] || 'mt-ok'}">${MOOD_LABELS[e.mood] || 'Okay'}</span>
  </div>
  <div class="j-preview">${e.text}</div>
</div>`).join('');
}

export function viewEntry(idx) {
  const e = S.journal[idx];
  if (!e) return;
  const oc = $('j-overlay-content');
  if(oc) oc.innerHTML = `
<div class="flex items-center justify-between mb-16">
  <span class="j-date" style="font-size:14px">${fmtDate(e.date)}</span>
  <span class="mood-tag ${MOOD_CLASSES[e.mood] || 'mt-ok'}">${MOOD_LABELS[e.mood] || 'Okay'}</span>
</div>
${e.prompt ? `<div style="font-family:'Lora',serif;font-style:italic;font-size:14px;color:var(--g700);background:var(--g50);padding:12px 14px;border-radius:var(--r12);margin-bottom:14px;border-left:3px solid var(--g400)">${e.prompt}</div>` : ''}
<div style="font-size:15px;line-height:1.8;color:var(--text-mid);white-space:pre-wrap">${e.text}</div>
`;
  const jo = $('j-overlay');
  if(jo) jo.classList.remove('hidden');
}
