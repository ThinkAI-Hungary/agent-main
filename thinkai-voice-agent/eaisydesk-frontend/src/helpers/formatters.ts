/**
 * Formatting helpers – ported 1:1 from legacy admin-core.js
 */

/** Format ISO datetime string to Hungarian display format */
export function fmtDt(isoStr: string): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}. ${m}. ${day}. ${h}:${min}`;
  } catch {
    return isoStr;
  }
}

/** HTML-escape a string (for dangerouslySetInnerHTML contexts) */
export function esc(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Normalize string for comparison: remove diacritics, lowercase, trim */
export function cleanStr(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Check if a string looks like a raw numeric ID (not a name) */
export function isRawId(val: string | null | undefined): boolean {
  return !!val && /^\d{8,}$/.test(val);
}

/** Format duration in minutes to human-readable */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} perc`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} óra ${m} perc` : `${h} óra`;
}

/** Format date-only from ISO string */
export function fmtDate(isoStr: string): string {
  if (!isoStr) return '—';
  try {
    const parts = isoStr.split('T')[0].split('-');
    return `${parts[0]}. ${parts[1]}. ${parts[2]}.`;
  } catch {
    return isoStr;
  }
}

/**
 * Magyar telefonszám NATIONAL (hazai) részének kinyerése összehasonlításhoz.
 * "+36301234567" / "06301234567" / "0036301234567" / "301234567" → "301234567".
 * Üres stringet ad, ha nem ismerhető fel magyar formátumként.
 * A clientResolvers telefon-matchingje is ezt használja (+36 vs 06 matchelés).
 */
export function normalizePhoneNational(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0036') && digits.length === 13) return digits.substring(4);
  if (digits.startsWith('36') && digits.length >= 10) return digits.substring(2);
  if (digits.startsWith('06') && digits.length >= 10) return digits.substring(2);
  if (digits.length === 9 && !digits.startsWith('0')) return digits;
  return '';
}

/**
 * EAISY-241 §1.3.5 — Magyar telefonszám normalizálás MEGJELENÍTÉSHEZ.
 * Bemenet: bármilyen formátumú magyar telefonszám (pl. "06301234567", "+36 30 123 4567",
 * "06-30/123-4567", "30/1234567"). Kimenet: "+36 xx xxx xxxx" formátum, vagy az
 * eredeti string ha nem magyar szám / nem felismerhető.
 * NEM módosítja a tárolt nyers értéket — csak a UI-on jelenik meg formázva.
 */
export function formatPhoneHu(raw: string | null | undefined): string {
  if (!raw) return '';
  const national = normalizePhoneNational(raw);
  if (!national) return String(raw);

  // national most 9 számjegy (pl. "301234567") → "+36 30 123 4567"
  if (national.length === 9) {
    const area = national.substring(0, 2);
    const mid = national.substring(2, 5);
    const last = national.substring(5);
    return `+36 ${area} ${mid} ${last}`;
  }
  // 8 számjegy (régi vezetékes pl. "11234567" area=1)
  if (national.length === 8) {
    const area = national.substring(0, 1);
    const mid = national.substring(1, 4);
    const last = national.substring(4);
    return `+36 ${area} ${mid} ${last}`;
  }
  return String(raw);
}
