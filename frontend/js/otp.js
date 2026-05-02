import { S } from './state.js';
import { $, toast } from './utils.js';

export function showOTP(context, callback) {
  S.otpCode = String(Math.floor(1000 + Math.random() * 9000));
  S.otpCallback = callback;

  // Show the code via alert and toast (in case alert is blocked)
  try { alert(`Your OTP is: ${S.otpCode}`); } catch(e){}
  toast(`Your OTP is: ${S.otpCode}`, 'blue', 5000);

  // Update subtitle
  const sub = context === 'facility'
    ? 'Enter the 4-digit code to access the Clinic Portal.'
    : 'Enter the 4-digit code to continue.';
  $('otp-sub').textContent = sub;

  // Clear inputs and errors
  for (let i = 1; i <= 4; i++) {
    const d = $(`otp-d${i}`);
    if(d) {
      d.value = '';
      d.classList.remove('error', 'success');
    }
  }
  const err = $('otp-error');
  if(err) err.textContent = '';

  // Show overlay and focus first digit
  const overlay = $('otp-overlay');
  if(overlay) overlay.classList.remove('hidden');
  setTimeout(() => $('otp-d1')?.focus(), 200);
}

export function verifyOTP() {
  const entered = [$('otp-d1'), $('otp-d2'), $('otp-d3'), $('otp-d4')]
    .map(d => d?.value || '').join('');

  if (entered.length < 4) {
    if($('otp-error')) $('otp-error').textContent = 'Please enter all 4 digits';
    return;
  }

  if (entered === S.otpCode) {
    // Success animation
    for (let i = 1; i <= 4; i++) {
      const d = $(`otp-d${i}`);
      if(d) {
        d.classList.add('success');
        d.classList.remove('error');
      }
    }
    if($('otp-error')) $('otp-error').textContent = '';
    toast('\u2705 Verified successfully!', '', 2000);

    setTimeout(() => {
      const overlay = $('otp-overlay');
      if(overlay) overlay.classList.add('hidden');
      if (S.otpCallback) S.otpCallback();
      S.otpCallback = null;
      S.otpCode = '';
    }, 600);
  } else {
    // Error animation
    if($('otp-error')) $('otp-error').textContent = 'Incorrect code. Please try again.';
    for (let i = 1; i <= 4; i++) {
      const d = $(`otp-d${i}`);
      if(d) {
        d.classList.add('error');
        d.classList.remove('success');
        d.value = '';
      }
    }
    setTimeout(() => $('otp-d1')?.focus(), 400);
  }
}

export function resendOTP() {
  S.otpCode = String(Math.floor(1000 + Math.random() * 9000));
  try { alert(`Your new OTP is: ${S.otpCode}`); } catch(e){}
  toast(`Your new OTP is: ${S.otpCode}`, 'blue', 5000);
  for (let i = 1; i <= 4; i++) {
    const d = $(`otp-d${i}`);
    if (d) {
      d.value = '';
      d.classList.remove('error', 'success');
    }
  }
  if($('otp-error')) $('otp-error').textContent = '';
  $('otp-d1')?.focus();
  toast('New OTP sent!', '', 2000);
}

export function initOTPInputs() {
  // Auto-advance digits + backspace support
  for (let i = 1; i <= 4; i++) {
    const d = $(`otp-d${i}`);
    if (!d) continue;
    d.addEventListener('input', (e) => {
      d.classList.remove('error');
      const v = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = v;
      if (v && i < 4) $(`otp-d${i + 1}`)?.focus();
      // Auto-verify when all 4 filled
      if (i === 4 && v) {
        setTimeout(() => verifyOTP(), 150);
      }
    });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !d.value && i > 1) {
        $(`otp-d${i - 1}`)?.focus();
      }
      if (e.key === 'Enter') verifyOTP();
    });
    // Allow paste of full OTP
    d.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '').slice(0, 4);
      for (let j = 0; j < pasted.length && j < 4; j++) {
        const dj = $(`otp-d${j + 1}`);
        if(dj) dj.value = pasted[j];
      }
      if (pasted.length === 4) setTimeout(() => verifyOTP(), 150);
      else if (pasted.length > 0) $(`otp-d${Math.min(pasted.length + 1, 4)}`)?.focus();
    });
  }
}
