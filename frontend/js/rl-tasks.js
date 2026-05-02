import { S, save } from './state.js';
import { $, toast, showModal, hideModal, streak } from './utils.js';
import { MOOD_VALS } from './constants.js';
import { renderHome } from './patient.js';

export function completeRlTask(taskId, rowElement) {
  const checkEl = rowElement.querySelector('.task-check');
  const labelEl = rowElement.querySelector('.task-label');

  if (checkEl.classList.contains('done')) {
    toast('Task already completed!');
    return;
  }

  const lastCheckin = S.checkins.length > 0 ? S.checkins[S.checkins.length - 1] : null;
  const prevUrge = lastCheckin ? lastCheckin.urge : 5;
  const currentMood = lastCheckin ? (MOOD_VALS[lastCheckin.mood] || 3) : 3;

  // Trigger Urge Check Modal
  showModal("Task Follow-up", `
<p style="margin-bottom: 12px; color: var(--text-mid);">Awesome job! Let's see if that helped. What is your urge level <strong>right now</strong> (0-10)?</p>
<div class="slider-row" style="margin-bottom: 16px;">
  <input type="range" id="modal-urge-sl" min="0" max="10" value="${prevUrge}" oninput="document.getElementById('modal-urge-val').textContent=this.value">
  <span class="slider-val" id="modal-urge-val">${prevUrge}</span>
</div>
<button class="btn btn-green" onclick="RC.submitRlTaskFeedback('${taskId}', ${prevUrge}, ${currentMood}, ${streak()})">Submit & Earn XP</button>
`);
}

export function submitRlTaskFeedback(taskId, prevUrge, mood, userStreak) {
  const sl = $('modal-urge-sl');
  const nextUrge = sl ? parseInt(sl.value) : prevUrge;

  fetch('/complete-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_id: taskId,
      completed: true,
      prev_urge: prevUrge,
      next_urge: nextUrge,
      mood: mood,
      streak: userStreak,
      user_id: S.user_id || null,
      addiction_type: S.profile?.addictions?.[0] || null
    })
  })
    .then(res => res.json())
    .then(data => {
      console.log("Model updated:", data);
      hideModal();

      // Update UI visually
      const rows = document.querySelectorAll('#task-list .task-row');
      rows.forEach(row => {
        if (row.getAttribute('onclick')?.includes(taskId)) {
          row.querySelector('.task-check')?.classList.add('done');
          row.querySelector('.task-label')?.classList.add('done');
        }
      });

      // Push an auto-checkin to reflect updated urge/mood in the facility portal
      const moodStr = Object.keys(MOOD_VALS).find(k => MOOD_VALS[k] === mood) || 'ok';
      S.checkins.push({
        date: new Date().toISOString(),
        mood: moodStr,
        urge: nextUrge,
        triggers: ['AI Task Completion'],
        coping: ['Completed Task']
      });

      // Award XP
      S.xp += 15;
      save();
      toast('✅ Task Completed! Model trained. +15 XP', 'green', 4000);
      renderHome(); // Refresh XP bar
    })
    .catch(err => {
      console.error(err);
      toast('Failed to save completion feedback.', 'red');
    });
}

export function addClinicianRow() {
  const container = $('clin-task-rows');
  if(!container) return;
  const entry = document.createElement('div');
  entry.className = 'clin-task-entry card-sm mb-8';
  entry.style.padding = '12px';
  entry.innerHTML = `
<div class="row-2 mb-8">
  <div class="field" style="margin:0"><label class="field-label">Condition / Trigger</label><input class="field-input clin-trigger" placeholder="e.g. craving for alcohol"></div>
  <div class="field" style="margin:0"><label class="field-label">Task type</label><select class="field-input clin-type"><option value="do">Do (action)</option><option value="avoid">Avoid (warning)</option></select></div>
</div>
<div class="field mb-8"><label class="field-label">Actionable task</label><input class="field-input clin-action" placeholder="e.g. Call sponsor immediately"></div>
<div class="row-3">
  <div class="field" style="margin:0"><label class="field-label">Difficulty</label><select class="field-input clin-diff"><option>Low</option><option selected>Medium</option><option>High</option></select></div>
  <div class="field" style="margin:0"><label class="field-label">Priority (1-5)</label><input class="field-input clin-priority" type="number" min="1" max="5" value="3"></div>
  <div class="field" style="margin:0"><label class="field-label">Addiction</label><input class="field-input clin-addiction" placeholder="alcohol"></div>
</div>`;
  container.appendChild(entry);
}

export async function uploadClinicianTasks() {
  const sel = $('clin-upload-sel');
  const userId = sel ? sel.value : null;
  if (!userId) { toast('Select a patient first'); return; }
  const clinNameInput = $('clin-name');
  const clinName = (clinNameInput ? clinNameInput.value.trim() : '') || 'Unknown Clinician';
  const entries = document.querySelectorAll('.clin-task-entry');
  const tasks = [];
  entries.forEach(entry => {
    const trigger = entry.querySelector('.clin-trigger')?.value.trim();
    const action = entry.querySelector('.clin-action')?.value.trim();
    if (trigger && action) {
      tasks.push({
        condition_trigger: trigger,
        actionable_task: action,
        task_type: entry.querySelector('.clin-type')?.value || 'do',
        difficulty: entry.querySelector('.clin-diff')?.value || 'Medium',
        priority: parseInt(entry.querySelector('.clin-priority')?.value) || 3,
        addiction_type: entry.querySelector('.clin-addiction')?.value.trim() || null
      });
    }
  });
  if (!tasks.length) { toast('Fill in at least one task'); return; }

  const resultDiv = $('clin-upload-result');
  if(resultDiv) resultDiv.innerHTML = '<div class="ai-gen-row"><div class="dot-loader"><span></span><span></span><span></span></div><span>Uploading tasks...</span></div>';

  try {
    const resp = await fetch('/clinician/upload-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, clinician_name: clinName, tasks })
    });
    const data = await resp.json();
    if (data.status === 'success') {
      if(resultDiv) resultDiv.innerHTML = `<div class="card-teal card-sm"><strong>Uploaded ${data.tasks_created} task(s)</strong> for this patient. They will see these in their daily recommendations.</div>`;
      toast('Clinician tasks uploaded successfully!');
    } else {
      if(resultDiv) resultDiv.innerHTML = `<div class="card-red card-sm">${data.detail || 'Upload failed. User must be premium.'}</div>`;
    }
  } catch (e) {
    if(resultDiv) resultDiv.innerHTML = '<div class="card-red card-sm">Failed to connect to backend. Ensure the Python server is running.</div>';
  }
}
