import { S, save } from './state.js';
import { $, todayStr, toast, daysSince, streak, getLevel } from './utils.js';
import { API, MODEL, ADDICTION_NAMES } from './constants.js';
import { awardBadge } from './progress.js';

export function initChat() {
  const msgs = $('chat-msgs');
  if(!msgs) return;
  if (!S.chatHistory.length) {
    msgs.innerHTML = `<div class="chat-msg cm-ai">Hi ${S.profile?.name?.split(' ')[0] || 'there'} 👋 I'm your AI recovery coach — I've read your profile and I'm here to support your journey. Ask me anything, share how you're feeling, or just vent. I'm listening.</div>`;
  } else {
    msgs.innerHTML = S.chatHistory.map(m =>
      `<div class="chat-msg ${m.role === 'user' ? 'cm-user' : 'cm-ai'}">${m.content.replace(/\n/g, '<br>')}</div>`
    ).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }
  updateChatLimit();
}

export function updateChatLimit() {
  const today = todayStr();
  const used = (S.chatSessions || []).filter(d => d === today).length;
  const lim = $('coach-limit');
  if(lim) lim.textContent = `${Math.max(0, 5 - used)} of 5 daily sessions remaining`;
}

export function quickChat(msg) {
  const ci = $('chat-input');
  if(ci) ci.value = msg;
  sendChat();
}

export function buildSysPrompt() {
  const p = S.profile;
  const days = daysSince(p.startDate);
  const str = streak();
  const lvl = getLevel(S.xp).name;
  const recent = S.checkins.slice(-7);
  const jRecent = S.journal.slice(-3);
  return `You are a compassionate, evidence-based addiction recovery coach trained in CBT, Motivational Enhancement Therapy, Contingency Management, and Urge Surfing. You are speaking with ${p.name}, age ${p.age}${p.gender ? ', ' + p.gender : ''}.

=== PATIENT PROFILE ===
Addictions tracked: ${p.addictions.map(a => ADDICTION_NAMES[a] || a).join(', ')}
Primary goal: ${p.goal === 'abstinence' ? 'Complete abstinence' : p.goal === 'reduce' ? 'Reduce use significantly' : 'Gain control over use'}
Personal motivation: "${p.why || 'Not specified'}"
Days since start: ${days} | Current streak: ${str} days
XP level: ${lvl} (${S.xp} XP)

=== ASSESSMENT (ASAM-style) ===
Craving/withdrawal severity: ${p.assessment?.wd || '?'}/10
Daily life impact: ${p.assessment?.impact || '?'}
Mental health co-occurrence: ${p.assessment?.mental || '?'}
Prior quit attempts: ${p.assessment?.att || '?'}
Support environment: ${p.assessment?.sup || '?'}
Motivation score: ${p.assessment?.mot || '?'}/10

=== RECENT CHECK-INS (last 7) ===
${recent.map(c => `• ${c.date}: mood=${c.mood}, urge=${c.urge}/10, triggers=[${c.triggers.join(', ') || 'none'}], coping=[${c.coping.join(', ') || 'none'}]`).join('\n') || 'No check-ins yet'}

=== RECENT JOURNAL ENTRIES (last 3) ===
${jRecent.map(j => `• ${j.date} (${j.mood}): "${j.text.slice(0, 180)}..."`).join('\n') || 'No entries yet'}

=== COACHING GUIDELINES ===
- Be warm, genuine, non-judgmental, and humanizing
- Naturally weave CBT techniques: trigger identification, thought records, cognitive restructuring, behavioral activation
- Use Motivational Interviewing language: affirmations, reflective listening, evocation
- Keep responses focused, under 140 words unless depth is truly needed
- Celebrate progress sincerely without being sycophantic
- If the user mentions crisis, suicidal thoughts, or self-harm: IMMEDIATELY provide 988 (Suicide & Crisis Lifeline) and SAMHSA at 1-800-662-4357 before anything else
- Never recommend specific medications — always defer to healthcare providers
- Never diagnose — you're a supportive coach, not a clinician
- Use their actual check-in and journal data to make responses feel personal`;
}

export async function sendChat() {
  const input = $('chat-input');
  if(!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  const today = todayStr();
  const used = (S.chatSessions || []).filter(d => d === today).length;
  if (used >= 10) { toast('Daily session limit reached (10/day). Check back tomorrow!', ''); return; }
  input.value = '';
  input.style.height = 'auto';
  const msgs = $('chat-msgs');
  if(!msgs) return;
  msgs.innerHTML += `<div class="chat-msg cm-user">${msg.replace(/\n/g, '<br>')}</div>`;
  msgs.innerHTML += `<div class="chat-msg cm-ai cm-typing" id="typing-ind"><div class="dot-loader"><span></span><span></span><span></span></div></div>`;
  msgs.scrollTop = msgs.scrollHeight;
  const sendBtn = $('chat-send');
  if(sendBtn) sendBtn.disabled = true;
  const history = [...(S.chatHistory || []), { role: 'user', content: msg }];
  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSysPrompt() }] },
        contents: history.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      })
    });
    const d = await resp.json();
    const reply = d.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here for you. Can you tell me more about what you're experiencing right now?";
    const tind = $('typing-ind');
    if(tind) tind.remove();
    msgs.innerHTML += `<div class="chat-msg cm-ai">${reply.replace(/\n/g, '<br>')}</div>`;
    S.chatHistory = [...history, { role: 'assistant', content: reply }];
    if (S.chatHistory.length > 20) S.chatHistory = S.chatHistory.slice(-20);
    S.chatSessions = [...(S.chatSessions || []), today];
    S.lastChatDate = today;
    S.xp += 5;
    await save();
    if (window.RC && window.RC.renderHome) window.RC.renderHome();
    await awardBadge('first_chat');
    updateChatLimit();
  } catch (e) {
    const tind = $('typing-ind');
    if(tind) tind.remove();
    msgs.innerHTML += `<div class="chat-msg cm-ai">I'm having trouble connecting right now. If you need immediate support, please call 988 or text HOME to 741741.</div>`;
  }
  if(sendBtn) sendBtn.disabled = false;
  msgs.scrollTop = msgs.scrollHeight;
}
