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
