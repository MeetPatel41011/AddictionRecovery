// WARNING: Never hardcode API keys in the frontend! The API call should be routed through your backend server to protect the key.
export const API = '/api/chat'; // Placeholder: Please update your backend to handle this endpoint
export const MODEL = 'gemini-flash-latest';

export const ADDICTION_NAMES = {
  alcohol: 'Alcohol', opioids: 'Opioids', cannabis: 'Cannabis',
  nicotine: 'Nicotine/Vaping', stimulants: 'Stimulants (Cocaine/Meth)',
  benzos: 'Benzos/Sedatives', hallucinogens: 'Hallucinogens', inhalants: 'Inhalants',
  gambling: 'Gambling', gaming: 'Gaming', shopping: 'Shopping', food: 'Food/Binge Eating',
  sex: 'Sex/Pornography', social_media: 'Social Media', exercise: 'Compulsive Exercise', other: 'Other'
};

export const QUOTES = [
  'Recovery is not a race. You don\'t have to feel guilty if it takes time.',
  'One day at a time — that\'s all we need to focus on.',
  'You are stronger than your cravings. You\'ve already proved it.',
  'Every moment is a fresh chance to begin again.',
  'Progress, not perfection.',
  'You didn\'t come this far only to come this far.',
  'Healing is not linear, but it is always possible.',
  'The bravest thing you can do is keep going.',
  'Your struggle is part of your story, not the end of it.',
  'Be gentle with yourself. You\'re doing the best you can.',
  'Recovery is something you have to work for every day.',
  'You deserve a life free from what\'s been holding you back.',
];

export const PROMPTS = [
  'What is one small win I had this week, no matter how tiny?',
  'What triggers did I notice today, and how did I respond to them?',
  'What does my life look like one year from now if I stay on this path?',
  'Who in my life supports my recovery? How can I lean on them more?',
  'What emotion was I trying to avoid when I felt the urge today?',
  'Describe a moment recently when I felt genuinely proud of myself.',
  'What coping strategy helped me most this week and why?',
  'Write a letter to my future self, one year into recovery.',
  'What belief about myself has my addiction reinforced — and is it actually true?',
  'What activities bring me real joy that don\'t involve my addiction?',
  'Describe my deepest reason for wanting to recover.',
  'What would I tell a close friend going through exactly what I\'m going through?',
];

export const BADGES = [
  { id: 'first_ci', ico: '🌱', name: 'First Step', desc: 'Complete first check-in', xp: 30 },
  { id: 'first_j', ico: '📓', name: 'Open Book', desc: 'Write first journal entry', xp: 30 },
  { id: 'first_chat', ico: '🤖', name: 'Seeking Wisdom', desc: 'First AI coach session', xp: 30 },
  { id: 'day_3', ico: '✨', name: 'Three Days', desc: '3-day clean streak', xp: 50 },
  { id: 'day_7', ico: '⭐', name: 'One Week', desc: '7-day clean streak', xp: 100 },
  { id: 'day_14', ico: '🌟', name: 'Fortnight', desc: '14-day clean streak', xp: 150 },
  { id: 'day_30', ico: '🏆', name: 'One Month', desc: '30-day clean streak', xp: 300 },
  { id: 'day_90', ico: '💎', name: 'Three Months', desc: '90-day clean streak', xp: 500 },
  { id: 'day_180', ico: '👑', name: 'Half a Year', desc: '180-day clean streak', xp: 700 },
  { id: 'day_365', ico: '🎊', name: 'One Full Year', desc: '365-day clean streak', xp: 1000 },
  { id: 'ci_10', ico: '✅', name: 'Consistent', desc: '10 total check-ins', xp: 60 },
  { id: 'ci_30', ico: '🔥', name: 'Dedicated', desc: '30 total check-ins', xp: 150 },
  { id: 'j_10', ico: '🪞', name: 'Reflective', desc: '10 journal entries', xp: 80 },
  { id: 'coping_5', ico: '🛡️', name: 'Coping Master', desc: 'Used coping 5+ times', xp: 60 },
  { id: 'linked', ico: '🏥', name: 'Supported', desc: 'Linked to a clinic', xp: 50 },
  { id: 'has_plan', ico: '🗺️', name: 'On Track', desc: 'Active treatment plan', xp: 100 },
];

export const LEVELS = [
  { name: 'Seedling 🌱', min: 0, max: 100 }, { name: 'Sprout 🌿', min: 100, max: 300 },
  { name: 'Sapling 🌳', min: 300, max: 600 }, { name: 'Tree 🌲', min: 600, max: 1000 },
  { name: 'Forest 🌲🌲', min: 1000, max: 2000 }, { name: 'Guardian 🌍', min: 2000, max: Infinity }
];

export const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365];

export const MOOD_VALS = { great: 5, good: 4, ok: 3, hard: 2, crisis: 1 };
export const MOOD_LABELS = { great: 'Great 😊', good: 'Good 🙂', ok: 'Okay 😐', hard: 'Hard 😔', crisis: 'Crisis 😰' };
export const MOOD_CLASSES = { great: 'mt-great', good: 'mt-good', ok: 'mt-ok', hard: 'mt-hard', crisis: 'mt-crisis' };
export const URGE_DESC = ['No urge', 'Minimal', 'Very low', 'Low', 'Moderate', 'Noticeable', 'Moderate-high', 'High', 'Very high', 'Severe', 'Overwhelming'];

export const AV_COLORS = [
  ['#e4f5ec', '#0f6b38'], ['#deeef9', '#163f66'], ['#fef0d0', '#8a5000'],
  ['#ede9f9', '#4a2d9a'], ['#fde8e5', '#a83020'], ['#e8f5ee', '#2d7a5e']
];
