/**
 * A v4 UUID. Uses crypto.randomUUID when available, but that only exists in a
 * secure context (HTTPS or localhost); over plain HTTP on a LAN IP it is
 * missing, so fall back to getRandomValues, then Math.random.
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

const DEVICE_KEY = 'ulb:deviceId';
const TOURNEY_KEY = 'ulb:currentTournament';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getCurrentTournamentId(): string {
  let id = localStorage.getItem(TOURNEY_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(TOURNEY_KEY, id);
  }
  return id;
}

/** Remember which tournament new games join. */
export function setCurrentTournamentId(id: string): void {
  localStorage.setItem(TOURNEY_KEY, id);
}
