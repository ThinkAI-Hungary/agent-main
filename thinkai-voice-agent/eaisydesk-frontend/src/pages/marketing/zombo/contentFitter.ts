/**
 * contentFitter.ts
 * Universal Content-to-Template Fitting Engine — v1
 *
 * Replaces the 3 hardcoded text-filling strategies in QuickPostView.tsx
 * with a single, rule-based pipeline that works for ALL templates.
 *
 * RULES (applied in order):
 *   1. Slot capacity analysis   — measure charCapacity of each text layer
 *   2. Token classification     — classify words (number, promo, action, descriptive)
 *   3. Greedy slot assignment   — badge → kicker → headline → subtitle → CTA
 *   4. Empty button removal     — CTA gomb eltűnik ha nincs szöveg
 *   5. Single-word badge intel  — rövid, önálló szavak badge-re kerülnek
 *   6. Overflow soft-truncation — szóhatáron vág, "..." csak végső esetben
 *   7. Minimum content guard    — headline soha nem marad üres
 */

import type { LayerChild, LayerTemplate } from './layerTemplates';

// ── Constants ────────────────────────────────────────────────────────────────

const CHAR_WIDTH_RATIO = 0.56;
const DEFAULT_LINE_HEIGHT = 1.2;
const DEFAULT_FONT_SIZE = 28;

const STOP_WORDS = new Set([
  'a', 'az', 'es', 'es', 'vagy', 'hogy', 'mint', 'de', 'ha', 'is', 'mar',
  'meg', 'csak', 'nem', 'igen', 'el', 'meg', 'ki', 'le', 'fel', 'be',
  'en', 'te', 'o', 'mi', 'ti', 'ok', 'ez', 'az', 'egy', 'van', 'volt',
  'for', 'the', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'of',
  'with', 'all', 'our', 'your',
]);

const PROMO_KEYWORDS = [
  'sale', 'akcio', 'akcio', 'learazas', 'learazas', 'learazas',
  'kedvezmeny', 'kedvezmeny', 'ajanlat', 'ajanlat', 'kupon', 'promo',
  'new', 'uj', 'uj', 'ujdonsag', 'ujdonsag', 'hot', 'trending',
  'most', 'azonnal', 'ma', 'holnap', 'korlatozott', 'korlatozott',
  'exkluziv', 'exkluziv', 'limitalt', 'limitalt', 'special',
];

const CTA_ACTION_WORDS = [
  'vasarl', 'vasarj', 'rendel', 'megn', 'erdekel', 'letolt',
  'foglal', 'regisztr', 'feliratkoz', 'ertesit', 'felfedez', 'tovabb',
  'shop', 'buy', 'order', 'learn', 'discover', 'get', 'try', 'start',
  'book', 'join', 'subscribe', 'download',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlotAssignment {
  layerIndex: number;
  role: string;
  text: string;
  charCapacity: number;
  charUsed: number;
  overflowed: boolean;
}

export interface FitResult {
  layers: LayerChild[];
  assignments: SlotAssignment[];
  removedSlots: string[];
  warnings: string[];
}

interface SlotInfo {
  idx: number;
  layer: LayerChild;
  role: string;
  charCapacity: number;
  maxLines: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateCharCapacity(layer: LayerChild): { capacity: number; maxLines: number } {
  const fontSize = layer.fontSize ?? DEFAULT_FONT_SIZE;
  const width = layer.width ?? 800;
  const height = layer.height;
  const lh = layer.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * CHAR_WIDTH_RATIO)));
  let maxLines: number;
  if (height && height > fontSize) {
    maxLines = Math.max(1, Math.floor(height / (fontSize * lh)));
  } else {
    maxLines = 4;
  }
  return { capacity: charsPerLine * maxLines, maxLines };
}

interface TokenClassification {
  numberTokens: string[];
  promoTokens: string[];
  actionTokens: string[];
  descriptiveTokens: string[];
}

function removeDiacritics(s: string): string {
  return s
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i')
    .replace(/[óòő]/g,'o').replace(/[öô]/g,'o').replace(/[úùű]/g,'u')
    .replace(/[üû]/g,'u');
}

function classifyTokens(text: string, ctaText: string): TokenClassification {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result: TokenClassification = {
    numberTokens: [], promoTokens: [], actionTokens: [], descriptiveTokens: [],
  };
  for (const word of words) {
    const lower = removeDiacritics(word.toLowerCase().replace(/[.,!?;:]/g, ''));
    if (/^\d+%?$/.test(word) || /^-?\d+[%+]?$/.test(word)) {
      result.numberTokens.push(word); continue;
    }
    if (PROMO_KEYWORDS.some(kw => lower.includes(kw))) {
      result.promoTokens.push(word); continue;
    }
    if (!ctaText && CTA_ACTION_WORDS.some(kw => lower.includes(kw))) {
      result.actionTokens.push(word); continue;
    }
    result.descriptiveTokens.push(word);
  }
  return result;
}

function isBadgeWorthy(word: string): boolean {
  const lower = removeDiacritics(word.toLowerCase().replace(/[.,!?;:]/g, ''));
  if (STOP_WORDS.has(lower)) return false;
  if (word.length > 12) return false;
  if (/^\d+%?$/.test(word)) return true;
  if (PROMO_KEYWORDS.some(kw => lower.includes(kw)) && word.length <= 10) return true;
  return false;
}

function softTruncate(text: string, capacity: number): { fits: string; overflow: string } {
  if (text.length <= capacity) return { fits: text, overflow: '' };
  const words = text.split(/\s+/);
  let fits = '';
  let i = 0;
  while (i < words.length) {
    const candidate = fits ? `${fits} ${words[i]}` : words[i];
    if (candidate.length <= capacity) { fits = candidate; i++; }
    else break;
  }
  let overflow = words.slice(i).join(' ');
  if (!fits && words.length > 0) {
    fits = words[0].substring(0, Math.max(capacity - 3, 3)) + '...';
    overflow = words.slice(1).join(' ');
  }
  return { fits, overflow };
}

function findCtaButtonIdx(layers: LayerChild[], ctaTextIdx: number): number | null {
  for (let i = ctaTextIdx - 1; i >= Math.max(0, ctaTextIdx - 3); i--) {
    const l = layers[i];
    if (l.type === 'figure' && l.subType === 'rect' && (l.cornerRadius ?? 0) > 0) return i;
  }
  return null;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function fitContentToTemplate(
  template: LayerTemplate,
  overlayText: string,
  ctaText: string,
): FitResult {
  const warnings: string[] = [];
  const removedSlots: string[] = [];
  const assignments: SlotAssignment[] = [];
  const layers: LayerChild[] = template.layers.map(l => ({ ...l }));

  const text = overlayText.trim();
  const cta = ctaText.trim();

  // RULE 1: Analyze slot capacities
  const slots: SlotInfo[] = [];
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (l.type !== 'text') continue;
    if ((l.opacity ?? 1) < 0.5) continue;
    if (l.role === 'decoration' || l.role === 'countdown') continue;
    const { capacity, maxLines } = estimateCharCapacity(l);
    slots.push({ idx: i, layer: l, role: l.role ?? 'headline', charCapacity: capacity, maxLines });
  }

  const roleOrder = ['badge', 'kicker', 'headline', 'subtitle', 'cta'];
  const sortedSlots = [...slots].sort((a, b) => {
    const ai = roleOrder.indexOf(a.role);
    const bi = roleOrder.indexOf(b.role);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // No text — clear all + handle CTA
  if (!text) {
    for (const slot of slots) layers[slot.idx] = { ...layers[slot.idx], text: '' };
    if (!cta) {
      for (const slot of slots) {
        if (slot.role === 'cta') {
          layers[slot.idx] = { ...layers[slot.idx], text: '', visible: false };
          const btnIdx = findCtaButtonIdx(layers, slot.idx);
          if (btnIdx !== null) { layers[btnIdx] = { ...layers[btnIdx], visible: false }; removedSlots.push(`CTA button [${btnIdx}] hidden`); }
          removedSlots.push(`CTA text [${slot.idx}] hidden`);
        }
      }
    }
    return { layers, assignments, removedSlots, warnings };
  }

  // RULE 2: Classify tokens
  const tokens = classifyTokens(text, cta);

  // RULE 3+5: Build candidates
  let badgeCandidate = '';
  let kickerCandidate = '';
  let bodyTokens = [...tokens.descriptiveTokens];

  if (tokens.numberTokens.length > 0) {
    badgeCandidate = tokens.numberTokens[0];
    if (tokens.numberTokens.length > 1) bodyTokens = [...tokens.numberTokens.slice(1), ...bodyTokens];
  }
  for (const pt of tokens.promoTokens) {
    if (!badgeCandidate && isBadgeWorthy(pt)) { badgeCandidate = pt; }
    else if (!kickerCandidate && pt.length <= 12) { kickerCandidate = pt; }
    else { bodyTokens.push(pt); }
  }

  const derivedCta = cta || tokens.actionTokens.join(' ');
  if (!cta && tokens.actionTokens.length > 0) {
    bodyTokens = bodyTokens.filter(w => !CTA_ACTION_WORDS.some(kw => removeDiacritics(w.toLowerCase()).includes(kw)));
  }
  const bodyText = bodyTokens.join(' ');

  const assigned = new Set<number>();

  function assignToSlot(slotRole: string, textToAssign: string): boolean {
    if (!textToAssign) return false;
    const slot = sortedSlots.find(s => s.role === slotRole && !assigned.has(s.idx));
    if (!slot) return false;
    const { fits, overflow } = softTruncate(textToAssign, slot.charCapacity);
    if (overflow) warnings.push(`[${slotRole}] overflow truncated: "${overflow}"`);
    layers[slot.idx] = { ...layers[slot.idx], text: fits };
    assigned.add(slot.idx);
    assignments.push({ layerIndex: slot.idx, role: slot.role, text: fits, charCapacity: slot.charCapacity, charUsed: fits.length, overflowed: overflow.length > 0 });
    return true;
  }

  assignToSlot('badge', badgeCandidate);
  assignToSlot('kicker', kickerCandidate);

  // Headline + subtitle split
  const headlineSlot = sortedSlots.find(s => s.role === 'headline' && !assigned.has(s.idx));
  const subtitleSlot = sortedSlots.find(s => s.role === 'subtitle' && !assigned.has(s.idx));

  if (headlineSlot && bodyText) {
    if (subtitleSlot && bodyText.length > headlineSlot.charCapacity * 0.6) {
      const words = bodyText.split(/\s+/);
      let headlinePart = '';
      let splitIdx = 0;
      for (let wi = 0; wi < words.length; wi++) {
        const candidate = headlinePart ? `${headlinePart} ${words[wi]}` : words[wi];
        if (candidate.length <= headlineSlot.charCapacity) { headlinePart = candidate; splitIdx = wi + 1; }
        else break;
      }
      const subtitlePart = words.slice(splitIdx).join(' ');
      layers[headlineSlot.idx] = { ...layers[headlineSlot.idx], text: headlinePart };
      assigned.add(headlineSlot.idx);
      assignments.push({ layerIndex: headlineSlot.idx, role: 'headline', text: headlinePart, charCapacity: headlineSlot.charCapacity, charUsed: headlinePart.length, overflowed: false });
      if (subtitlePart) {
        const { fits: sf, overflow: so } = softTruncate(subtitlePart, subtitleSlot.charCapacity);
        if (so) warnings.push(`Subtitle overflow: "${so}"`);
        layers[subtitleSlot.idx] = { ...layers[subtitleSlot.idx], text: sf };
        assigned.add(subtitleSlot.idx);
        assignments.push({ layerIndex: subtitleSlot.idx, role: 'subtitle', text: sf, charCapacity: subtitleSlot.charCapacity, charUsed: sf.length, overflowed: so.length > 0 });
      }
    } else {
      assignToSlot('headline', bodyText);
    }
  }

  // CTA slot
  const ctaSlot = sortedSlots.find(s => s.role === 'cta');
  if (ctaSlot) {
    if (derivedCta) {
      const { fits } = softTruncate(derivedCta.toUpperCase(), ctaSlot.charCapacity);
      layers[ctaSlot.idx] = { ...layers[ctaSlot.idx], text: fits };
      assigned.add(ctaSlot.idx);
      assignments.push({ layerIndex: ctaSlot.idx, role: 'cta', text: fits, charCapacity: ctaSlot.charCapacity, charUsed: fits.length, overflowed: false });
    } else {
      // RULE 4: Empty button removal
      layers[ctaSlot.idx] = { ...layers[ctaSlot.idx], text: '', visible: false };
      const btnIdx = findCtaButtonIdx(layers, ctaSlot.idx);
      if (btnIdx !== null) { layers[btnIdx] = { ...layers[btnIdx], visible: false }; removedSlots.push(`CTA button [${btnIdx}] hidden (no CTA)`); }
      removedSlots.push(`CTA text [${ctaSlot.idx}] hidden (no CTA)`);
    }
  }

  // RULE 7: Minimum content guard — headline never stays empty
  const headlineFinal = sortedSlots.find(s => s.role === 'headline');
  if (headlineFinal && !assigned.has(headlineFinal.idx)) {
    const fallback = badgeCandidate || bodyText || text;
    const { fits } = softTruncate(fallback, headlineFinal.charCapacity);
    layers[headlineFinal.idx] = { ...layers[headlineFinal.idx], text: fits };
    warnings.push(`Headline fallback (Rule 7): "${fits}"`);
  }

  // Blank unassigned content slots (prevent placeholder leakthrough)
  for (const slot of slots) {
    if (!assigned.has(slot.idx) && slot.role !== 'decoration' && slot.role !== 'countdown') {
      if ((layers[slot.idx].text ?? '') !== '') {
        layers[slot.idx] = { ...layers[slot.idx], text: '' };
      }
    }
  }

  return { layers, assignments, removedSlots, warnings };
}
