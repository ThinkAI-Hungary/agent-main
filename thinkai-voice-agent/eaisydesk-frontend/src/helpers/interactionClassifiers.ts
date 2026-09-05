/**
 * Interaction classification helpers.
 * EAISY-241 — szinkronizálva a backend classifier.py + triage_rules.routing
 * döntési mátrixszal. A detect* függvények először a backend által küldött
 * r.classification.* mezőket használják (strukturált adat); csak ha az üres,
 * fut a heurisztikus fallback.
 *
 * Címkeszótár (backend = frontend, harmonizálva — lásd GET /admin/api/classification-labels):
 *   ügytípus:   Kérdés | Kérés | Panasz | Időpont | Egyéb
 *   eredmény:   Megválaszolt kérdés | Válasz előkészítve | Kérdés rögzítve |
 *               Igény rögzítve | Panasz rögzítve |
 *               Új időpont | Módosított időpont | Törölt időpont |
 *               Foglalási szándék rögzítve |
 *               Módosítási szándék rögzítve | Lemondási szándék rögzítve
 *   státusz:    Lezárt | Nyitott | Sürgős
 *   teendő:     Nincs további teendő | Jóváhagyás szükséges |
 *               Válasz/visszahívás szükséges | Intézkedés |
 *               Időpont véglegesítése | Azonnali beavatkozás szükséges
 *
 * Vegyes ügytípus prioritás (EAISY-241 §2.2): Panasz > Időpont > Kérés > Kérdés > Egyéb
 */

import { cleanStr } from './formatters';

// ── Backend classification JSONB típus (classifier.py kimenete) ──
export interface Classification {
  ugytipus?: string;
  idopont_altipus?: string | null;
  detected_types?: string[] | null;
  client_name?: string | null;
  restriction?: string;
  autonomous?: boolean;
  eredmeny?: string;
  statusz?: string;
  teendo?: string;
  osszefoglalas?: string;
}

// ── EAISY-241 §2.2 vegyes ügytípus prioritás (legmagasabb → legalacsonyabb) ──
export const TYPE_PRIORITY = ['Panasz', 'Időpont', 'Kérés', 'Kérdés', 'Egyéb'] as const;

/**
 * Mixed-type badge-ekhez: a detected_types listát a TYPE_PRIORITY szerint
 * sorba rendezve adja vissza (ismeretlen típusok a végére, Egyéb kiszűrve,
 * ha van konkrétabb típus).
 */
export function sortedDetectedTypes(classification?: Classification | null): string[] {
  const types = classification?.detected_types;
  if (!Array.isArray(types) || types.length === 0) return [];
  const known = TYPE_PRIORITY.filter((t) => types.includes(t));
  const unknown = types.filter((t) => !(TYPE_PRIORITY as readonly string[]).includes(t));
  const result = [...known, ...unknown];
  if (result.length > 1 && result.includes('Egyéb')) {
    return result.filter((t) => t !== 'Egyéb');
  }
  return result;
}

// ── Relation Matrix definitions (szinkron a backend migrate_decision_matrix.sql seed-del) ──
const RELATION_MATRIX: Record<
  string, // Ügytípus
  Record<
    string, // Eredmény
    { statusz: string; teendo: string }
  >
> = {
  'Kérdés': {
    'Megválaszolt kérdés': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Válasz előkészítve': { statusz: 'Nyitott', teendo: 'Jóváhagyás szükséges' },
    'Kérdés rögzítve': { statusz: 'Nyitott', teendo: 'Válasz/visszahívás szükséges' },
    // back-compat régi címke
    'Jóváhagyásra vár': { statusz: 'Nyitott', teendo: 'Jóváhagyás szükséges' },
  },
  'Időpont': {
    // EAISY-241 új címkék (altípus-szintű kimenetek + szándék-rögzítés)
    'Új időpont': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Módosított időpont': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Törölt időpont': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Foglalási szándék rögzítve': { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' },
    'Módosítási szándék rögzítve': { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' },
    'Lemondási szándék rögzítve': { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' },
    // back-compat régi címkék (a backend ezeket már nem állítja elő)
    'Időpont módosítva': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Időpont törölve': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Időpont előkészítve': { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' },
  },
  'Kérés': {
    'Igény rögzítve': { statusz: 'Nyitott', teendo: 'Intézkedés' },
  },
  'Panasz': {
    'Panasz rögzítve': { statusz: 'Sürgős', teendo: 'Azonnali beavatkozás szükséges' },
  },
  'Egyéb': {
    'Igény rögzítve': { statusz: 'Nyitott', teendo: 'Intézkedés' },
  },
};

/** Lookup statusz and teendo based on case type and result */
export function lookupRelation(ugyTipus: string, eredmeny: string): { statusz: string; teendo: string } {
  let keyUgyTipus = 'Egyéb';
  const u = ugyTipus ? ugyTipus.toUpperCase() : '';
  if (u === 'KÉRDÉS' || u === 'KERDES') keyUgyTipus = 'Kérdés';
  else if (u === 'IDŐPONT' || u === 'IDOPONT') keyUgyTipus = 'Időpont';
  else if (u === 'KÉRÉS' || u === 'KERES') keyUgyTipus = 'Kérés';
  else if (u === 'PANASZ') keyUgyTipus = 'Panasz';

  let keyEredmeny = eredmeny || '';
  if (keyEredmeny === 'Rögzítve' || !keyEredmeny) {
    if (keyUgyTipus === 'Kérdés') keyEredmeny = 'Megválaszolt kérdés';
    else if (keyUgyTipus === 'Időpont') keyEredmeny = 'Foglalási szándék rögzítve';
    else if (keyUgyTipus === 'Kérés') keyEredmeny = 'Igény rögzítve';
    else if (keyUgyTipus === 'Panasz') keyEredmeny = 'Panasz rögzítve';
    else keyEredmeny = 'Igény rögzítve';
  }

  const map = RELATION_MATRIX[keyUgyTipus];
  if (map && map[keyEredmeny]) {
    return map[keyEredmeny];
  }

  // Fallbacks
  if (keyUgyTipus === 'Panasz') {
    return { statusz: 'Sürgős', teendo: 'Azonnali beavatkozás szükséges' };
  } else if (keyUgyTipus === 'Időpont') {
    return { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' };
  } else if (keyUgyTipus === 'Kérés' || keyUgyTipus === 'Egyéb') {
    return { statusz: 'Nyitott', teendo: 'Intézkedés' };
  } else {
    return { statusz: 'Nyitott', teendo: 'Válasz/visszahívás szükséges' };
  }
}

/** Detect ügytípus from interaction data */
export function detectUgyTipus(r: {
  topic?: string | null;
  summary?: string | null;
  desc?: string | null;
  handover_reason?: string | null;
  type?: string | null;
  badge?: string | null;
  classification?: Classification | null;
}): string {
  if (r.classification?.ugytipus) return r.classification.ugytipus;

  if (r.type === 'calendar') return 'Időpont';
  if (r.type === 'approval') return 'Kérdés';

  // Ékezet-mentesített fallback (cleanStr) — a ragozott/ékezet-hibás szövegek
  // is matcheljenek, a backend _strip_accents mintájára
  const topic = cleanStr(
    (r.topic || '') +
    ' ' +
    (r.summary || '') +
    ' ' +
    (r.desc || '') +
    ' ' +
    (r.handover_reason || '') +
    ' ' +
    (r.type || '') +
    ' ' +
    (r.badge || '')
  );

  // 1. Panasz (Sürgős)
  if (
    topic.includes('panasz') ||
    topic.includes('reklamac') ||
    topic.includes('complaint') ||
    topic.includes('surgos') ||
    topic.includes('elegedetlen')
  ) {
    return 'Panasz';
  }

  // 2. Időpont (Naptár)
  if (
    topic.includes('idopont') ||
    topic.includes('foglalas') ||
    topic.includes('foglalva') ||
    topic.includes('booking') ||
    topic.includes('lemond') ||
    topic.includes('modosit') ||
    topic.includes('athelyez') ||
    topic.includes('emlekeztet')
  ) {
    return 'Időpont';
  }

  // 3. Kérés (Intézkedés)
  if (
    topic.includes('keres') ||
    topic.includes('igeny') ||
    topic.includes('request') ||
    topic.includes('intezked') ||
    topic.includes('visszahivas')
  ) {
    return 'Kérés';
  }

  // 4. Kérdés (Információ)
  if (
    topic.includes('kerdes') ||
    topic.includes('question') ||
    topic.includes('informacio') ||
    topic.includes('erdeklod') ||
    topic.includes('mennyi') ||
    topic.includes('kerul') ||
    topic.includes('ar ') ||
    topic.includes('arak') ||
    topic.includes('koltseg') ||
    topic.includes('fizetes') ||
    topic.includes('hany') ||
    topic.includes('mikor') ||
    topic.includes('hogyan') ||
    topic.includes('miert') ||
    topic.includes('milyen') ||
    topic.includes('jovahagyas')
  ) {
    return 'Kérdés';
  }

  return 'Egyéb';
}

/** Detect eredmény (result outcome) from interaction data */
export function detectEredmeny(r: {
  funnel_stage?: string | null;
  topic?: string | null;
  summary?: string | null;
  desc?: string | null;
  handover_reason?: string | null;
  result?: string | null;
  type?: string | null;
  approval_status?: string | null;
  badge?: string | null;
  classification?: Classification | null;
}): string {
  if (r.classification?.eredmeny) return r.classification.eredmeny;

  const fs = (r.funnel_stage || '').toLowerCase();
  const rs = (r.result || '').toLowerCase();
  const ty = (r.type || '').toLowerCase();
  const as = (r.approval_status || '').toLowerCase();
  const combined = cleanStr(
    (r.topic || '') + ' ' + (r.summary || '') + ' ' + (r.desc || '') + ' ' + (r.handover_reason || '') + ' ' + (r.result || '')
  );

  const isClosed = as === 'approved' || as === 'lezárt' || as === 'rejected';
  const category = detectUgyTipus(r);

  if (category === 'Panasz') {
    return 'Panasz rögzítve';
  }

  if (category === 'Időpont') {
    if (
      combined.includes('lemond') ||
      combined.includes('torol') ||
      combined.includes('cancel') ||
      fs === 'cancelled'
    ) {
      return 'Törölt időpont';
    }
    if (
      combined.includes('modosit') ||
      combined.includes('athelyez') ||
      combined.includes('valtoztat')
    ) {
      return 'Módosított időpont';
    }
    if (
      fs === 'booked' ||
      fs === 'foglalt' ||
      ty === 'foglalás' ||
      ty === 'calendar' ||
      rs.includes('lefoglalva')
    ) {
      return 'Új időpont';
    }
    return 'Foglalási szándék rögzítve';
  }

  if (category === 'Kérdés') {
    if (isClosed || rs.includes('megválaszol') || rs.includes('megoldva') || fs === 'valaszolt' || rs.includes('elküld') || rs.includes('sikeres')) {
      return 'Megválaszolt kérdés';
    }
    if (as === 'pending' || ty === 'approval' || r.badge === 'jovahagyas') {
      return 'Válasz előkészítve';
    }
    return 'Kérdés rögzítve';
  }

  return 'Igény rögzítve';
}

/** Detect statusz from interaction data */
export function detectStatusz(r: {
  funnel_stage?: string | null;
  topic?: string | null;
  summary?: string | null;
  desc?: string | null;
  handover_reason?: string | null;
  result?: string | null;
  type?: string | null;
  approval_status?: string | null;
  badge?: string | null;
  alert_tags?: string[] | null;
  classification?: Classification | null;
}): string {
  // A strukturált backend adat az ELSŐ (a fejléc-komment szerinti sorrend) —
  // korábban az approval_status==='lezárt' megelőzte, és elfedte a Sürgős-t.
  if (r.classification?.statusz) return r.classification.statusz;

  const as = (r.approval_status || '').toLowerCase();
  const isClosed = as === 'approved' || as === 'lezárt' || as === 'rejected';

  if (as === 'lezárt') return 'Lezárt';

  const hr = (r.handover_reason || '').toLowerCase();
  const tags = (r.alert_tags || []).map((t) => (t || '').toLowerCase());
  const categoryStr = detectUgyTipus(r);
  const erStr = detectEredmeny(r);
  const isUrgent = categoryStr.includes('Panasz') ||
                   erStr.includes('Panasz rögzítve') ||
                   hr.includes('sürgős') ||
                   hr.includes('urgent') ||
                   tags.includes('urgent');

  // 1. URGENT cases (unless explicitly closed)
  if (isUrgent) {
    if (isClosed && !hr.includes('sürgős') && !hr.includes('urgent')) {
      return 'Lezárt';
    }
    return 'Sürgős';
  }

  // 2. CLOSED cases
  if (isClosed) {
    if (erStr.includes('Foglalási szándék rögzítve') || erStr.includes('Időpont előkészítve')) return 'Nyitott';
    return 'Lezárt';
  }

  // 3. PENDING cases (Open)
  if (as === 'pending' || as === 'pending_approval' || as === 'johagyasra_var' || as === 'jóváhagyásra vár') {
    return 'Nyitott';
  }

  return 'Nyitott';
}

/** Detect teendő (next action) from interaction data */
export function detectTeendo(r: {
  funnel_stage?: string | null;
  topic?: string | null;
  summary?: string | null;
  desc?: string | null;
  handover_reason?: string | null;
  result?: string | null;
  type?: string | null;
  approval_status?: string | null;
  badge?: string | null;
  alert_tags?: string[] | null;
  classification?: Classification | null;
}): string {
  if (r.classification?.teendo) return r.classification.teendo;

  const as = (r.approval_status || '').toLowerCase();
  const isClosed = as === 'approved' || as === 'lezárt' || as === 'rejected';

  const utStr = detectUgyTipus(r);
  const erStr = detectEredmeny(r);
  const hr = (r.handover_reason || '').toLowerCase();
  const tags = (r.alert_tags || []).map((t) => (t || '').toLowerCase());

  const isUrgent = utStr.includes('Panasz') ||
                   erStr.includes('Panasz rögzítve') ||
                   hr.includes('sürgős') ||
                   hr.includes('urgent') ||
                   tags.includes('urgent');

  // 1. URGENT action priority
  if (isUrgent) {
    if (isClosed && !hr.includes('sürgős') && !hr.includes('urgent')) {
      return 'Nincs további teendő';
    }
    return 'Azonnali beavatkozás szükséges';
  }

  // 2. PENDING action priority
  if (as === 'pending' || as === 'pending_approval' || as === 'johagyasra_var') {
    return 'Jóváhagyás szükséges';
  }

  if (isClosed) {
    if (erStr === 'Időpont előkészítve' || erStr === 'Foglalási szándék rögzítve') {
      return 'Időpont véglegesítése';
    }
    return 'Nincs további teendő';
  }

  if (erStr === 'Jóváhagyásra vár' || erStr === 'Válasz előkészítve') {
    return 'Jóváhagyás szükséges';
  }
  if (erStr === 'Kérdés rögzítve') {
    return 'Válasz/visszahívás szükséges';
  }
  if (erStr === 'Időpont előkészítve' || erStr === 'Foglalási szándék rögzítve') {
    return 'Időpont véglegesítése';
  }
  if (erStr === 'Igény rögzítve') {
    return 'Intézkedés';
  }

  return 'Nincs további teendő';
}

// ── Color maps ──

export const EREDMENY_COLORS: Record<string, { bg: string; color: string }> = {
  // Időpont — EAISY-241 új címkék
  'Új időpont': { bg: '#dcfce7', color: '#166534' },
  'Módosított időpont': { bg: '#dcfce7', color: '#166534' },
  'Törölt időpont': { bg: '#f3f4f6', color: '#6b7280' },
  'Foglalási szándék rögzítve': { bg: '#fef9c3', color: '#854d0e' },
  'Módosítási szándék rögzítve': { bg: '#fef9c3', color: '#854d0e' },
  'Lemondási szándék rögzítve': { bg: '#fef9c3', color: '#854d0e' },
  // Időpont — back-compat régi címkék
  'Időpont módosítva': { bg: '#dbeafe', color: '#1e40af' },
  'Időpont törölve': { bg: '#f3f4f6', color: '#6b7280' },
  'Időpont előkészítve': { bg: '#fef9c3', color: '#854d0e' },
  // Kérdés
  'Megválaszolt kérdés': { bg: '#dcfce7', color: '#166534' },
  'Válasz előkészítve': { bg: '#fef9c3', color: '#854d0e' },
  'Jóváhagyásra vár': { bg: '#fef9c3', color: '#854d0e' },
  'Kérdés rögzítve': { bg: '#dbeafe', color: '#1e40af' },
  // Kérés / Panasz / Egyéb
  'Igény rögzítve': { bg: '#fef9c3', color: '#854d0e' },
  'Panasz rögzítve': { bg: '#fee2e2', color: '#b91c1c' },
};

/** Értékesítési címkék — ezek alapján kerül az ügyfél az érdeklődőkezelésbe */
export const SALES_TAGS = [
  'kampánylead',
  'potenciális vásárló',
  'árkérdés',
  'törölt időpont',
  'no-show',
];

export const STATUSZ_COLORS: Record<string, { bg: string; color: string }> = {
  // eaisyDesk UI Kit 06: tintelt háttér + sötét szöveg + keret (Badge.tsx adja)
  Lezárt: { bg: '#f6ffed', color: '#389e0d' },
  Nyitott: { bg: '#fffbe6', color: '#d48806' },
  Sürgős: { bg: '#fff2f0', color: '#d9363d' },
  LEZÁRT: { bg: '#f6ffed', color: '#389e0d' },
  NYITOTT: { bg: '#fffbe6', color: '#d48806' },
  SÜRGŐS: { bg: '#fff2f0', color: '#d9363d' },
};

export const UGYTIPUS_COLORS: Record<string, { bg: string; color: string }> = {
  Időpont: { bg: '#dbeafe', color: '#1e40af' },
  Kérdés: { bg: '#ccfbf1', color: '#0f766e' },
  Kérés: { bg: '#fef9c3', color: '#854d0e' },
  Panasz: { bg: '#fee2e2', color: '#b91c1c' },
  Egyéb: { bg: '#f3f4f6', color: '#374151' },
  IDŐPONT: { bg: '#dbeafe', color: '#1e40af' },
  KÉRDÉS: { bg: '#ccfbf1', color: '#0f766e' },
  KÉRÉS: { bg: '#fef9c3', color: '#854d0e' },
  PANASZ: { bg: '#fee2e2', color: '#b91c1c' },
  EGYÉB: { bg: '#f3f4f6', color: '#374151' },
};

export const DIRECTION_COLORS: Record<string, { bg: string; color: string }> = {
  Bejövő: { bg: '#dbeafe', color: '#1e40af' },
  Kimenő: { bg: '#f3e8ff', color: '#6b21a8' },
};

export const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  árkérdés: { bg: '#fce4ec', color: '#c62828' },
  kampánylead: { bg: '#e8f5e9', color: '#2e7d32' },
  'kampány lead': { bg: '#e8f5e9', color: '#2e7d32' },
  ajánlatkérés: { bg: '#fff3e0', color: '#e65100' },
  'törölt időpont': { bg: '#fce4ec', color: '#c62828' },
  'no-show': { bg: '#fff8e1', color: '#f57f17' },
  VIP: { bg: '#ede7f6', color: '#4527a0' },
};

export function getTagColor(tag: string): { bg: string; color: string } {
  return TAG_COLORS[tag] || { bg: '#f3f4f6', color: '#374151' };
}
