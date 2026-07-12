// Fictional roster used to seed the app for documentation screenshots. All
// names are invented. Balanced so the Doctor is happy: 8 MMP / 8 WMP, each
// gender split 4 on the O line and 4 on the D line, a spread of ratings.

/** @typedef {{ name: string, gender: 'MMP'|'WMP', line: 'O'|'D', rating: number }} DemoPlayer */

/** @type {DemoPlayer[]} */
export const DEMO_PLAYERS = [
  // O line
  { name: 'Marcus Bell', gender: 'MMP', line: 'O', rating: 100 },
  { name: 'Diego Ramos', gender: 'MMP', line: 'O', rating: 90 },
  { name: 'Owen Fields', gender: 'MMP', line: 'O', rating: 60 },
  { name: 'Luca Moretti', gender: 'MMP', line: 'O', rating: 40 },
  { name: 'Nadia Khan', gender: 'WMP', line: 'O', rating: 100 },
  { name: 'Priya Patel', gender: 'WMP', line: 'O', rating: 90 },
  { name: 'Casey Wolfe', gender: 'WMP', line: 'O', rating: 50 },
  { name: 'Frankie Diaz', gender: 'WMP', line: 'O', rating: 30 },
  // D line
  { name: 'Theo Nguyen', gender: 'MMP', line: 'D', rating: 100 },
  { name: 'Sam Carter', gender: 'MMP', line: 'D', rating: 80 },
  { name: 'Jamal Price', gender: 'MMP', line: 'D', rating: 50 },
  { name: 'Kip Sanders', gender: 'MMP', line: 'D', rating: 20 },
  { name: 'Riley Stone', gender: 'WMP', line: 'D', rating: 100 },
  { name: 'Jordan Lee', gender: 'WMP', line: 'D', rating: 70 },
  { name: 'Mia Rivera', gender: 'WMP', line: 'D', rating: 50 },
  { name: 'Robin Ashby', gender: 'WMP', line: 'D', rating: 10 },
];

export const DEMO_OUR_TEAM = 'Rampage';
export const DEMO_THEIR_TEAM = 'Riptide';

// Who scores each point, in order. Drives a believable mid-game scoreboard when
// replayed through the real engine. 'h' marks where the second half starts.
export const DEMO_SCRIPT = [
  'us', 'them', 'us', 'us', 'them', 'us', 'us', 'them', 'us',
  'h',
  'us', 'them', 'us', 'them',
];

/** localStorage roster document, matching the app's Roster/Player shape. */
export function rosterSeed() {
  const players = DEMO_PLAYERS.map((p, i) => ({
    id: `demo-${String(i + 1).padStart(2, '0')}`,
    name: p.name,
    gender: p.gender,
    line: p.line,
    competitiveness: p.rating / 100,
    active: true,
  }));
  return { players, updatedAt: Date.now(), updatedBy: 'demo-seed' };
}
