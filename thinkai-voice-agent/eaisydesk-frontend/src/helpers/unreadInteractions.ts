/**
 * Olvasatlan interakciók jelölése (kék pötty a sornál).
 *
 * Per-böngésző olvasottság: a felhasználó lokális eszközén tároljuk, mely
 * interakciókat nyitotta már meg (row-kattintásra elolvasott lesz). A rendszer
 * több böngészről eszközről is elérhető, ezért a jelölés eszközönként érvényes.
 */
const STORAGE_KEY = 'read_interaction_ids';
const MAX_IDS = 2000;

function loadReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '[]';
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveReadSet(set: Set<string>) {
  const arr = [...set].slice(-MAX_IDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* private mode — a jelölés csak session-szintű */
  }
}

export function isUnread(id: number | string | null | undefined): boolean {
  if (id === null || id === undefined || id === '') return false;
  return !loadReadSet().has(String(id));
}

export function markInteractionRead(id: number | string | null | undefined): void {
  if (id === null || id === undefined || id === '') return;
  const set = loadReadSet();
  if (set.has(String(id))) return;
  set.add(String(id));
  saveReadSet(set);
}
