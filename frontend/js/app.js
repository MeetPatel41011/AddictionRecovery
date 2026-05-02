import { S, load, syncToServer } from './state.js';
import { $ } from './utils.js';
import { initLanding, startPatient, goFacilityLogin, obBack, obNext, pill, toggleA, radio, showPatLogin, patientLogin } from './onboarding.js';
import { verifyOTP, resendOTP, initOTPInputs, showOTP } from './otp.js';
import { checkApprovalStatus } from './approvals.js';
import { facilityLogin, showFacRegister, facilityRegister, viewPt, filterPts, facTab, showAddPatient, addPatient, loadTP, saveTP, addGoal, toggleGoal, delGoal, loadRepPt, genFacReport } from './facility.js';
import { loadPendingUsers, approveUser, rejectUser, showPendingScreen } from './approvals.js';
import { tab, moodCI, urgeUpdate, toggleChip, saveCI, renderHome, loadMyCare } from './patient.js';
import { shufflePrompt, moodJ, saveJournal, viewEntry } from './journal.js';
import { sendChat, quickChat } from './coach.js';
import { setPeriod, genPatientReport } from './progress.js';
import { completeRlTask, submitRlTaskFeedback, addClinicianRow, uploadClinicianTasks } from './rl-tasks.js';
import { show, showModal, hideModal } from './utils.js';

export async function init() {
  await load();
  initLanding();
  attachEvents();
  initOTPInputs();

  // Sync patient data to server on load (so facility gets latest)
  syncToServer();

  // If user was pending, show pending screen on reload
  if (S.profile && S.user_id && S.profile.code) {
    try {
      const resp = await fetch(`/user/status/${S.user_id}`);
      const data = await resp.json();
      if (data.status === 'pending') {
        showPendingScreen();
        return;
      }
    } catch (e) {
      // Offline — just show landing
    }
  }
}

function attachEvents() {
  const ci = $('chat-input');
  if(ci) {
    ci.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    ci.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }
  const sl = $('urge-sl');
  if(sl) sl.addEventListener('input', urgeUpdate);
}

// Assemble window.RC (The entry point)
window.RC = {
  init,
  // landing
  startPatient, goFacilityLogin,
  // onboarding
  obBack, obNext, pill, toggleA, radio,
  // patient auth
  showPatLogin, patientLogin,
  // patient
  tab, renderHome, showSOS: () => { const so = $('sos-overlay'); if(so) so.classList.remove('hidden'); }, 
  hideSOS: () => { const so = $('sos-overlay'); if(so) so.classList.add('hidden'); },
  moodCI, urgeUpdate, toggleChip, saveCI, loadMyCare,
  // journal
  shufflePrompt, moodJ, saveJournal, viewEntry,
  // coach
  sendChat, quickChat,
  // progress
  setPeriod, genPatientReport,
  // OTP
  verifyOTP, resendOTP,
  // pending
  checkApprovalStatus,
  // facility
  facilityLogin, showFacRegister, facilityRegister, viewPt, filterPts, facTab, showAddPatient, addPatient,
  loadTP, saveTP, addGoal, toggleGoal, delGoal, loadRepPt, genFacReport,
  // facility approvals
  loadPendingUsers, approveUser, rejectUser,
  // clinician upload
  addClinicianRow, uploadClinicianTasks,
  // utils
  show, showModal, hideModal,
  // RL
  completeRlTask, submitRlTaskFeedback,
};

document.addEventListener('DOMContentLoaded', () => window.RC.init());
