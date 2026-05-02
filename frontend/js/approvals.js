import { S } from './state.js';
import { $, show, toast, fmtDate, initials, avatarColors } from './utils.js';
import { initPatientApp } from './patient.js';
import { scheduleNotifs } from './patient.js';
import { loadFacilityPatients, renderFacPts, populatePtSelects } from './facility.js';

export function showPendingScreen() {
  const n = $('pending-name');
  if(n) n.textContent = S.profile?.name || '\u2014';
  const f = $('pending-facility');
  if(f) f.textContent = S.profile?.code || '\u2014';
  const badge = $('pending-badge');
  if (badge) {
    badge.textContent = '\u23f3 Pending';
    badge.className = 'psr-badge psr-pending';
  }
  show('s-pending');

  // Start auto-polling every 10 seconds
  if (S.pendingPollTimer) clearInterval(S.pendingPollTimer);
  S.pendingPollTimer = setInterval(() => checkApprovalStatus(true), 10000);
}

export async function checkApprovalStatus(silent = false) {
  if (!S.user_id) {
    if (!silent) toast('No user ID found. Try signing up again.');
    return;
  }

  const btn = $('pending-check-btn');
  if (btn && !silent) { btn.disabled = true; btn.textContent = 'Checking...'; }

  try {
    const resp = await fetch(`/user/status/${S.user_id}`);
    const data = await resp.json();
    const badge = $('pending-badge');

    if (data.status === 'active') {
      if(badge) {
        badge.textContent = '\u2705 Approved!';
        badge.className = 'psr-badge psr-active';
      }
      if (S.pendingPollTimer) { clearInterval(S.pendingPollTimer); S.pendingPollTimer = null; }
      toast('\ud83c\udf89 Your account has been approved!', '', 4000);
      setTimeout(() => {
        show('s-patient');
        initPatientApp();
        scheduleNotifs();
      }, 1500);
    } else if (data.status === 'rejected') {
      if(badge) {
        badge.textContent = '\u274c Rejected';
        badge.className = 'psr-badge psr-rejected';
      }
      if (S.pendingPollTimer) { clearInterval(S.pendingPollTimer); S.pendingPollTimer = null; }
      if (!silent) toast('Your application was not approved. Please contact your clinic.', 'red', 5000);
    } else {
      if(badge) {
        badge.textContent = '\u23f3 Pending';
        badge.className = 'psr-badge psr-pending';
      }
      if (!silent) toast('Still waiting for facility approval...', '', 3000);
    }
  } catch (e) {
    console.warn('Status check failed:', e);
    if (!silent) toast('Could not check status. Server may be offline.', 'red');
  }

  if (btn) { btn.disabled = false; btn.textContent = '\ud83d\udd04 Check Status'; }
}

export async function loadPendingUsers() {
  const code = S.facCode || 'CLINIC001';
  const list = $('approval-list');
  if (!list) return;

  list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">Loading pending requests...</div>';

  try {
    const resp = await fetch(`/facility/pending-users/${code}`);
    const data = await resp.json();
    const users = data.users || [];

    // Update badge counts
    const countBadge = $('approval-count');
    const navBadge = $('nav-approval-badge');
    if (users.length > 0) {
      if (countBadge) { countBadge.textContent = users.length; countBadge.classList.remove('hidden'); }
      if (navBadge) { navBadge.textContent = users.length; navBadge.classList.remove('hidden'); }
    } else {
      if (countBadge) countBadge.classList.add('hidden');
      if (navBadge) navBadge.classList.add('hidden');
    }

    if (!users.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-ico">\u2705</div><h3>All clear!</h3><p>No pending approval requests at this time.</p></div>';
      return;
    }

    list.innerHTML = users.map(u => {
      const [bg, fg] = avatarColors(u.name || 'U');
      const addictions = (u.addiction_types || []).join(', ') || 'Not specified';
      const dob = u.dob ? fmtDate(u.dob) : 'Not provided';
      const created = u.created_at ? fmtDate(u.created_at) : 'Unknown';
      return `
    <div class="approval-card" id="approval-${u.id}">
      <div class="approval-top">
        <div class="approval-ava" style="background:${bg};color:${fg}">${initials(u.name || 'U')}</div>
        <div class="approval-info">
          <div class="approval-name">${u.name}</div>
          <div class="approval-meta">Requested ${created}</div>
        </div>
        <span class="psr-badge psr-pending">\u23f3 Pending</span>
      </div>
      <div class="approval-details">
        <div class="approval-detail-row"><span class="adl">Date of Birth</span><span class="adv">${dob}</span></div>
        <div class="approval-detail-row"><span class="adl">Addictions</span><span class="adv">${addictions}</span></div>
        <div class="approval-detail-row"><span class="adl">Facility Code</span><span class="adv">${u.facility_code || '\u2014'}</span></div>
      </div>
      <div class="approval-actions">
        <button class="btn btn-green btn-sm" onclick="RC.approveUser('${u.id}')" id="approve-btn-${u.id}">\u2705 Approve</button>
        <button class="btn btn-danger btn-sm" onclick="RC.rejectUser('${u.id}')" id="reject-btn-${u.id}">\u274c Reject</button>
      </div>
    </div>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load pending users:', e);
    list.innerHTML = '<div class="card-red card-sm">Failed to connect to server. Ensure the backend is running.</div>';
  }
}

export async function approveUser(userId) {
  const btn = $(`approve-btn-${userId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Approving...'; }
  try {
    const resp = await fetch(`/facility/approve/${userId}`, { method: 'POST' });
    const data = await resp.json();
    if (data.status === 'success') {
      toast(`\u2705 ${data.message}`, '', 3000);
      // Animate card removal
      const card = $(`approval-${userId}`);
      if (card) { card.style.transition = 'opacity .4s, transform .4s'; card.style.opacity = '0'; card.style.transform = 'translateX(60px)'; }
      setTimeout(() => {
        loadPendingUsers();
        loadFacilityPatients().then(() => {
          renderFacPts();
          populatePtSelects();
        });
      }, 500);
    } else {
      toast(data.detail || 'Approval failed', 'red');
      if (btn) { btn.disabled = false; btn.textContent = '\u2705 Approve'; }
    }
  } catch (e) {
    toast('Server error. Try again.', 'red');
    if (btn) { btn.disabled = false; btn.textContent = '\u2705 Approve'; }
  }
}

export async function rejectUser(userId) {
  if (!confirm('Are you sure you want to reject this patient?')) return;
  const btn = $(`reject-btn-${userId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting...'; }
  try {
    const resp = await fetch(`/facility/reject/${userId}`, { method: 'POST' });
    const data = await resp.json();
    if (data.status === 'success') {
      toast(`${data.message}`, 'amber', 3000);
      const card = $(`approval-${userId}`);
      if (card) { card.style.transition = 'opacity .4s, transform .4s'; card.style.opacity = '0'; card.style.transform = 'translateX(-60px)'; }
      setTimeout(() => loadPendingUsers(), 500);
    } else {
      toast(data.detail || 'Rejection failed', 'red');
      if (btn) { btn.disabled = false; btn.textContent = '\u274c Reject'; }
    }
  } catch (e) {
    toast('Server error. Try again.', 'red');
    if (btn) { btn.disabled = false; btn.textContent = '\u274c Reject'; }
  }
}
