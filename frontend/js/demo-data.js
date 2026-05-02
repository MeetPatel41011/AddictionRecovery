export const DEMO_PTS_DATA = [
  {
    id: 'p1', name: 'Marcus R.', age: 34, gender: 'Male',
    addictions: ['alcohol', 'cannabis'], startDate: '2025-02-12', goal: 'abstinence',
    checkins: [
      { date: '2025-03-18', mood: 'hard', urge: 7, triggers: ['Anxiety', 'Loneliness'], coping: ['Called someone'], note: 'Rough evening.' },
      { date: '2025-03-19', mood: 'ok', urge: 5, triggers: ['Stress / Work'], coping: ['Deep breathing'], note: '' },
      { date: '2025-03-20', mood: 'good', urge: 3, triggers: [], coping: ['Exercise', 'Meditation'], note: 'Feeling better.' },
      { date: '2025-03-21', mood: 'ok', urge: 4, triggers: ['Boredom'], coping: ['Journaling'], note: '' },
      { date: '2025-03-22', mood: 'good', urge: 2, triggers: [], coping: ['Exercise'], note: 'Good run today.' },
      { date: '2025-03-23', mood: 'great', urge: 1, triggers: [], coping: ['Meditation'], note: '' },
      { date: '2025-03-24', mood: 'good', urge: 2, triggers: [], coping: ['Deep breathing'], note: 'Steady.' },
    ],
    journal: [
      { date: '2025-03-18', mood: 'hard', text: "Today was one of the hardest days in weeks. The urge hit around 4pm. I called my sponsor and we talked for over an hour — probably what saved the day." },
      { date: '2025-03-20', mood: 'good', text: "Three days without a drink. Went for a 5k run. Felt human again for the first time in a while." },
      { date: '2025-03-23', mood: 'great', text: "40 days sober tomorrow. I never thought I'd see this number. My daughter called today — I actually remembered the conversation." },
    ],
    xp: 520, assessment: { wd: 6, impact: 'moderate', mental: 'sometimes', att: '3+', sup: 'supportive', mot: 8 }, riskLevel: 'mid'
  },

  {
    id: 'p2', name: 'Priya S.', age: 28, gender: 'Female',
    addictions: ['social_media', 'food'], startDate: '2025-03-01', goal: 'control',
    checkins: [
      { date: '2025-03-20', mood: 'good', urge: 3, triggers: ['Boredom'], coping: ['Exercise'], note: '' },
      { date: '2025-03-21', mood: 'great', urge: 1, triggers: [], coping: ['Meditation', 'Journaling'], note: 'Phone-free morning!' },
      { date: '2025-03-22', mood: 'good', urge: 2, triggers: [], coping: ['Exercise'], note: '' },
      { date: '2025-03-23', mood: 'great', urge: 1, triggers: [], coping: ['Meditation'], note: '4 hours without checking.' },
      { date: '2025-03-24', mood: 'good', urge: 2, triggers: ['Boredom'], coping: ['Deep breathing'], note: '' },
    ],
    journal: [
      { date: '2025-03-21', mood: 'great', text: "Went 4 hours without checking my phone this morning. It felt genuinely freeing. Baby steps but they're adding up." },
      { date: '2025-03-23', mood: 'great', text: "23 days since I set the screen time limit. My anxiety is noticeably lower. I've been cooking dinner and actually tasting it." },
    ],
    xp: 240, assessment: { wd: 2, impact: 'mild', mental: 'rarely', att: '1-2', sup: 'neutral', mot: 9 }, riskLevel: 'low'
  },

  {
    id: 'p3', name: 'James T.', age: 45, gender: 'Male',
    addictions: ['opioids', 'alcohol'], startDate: '2025-01-05', goal: 'abstinence',
    checkins: [
      { date: '2025-03-15', mood: 'hard', urge: 9, triggers: ['Physical pain', 'Anxiety'], coping: [], note: 'Pain levels unbearable.' },
      { date: '2025-03-18', mood: 'hard', urge: 8, triggers: ['Physical pain'], coping: ['Called someone'], note: '' },
      { date: '2025-03-22', mood: 'ok', urge: 6, triggers: ['Stress / Work'], coping: ['Called someone', 'Deep breathing'], note: 'Better than last week.' },
      { date: '2025-03-24', mood: 'ok', urge: 5, triggers: ['Physical pain'], coping: ['Meditation'], note: '' },
    ],
    journal: [
      { date: '2025-03-15', mood: 'hard', text: "Really bad day. Chronic pain is still brutal. Felt like giving up on the whole thing. Only reason I didn't call my dealer was I kept thinking about my kids." },
      { date: '2025-03-22', mood: 'ok', text: "Something shifted this week. Still hard. But I made it to a meeting for the first time in three weeks. People there remembered me." },
    ],
    xp: 310, assessment: { wd: 9, impact: 'severe', mental: 'often', att: '3+', sup: 'neutral', mot: 5 }, riskLevel: 'high'
  },

  {
    id: 'p4', name: 'Aisha K.', age: 22, gender: 'Female',
    addictions: ['nicotine', 'gambling'], startDate: '2025-02-20', goal: 'abstinence',
    checkins: [
      { date: '2025-03-20', mood: 'good', urge: 3, triggers: ['Social pressure'], coping: ['Deep breathing', 'Distraction'], note: '' },
      { date: '2025-03-21', mood: 'great', urge: 1, triggers: [], coping: ['Exercise'], note: '' },
      { date: '2025-03-22', mood: 'good', urge: 2, triggers: [], coping: ['Meditation'], note: '' },
      { date: '2025-03-23', mood: 'great', urge: 1, triggers: [], coping: ['Exercise', 'Journaling'], note: '32 smoke-free days!' },
      { date: '2025-03-24', mood: 'great', urge: 0, triggers: [], coping: ['Meditation'], note: '' },
    ],
    journal: [
      { date: '2025-03-23', mood: 'great', text: "32 days smoke-free. This is wild. I'd never made it past 10 before. I've been redirecting the gambling money into a savings jar. It's up to $240 this month." },
    ],
    xp: 580, assessment: { wd: 4, impact: 'moderate', mental: 'sometimes', att: '1-2', sup: 'supportive', mot: 9 }, riskLevel: 'low'
  },
];
