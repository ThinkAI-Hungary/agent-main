/**
 * Interaction classification helpers.
 * Maps cases, results, statuses, and todos according to the approved CSV matrix.
 */

// ── Relation Matrix definitions ──
const RELATION_MATRIX: Record<
  string, // Ügytípus
  Record<
    string, // Eredmény
    { statusz: string; teendo: string }
  >
> = {
  'Kérdés': {
    'Megválaszolt kérdés': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Jóváhagyásra vár': { statusz: 'Nyitott', teendo: 'Válasz jóváhagyása szükséges' },
    'Kérdés rögzítve': { statusz: 'Nyitott', teendo: 'Válasz szükséges' },
  },
  'Időpont': {
    'Új időpont': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Időpont módosítva': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Időpont törölve': { statusz: 'Lezárt', teendo: 'Nincs további teendő' },
    'Időpont előkészítve': { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' },
  },
  'Kérés': {
    'Igény rögzítve': { statusz: 'Nyitott', teendo: 'Intézkedés szükséges' },
  },
  'Panasz': {
    'Panasz rögzítve': { statusz: 'Sürgős', teendo: 'Azonnali beavatkozás' },
  },
  'Egyéb': {
    'Igény rögzítve': { statusz: 'Nyitott', teendo: 'Intézkedés szükséges' },
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
  if (keyEredmeny === 'Válasz előkészítve') {
    keyEredmeny = 'Jóváhagyásra vár';
  } else if (keyEredmeny === 'Rögzítve' || !keyEredmeny) {
    if (keyUgyTipus === 'Kérdés') keyEredmeny = 'Megválaszolt kérdés';
    else if (keyUgyTipus === 'Időpont') keyEredmeny = 'Időpont előkészítve';
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
    return { statusz: 'Sürgős', teendo: 'Azonnali beavatkozás' };
  } else if (keyUgyTipus === 'Időpont') {
    return { statusz: 'Nyitott', teendo: 'Időpont véglegesítése' };
  } else if (keyUgyTipus === 'Kérés' || keyUgyTipus === 'Egyéb') {
    return { statusz: 'Nyitott', teendo: 'Intézkedés szükséges' };
  } else {
    return { statusz: 'Nyitott', teendo: 'Válasz szükséges' };
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
  classification?: { ugytipus?: string; eredmeny?: string; statusz?: string; teendo?: string } | null;
}): string {
  if (r.classification?.ugytipus) return r.classification.ugytipus;

  if (r.type === 'calendar') return 'Időpont';
  if (r.type === 'approval') return 'Kérdés';

  const topic = (
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
  ).toLowerCase();

  // 1. Panasz (Sürgős)
  if (
    topic.includes('panasz') ||
    topic.includes('reklamáció') ||
    topic.includes('complaint') ||
    topic.includes('sürgős') ||
    topic.includes('surgos')
  ) {
    return 'Panasz';
  }
  
  // 2. Időpont (Naptár)
  if (
    topic.includes('időpont') ||
    topic.includes('foglal') ||
    topic.includes('booking') ||
    topic.includes('lemond') ||
    topic.includes('töröl') ||
    topic.includes('módosít') ||
    topic.includes('áthelyez') ||
    topic.includes('emlékeztet')
  ) {
    return 'Időpont';
  }
  
  // 3. Kérés (Intézkedés)
  if (
    topic.includes('kérés') ||
    topic.includes('keres') ||
    topic.includes('igény') ||
    topic.includes('request') ||
    topic.includes('intézked') ||
    topic.includes('visszahívás')
  ) {
    return 'Kérés';
  }
  
  // 4. Kérdés (Információ)
  if (
    topic.includes('kérdés') ||
    topic.includes('question') ||
    topic.includes('információ') ||
    topic.includes('érdeklőd') ||
    topic.includes('mennyi') ||
    topic.includes('kerül') ||
    topic.includes('ár') ||
    topic.includes('költség') ||
    topic.includes('fizetés') ||
    topic.includes('hány') ||
    topic.includes('mikor') ||
    topic.includes('hogyan') ||
    topic.includes('miért') ||
    topic.includes('milyen') ||
    topic.includes('tudnak') ||
    topic.includes('lehet') ||
    topic.includes('csinál') ||
    topic.includes('jóváhagyás') ||
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
  classification?: { ugytipus?: string; eredmeny?: string; statusz?: string; teendo?: string } | null;
}): string {
  if (r.classification?.eredmeny) return r.classification.eredmeny;

  const fs = (r.funnel_stage || '').toLowerCase();
  const tp = (r.topic || '').toLowerCase();
  const sm = (r.summary || '').toLowerCase();
  const ds = (r.desc || '').toLowerCase();
  const hr = (r.handover_reason || '').toLowerCase();
  const rs = (r.result || '').toLowerCase();
  const ty = (r.type || '').toLowerCase();
  const as = (r.approval_status || '').toLowerCase();
  const combined = tp + ' ' + sm + ' ' + ds + ' ' + hr + ' ' + rs;

  const isClosed = as === 'approved' || as === 'lezárt' || as === 'rejected';
  const category = detectUgyTipus(r);

  if (category === 'Panasz') {
    return 'Panasz rögzítve';
  }
  
  if (category === 'Időpont') {
    if (
      combined.includes('lemond') ||
      combined.includes('töröl') ||
      combined.includes('cancel') ||
      fs === 'cancelled'
    ) {
      return 'Időpont törölve';
    }
    if (
      combined.includes('módosít') ||
      combined.includes('áthelyez') ||
      combined.includes('változtat') ||
      combined.includes('módosítás')
    ) {
      return 'Időpont módosítva';
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
    return 'Időpont előkészítve';
  }

  if (category === 'Kérdés') {
    if (isClosed || rs.includes('megválaszol') || rs.includes('megoldva') || fs === 'valaszolt' || rs.includes('elküld') || rs.includes('sikeres')) {
      return 'Megválaszolt kérdés';
    }
    if (as === 'pending' || ty === 'approval' || r.badge === 'jovahagyas') {
      return 'Jóváhagyásra vár';
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
  classification?: { ugytipus?: string; eredmeny?: string; statusz?: string; teendo?: string } | null;
}): string {
  const as = (r.approval_status || '').toLowerCase();
  if (as === 'pending' || as === 'pending_approval' || as === 'johagyasra_var') {
    return 'Nyitott';
  }

  if (r.classification?.statusz) return r.classification.statusz;

  const hr = (r.handover_reason || '').toLowerCase();
  const isClosed = as === 'approved' || as === 'lezárt' || as === 'rejected';

  const category = detectUgyTipus(r);
  const erStr = detectEredmeny(r);

  if (isClosed) {
    if (erStr === 'Panasz rögzítve') {
      return 'Sürgős';
    }
    if (erStr === 'Időpont előkészítve') {
      return 'Nyitott';
    }
    return 'Lezárt';
  }

  if (category === 'Panasz' || erStr === 'Panasz rögzítve') {
    return 'Sürgős';
  }

  if (
    erStr === 'Megválaszolt kérdés' ||
    erStr === 'Új időpont' ||
    erStr === 'Időpont módosítva' ||
    erStr === 'Időpont törölve'
  ) {
    return 'Lezárt';
  }

  const tags = r.alert_tags || [];
  if (hr.includes('sürgős') || hr.includes('urgent') || tags.includes('urgent')) {
    return 'Sürgős';
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
  classification?: { ugytipus?: string; eredmeny?: string; statusz?: string; teendo?: string } | null;
}): string {
  const as = (r.approval_status || '').toLowerCase();
  if (as === 'pending' || as === 'pending_approval' || as === 'johagyasra_var') {
    return 'Válasz jóváhagyása szükséges';
  }

  if (r.classification?.teendo) return r.classification.teendo;

  const isClosed = as === 'approved' || as === 'lezárt' || as === 'rejected';

  const utStr = detectUgyTipus(r);
  const erStr = detectEredmeny(r);

  if (isClosed) {
    if (erStr === 'Panasz rögzítve') {
      return 'Azonnali beavatkozás';
    }
    if (erStr === 'Időpont előkészítve') {
      return 'Időpont véglegesítése';
    }
    return 'Nincs további teendő';
  }

  if (utStr === 'Panasz' || erStr === 'Panasz rögzítve') {
    return 'Azonnali beavatkozás';
  }

  if (
    erStr === 'Megválaszolt kérdés' ||
    erStr === 'Új időpont' ||
    erStr === 'Időpont módosítva' ||
    erStr === 'Időpont törölve'
  ) {
    return 'Nincs további teendő';
  }

  if (erStr === 'Jóváhagyásra vár') {
    return 'Válasz jóváhagyása szükséges';
  }
  if (erStr === 'Kérdés rögzítve') {
    return 'Válasz szükséges';
  }
  if (erStr === 'Időpont előkészítve') {
    return 'Időpont véglegesítése';
  }
  if (erStr === 'Igény rögzítve') {
    return 'Intézkedés szükséges';
  }

  return 'Nincs további teendő';
}

// ── Color maps ──

export const EREDMENY_COLORS: Record<string, { bg: string; color: string }> = {
  'Új időpont': { bg: '#dcfce7', color: '#166534' },
  'Időpont módosítva': { bg: '#dbeafe', color: '#1e40af' },
  'Időpont törölve': { bg: '#f3f4f6', color: '#6b7280' },
  'Időpont előkészítve': { bg: '#fef9c3', color: '#854d0e' },
  'Megválaszolt kérdés': { bg: '#dcfce7', color: '#166534' },
  'Válasz előkészítve': { bg: '#fef9c3', color: '#854d0e' },
  'Jóváhagyásra vár': { bg: '#fef9c3', color: '#854d0e' },
  'Kérdés rögzítve': { bg: '#dbeafe', color: '#1e40af' },
  'Igény rögzítve': { bg: '#fef9c3', color: '#854d0e' },
  'Panasz rögzítve': { bg: '#fee2e2', color: '#b91c1c' },
};

export const STATUSZ_COLORS: Record<string, { bg: string; color: string }> = {
  Lezárt: { bg: '#dcfce7', color: '#166534' },
  Nyitott: { bg: '#fef9c3', color: '#854d0e' },
  Sürgős: { bg: '#ef4444', color: '#ffffff' },
  LEZÁRT: { bg: '#dcfce7', color: '#166534' },
  NYITOTT: { bg: '#fef9c3', color: '#854d0e' },
  SÜRGŐS: { bg: '#ef4444', color: '#ffffff' },
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
  'kampány lead': { bg: '#e8f5e9', color: '#2e7d32' },
  ajánlatkérés: { bg: '#fff3e0', color: '#e65100' },
  'törölt időpont': { bg: '#fce4ec', color: '#c62828' },
  'no-show': { bg: '#fff8e1', color: '#f57f17' },
  VIP: { bg: '#ede7f6', color: '#4527a0' },
};

export function getTagColor(tag: string): { bg: string; color: string } {
  return TAG_COLORS[tag] || { bg: '#f3f4f6', color: '#374151' };
}
