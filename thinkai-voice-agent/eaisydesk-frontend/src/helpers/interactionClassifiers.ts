/**
 * Interaction classification helpers.
 * Ported 1:1 from legacy admin-interactions.js (lines 54–153).
 * DO NOT modify the classification logic – functional parity is critical.
 */

/** Detect ügytípus from interaction data */
export function detectUgyTipus(r: {
  topic?: string;
  summary?: string;
  type?: string;
}): string {
  const topic = (
    (r.topic || '') +
    ' ' +
    (r.summary || '') +
    ' ' +
    (r.type || '')
  ).toLowerCase();
  if (
    topic.includes('panasz') ||
    topic.includes('reklamáció') ||
    topic.includes('complaint')
  )
    return 'PANASZ';
  if (
    topic.includes('időpont') ||
    topic.includes('foglal') ||
    topic.includes('booking') ||
    topic.includes('lemondás') ||
    topic.includes('módosít') ||
    topic.includes('emlékeztet')
  )
    return 'IDŐPONT';
  if (
    topic.includes('kérés') ||
    topic.includes('keres') ||
    topic.includes('igény') ||
    topic.includes('request')
  )
    return 'KÉRÉS';
  if (
    topic.includes('kérdés') ||
    topic.includes('question') ||
    topic.includes('információ') ||
    topic.includes('érdeklőd')
  )
    return 'KÉRDÉS';
  return 'EGYÉB';
}

/** Detect eredmény (result outcome) from interaction data */
export function detectEredmeny(r: {
  funnel_stage?: string;
  topic?: string;
  summary?: string;
  result?: string;
  type?: string;
  approval_status?: string;
}): string {
  const fs = (r.funnel_stage || '').toLowerCase();
  const tp = (r.topic || '').toLowerCase();
  const sm = (r.summary || '').toLowerCase();
  const rs = (r.result || '').toLowerCase();
  const ty = (r.type || '').toLowerCase();
  const as = (r.approval_status || '').toLowerCase();
  const combined = tp + ' ' + sm + ' ' + rs;

  // ── PANASZ (legmagasabb prioritás) ──
  if (
    combined.includes('panasz') ||
    combined.includes('reklamáció') ||
    combined.includes('complaint')
  )
    return 'Panasz rögzítve';

  // ── IDŐPONT kategóriák ──
  if (
    fs === 'booked' ||
    fs === 'foglalt' ||
    ty === 'foglalás' ||
    tp.includes('időpontfoglal') ||
    tp.includes('foglal') ||
    combined.includes('lefoglal') ||
    combined.includes('új időpont') ||
    rs.includes('lefoglalva')
  )
    return 'Új időpont';
  if (
    combined.includes('módosít') ||
    combined.includes('áthelyez') ||
    combined.includes('változtat') ||
    tp.includes('módosítás')
  )
    return 'Időpont módosítva';
  if (
    combined.includes('lemond') ||
    combined.includes('töröl') ||
    combined.includes('cancel') ||
    fs === 'cancelled'
  )
    return 'Időpont törölve';
  if (
    combined.includes('előkészít') ||
    fs === 'negotiating' ||
    fs === 'ajanlat' ||
    fs === 'foglalas_alatt'
  )
    return 'Időpont előkészítve';

  // ── KÉRDÉS kategóriák ──
  if (
    (ty === 'kérdés' ||
      tp.includes('kérdés') ||
      tp.includes('tudásbázis') ||
      tp.includes('információ')) &&
    (as === 'approved' ||
      as === 'lezárt' ||
      rs.includes('megválaszol') ||
      rs.includes('megoldva'))
  )
    return 'Megválaszolt kérdés';
  if (
    as === 'pending' &&
    (ty === 'email' ||
      ty === 'kérdés' ||
      ty === 'messenger' ||
      ty === 'instagram') &&
    (rs.includes('jóváhagyás') ||
      rs.includes('várakozik') ||
      rs.includes('pending') ||
      combined.includes('piszkozat') ||
      combined.includes('draft'))
  )
    return 'Válasz előkészítve';
  if (
    ty === 'kérdés' ||
    tp.includes('tudásbázis') ||
    tp.includes('kérdés') ||
    (combined.includes('érdeklőd') && !combined.includes('időpont'))
  )
    return 'Kérdés rögzítve';

  // ── IGÉNY rögzítve ──
  if (
    combined.includes('igény') ||
    combined.includes('kérés') ||
    ty === 'feladat' ||
    tp.includes('feladat')
  )
    return 'Igény rögzítve';

  // ── EMAIL ──
  if (ty === 'email') {
    if (
      as === 'pending' ||
      rs.includes('jóváhagyás') ||
      rs.includes('várakozik')
    )
      return 'Válasz előkészítve';
    if (
      as === 'approved' ||
      rs.includes('elküld') ||
      rs.includes('kiküld') ||
      rs.includes('sikeres')
    )
      return 'Megválaszolt kérdés';
    if (tp.includes('emlékeztet') || tp.includes('reminder'))
      return 'Időpont előkészítve';
    return 'Válasz előkészítve';
  }

  // ── Messenger/Instagram/Meta/WhatsApp ──
  if (
    ty === 'messenger' ||
    ty === 'instagram' ||
    ty === 'meta' ||
    ty === 'whatsapp'
  ) {
    if (as === 'pending') return 'Válasz előkészítve';
    if (as === 'approved') return 'Megválaszolt kérdés';
    return 'Kérdés rögzítve';
  }

  // ── Emlékeztető ──
  if (tp.includes('emlékeztet') || tp.includes('reminder'))
    return 'Időpont előkészítve';

  // ── Riasztás ──
  if (ty === 'voice_alert' || tp.includes('riasztás'))
    return 'Panasz rögzítve';

  // ── Funnel stage fallback ──
  if (fs === 'reached') return 'Kérdés rögzítve';
  if (fs === 'valaszolt') return 'Megválaszolt kérdés';

  return 'Kérdés rögzítve';
}

/** Detect statusz from interaction data */
export function detectStatusz(r: {
  handover_reason?: string;
  approval_status?: string;
}): string {
  const hr = (r.handover_reason || '').toLowerCase();
  const as = (r.approval_status || '').toLowerCase();
  if (
    hr.includes('sürgős') ||
    hr.includes('urgent') ||
    hr.includes('panasz')
  )
    return 'SÜRGŐS';
  if (as === 'approved' || as === 'lezárt' || as === 'rejected')
    return 'LEZÁRT';
  if (as === 'pending' || hr.includes('nyitott') || hr.includes('várakoz'))
    return 'NYITOTT';
  return 'LEZÁRT';
}

/** Detect teendő (next action) from interaction data */
export function detectTeendo(r: {
  handover_reason?: string;
  approval_status?: string;
}): string {
  const hr = (r.handover_reason || '').toLowerCase();
  const as = (r.approval_status || '').toLowerCase();
  if (hr.includes('sürgős') || hr.includes('panasz'))
    return 'Azonnali beavatkozás szükséges';
  if (as === 'pending') return 'Jóváhagyásra vár';
  if (hr.includes('visszahív')) return 'Visszahívás szükséges';
  if (hr.includes('válasz')) return 'Válasz szükséges';
  if (hr.includes('intézked') || hr.includes('véglegesít'))
    return 'Intézkedés szükséges';
  if (hr.includes('végleges')) return 'Véglegesítés szükséges';
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
  'Kérdés rögzítve': { bg: '#dbeafe', color: '#1e40af' },
  'Igény rögzítve': { bg: '#fef9c3', color: '#854d0e' },
  'Panasz rögzítve': { bg: '#fee2e2', color: '#b91c1c' },
};

export const STATUSZ_COLORS: Record<string, { bg: string; color: string }> = {
  LEZÁRT: { bg: '#dcfce7', color: '#166534' },
  NYITOTT: { bg: '#fef9c3', color: '#854d0e' },
  SÜRGŐS: { bg: '#fee2e2', color: '#b91c1c' },
};

export const UGYTIPUS_COLORS: Record<string, { bg: string; color: string }> = {
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
