/**
 * Client name resolution helpers.
 * Ported 1:1 from legacy admin-interactions.js resolveClientName() (lines 155–243)
 * and admin-customers.js bestClientName() logic.
 *
 * DO NOT modify matching logic – functional parity is critical.
 */

import { isRawId, normalizePhoneNational } from './formatters';

export interface ClientRecord {
  id: number | string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  created_at?: string;
  custom_data?: string | Record<string, unknown>;
}

export interface ResolvedClient {
  name: string;
  id: number | string | null;
  status: string | null;
  created_at: string | null;
}

/** Parse custom_data from string or object */
export function parseCustomData(
  cd: string | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!cd) return {};
  if (typeof cd === 'string') {
    try {
      return JSON.parse(cd);
    } catch {
      return {};
    }
  }
  return cd;
}

/** Extract the best human-readable name from a client record */
export function bestClientName(c: ClientRecord): string | null {
  const cd = parseCustomData(c.custom_data);
  const n =
    (cd?.nev as string) ||
    (cd?.name as string) ||
    (cd?.['név'] as string) ||
    (cd?.instagram_username as string) ||
    c.name;
  if (n && n !== 'Névtelen' && n !== '-' && !isRawId(n)) return n;
  return null;
}

/**
 * Resolve client name from interaction data by matching against a clients map.
 * Mirrors the legacy resolveClientName() exactly.
 */
export function resolveClientName(
  r: { client_id?: number | string },
  session: {
    session_id?: string;
    participant?: string;
    client_name?: string;
  },
  clientsMap: Record<string, ClientRecord>,
  allClients: ClientRecord[]
): ResolvedClient {
  const sessionClientName =
    session.participant || session.client_name || 'Ismeretlen';

  // 1. Try to find client by client_id first
  if (r.client_id && clientsMap[String(r.client_id)]) {
    const c = clientsMap[String(r.client_id)];
    const n = bestClientName(c);
    return {
      name: n || sessionClientName,
      id: c.id,
      status: c.status || null,
      created_at: c.created_at || null,
    };
  }

  // 2. DIRECT messenger/instagram/whatsapp ID lookup from session_id
  const sid = session.session_id || '';
  let directId: string | null = null;
  if (sid.startsWith('messenger_')) directId = sid.substring(10).trim();
  else if (sid.startsWith('instagram_')) directId = sid.substring(10).trim();
  else if (sid.startsWith('whatsapp_')) directId = sid.substring(9).trim();

  if (directId) {
    const directMatch = allClients.find((c) => {
      const cd = parseCustomData(c.custom_data);
      // Az instagram_/whatsapp_ session-ökhöz is több kulcsot nézünk — korábban
      // kizárólag messenger_id/messenger_psid matchelt, az instagram_id /
      // whatsapp_id kulcson tárolt ügyfelek sosem oldódtak fel.
      const mid = (
        (cd?.messenger_id as string) ||
        (cd?.messenger_psid as string) ||
        (cd?.instagram_id as string) ||
        (cd?.whatsapp_id as string) ||
        (cd?.wa_id as string) ||
        ''
      )
        .toString()
        .trim();
      if (mid && mid === directId) return true;
      // whatsapp session: a directId telefonszám is lehet → national-összevetés
      if (sid.startsWith('whatsapp_')) {
        const ph = normalizePhoneNational(
          (cd?.phone as string) || (cd?.telefon as string) || c.phone || ''
        );
        const svPh = normalizePhoneNational(directId);
        if (ph && svPh && ph === svPh) return true;
      }
      return false;
    });
    if (directMatch) {
      const n = bestClientName(directMatch);
      if (n)
        return {
          name: n,
          id: directMatch.id,
          status: directMatch.status || null,
          created_at: directMatch.created_at || null,
        };
    }
  }

  // 3. Build a list of search values to try (name, email, phone)
  const searchValues: string[] = [];
  if (
    sessionClientName &&
    sessionClientName !== 'Ismeretlen' &&
    !isRawId(sessionClientName)
  ) {
    searchValues.push(sessionClientName.toLowerCase().trim());
  }
  // Extract email from session_id
  if (sid.startsWith('email_')) {
    const emailFromSid = sid.substring(6).toLowerCase().trim();
    if (emailFromSid && !searchValues.includes(emailFromSid))
      searchValues.push(emailFromSid);
  }
  if (directId && !searchValues.includes(directId))
    searchValues.push(directId);
  // EAISY-241 §1.2.5: Voice session (call_ / call-out- / sip_ / room name) — a
  // participant gyakran telefonszám. Adjuk hozzá a keresési értékekhez, hogy a 3.
  // ág megtalálja az ügyfelet telefonszám (vagy név) alapján. Csak ha még nincs benne.
  const isVoiceSession = /^(call[-_]|voice[-_]|phone[-_]|sip[-_])/i.test(sid) ||
    /^call-out-camp-/i.test(sid) ||
    /^thinkai-/i.test(sid);
  if (isVoiceSession) {
    const partVal = (session.participant || '').trim();
    if (partVal && !searchValues.includes(partVal.toLowerCase())) {
      searchValues.push(partVal.toLowerCase());
    }
  }

  // Try all search values against all clients
  for (const searchVal of searchValues) {
    const match = allClients.find((c) => {
      const cd = parseCustomData(c.custom_data);
      // Match by name (pontos, case-insensitive)
      const cn = (
        (cd?.nev as string) ||
        (cd?.name as string) ||
        (cd?.['név'] as string) ||
        c.name ||
        ''
      )
        .toLowerCase()
        .trim();
      if (cn && cn === searchVal) return true;
      // Match by messenger/instagram/whatsapp id
      const mid = (
        (cd?.messenger_id as string) ||
        (cd?.messenger_psid as string) ||
        (cd?.instagram_id as string) ||
        (cd?.whatsapp_id as string) ||
        ''
      )
        .toString()
        .trim()
        .toLowerCase();
      if (mid && mid === searchVal) return true;
      // Match by email
      const em = ((cd?.email as string) || c.email || '')
        .toLowerCase()
        .trim();
      if (em && em === searchVal) return true;
      // Match by phone — EAISY-241 §1: NATIONAL normalizált összevetés, hogy a
      // +36/06/0036 prefix-elt és formázott számok is egyezzenek (korábban a
      // nyers digit-összevetés a +36 vs 06 párost NEM találta meg).
      const phNational = normalizePhoneNational(
        (cd?.phone as string) ||
        (cd?.telefon as string) ||
        c.phone ||
        ''
      );
      const svNational = normalizePhoneNational(searchVal);
      if (phNational && svNational && phNational === svNational) return true;
      // Fallback: nyers digit-suffix — de csak elég hosszú (≥7 jegy) értékkel,
      // különben egy rövid szám bármihez hozzámatchel (false positive).
      const phDigits = (
        (cd?.phone as string) ||
        (cd?.telefon as string) ||
        c.phone ||
        ''
      ).replace(/\D/g, '');
      const svDigits = searchVal.replace(/\D/g, '');
      if (phDigits && svDigits.length >= 7 && phDigits.length >= 7 &&
          (phDigits === svDigits ||
           phDigits.endsWith(svDigits) || svDigits.endsWith(phDigits))) return true;
      return false;
    });
    if (match) {
      const n = bestClientName(match);
      return {
        name: n || sessionClientName,
        id: match.id,
        status: match.status || null,
        created_at: match.created_at || null,
      };
    }
  }

  // No DB match found - return best available name from session
  let bestName = sessionClientName;
  if (bestName === 'Ismeretlen' || isRawId(bestName)) {
    if (sid.startsWith('email_')) {
      bestName = sid.substring(6);
    } else if (sid.startsWith('phone_')) {
      bestName = sid.substring(6);
    } else if (sid.startsWith('instagram_')) {
      bestName = sid.substring(10);
    } else if (sid.startsWith('messenger_')) {
      bestName = sid.substring(10);
    }
  }
  return { name: bestName, id: null, status: null, created_at: null };
}

/**
 * Detect the channel type from interaction/session data.
 * Ported from legacy getRowChannel().
 */
export function getRowChannel(
  rType: string,
  roomName: string,
  sessionId: string,
  sessionChannel?: string
): string {
  const t = (rType || '').toLowerCase();
  const sRoom = (roomName || '').toLowerCase();
  const sChan = (sessionChannel || '').toLowerCase();

  if (
    t.includes('email') ||
    sRoom.includes('email') ||
    sChan.includes('email') ||
    (sessionId && sessionId.startsWith('reminder_'))
  )
    return 'Email';
  if (
    t.includes('messenger') ||
    sRoom.includes('messenger') ||
    sChan.includes('messenger')
  )
    return 'Messenger';
  if (
    t.includes('instagram') ||
    sRoom.includes('instagram') ||
    sChan.includes('instagram')
  )
    return 'Instagram';
  if (
    t.includes('whatsapp') ||
    sRoom.includes('whatsapp') ||
    sChan.includes('whatsapp')
  )
    return 'WhatsApp';

  return 'Telefon';
}

/**
 * Check if a client is assigned to the current user.
 * Used for member-based filtering across all pages.
 */
export function isAssignedToMe(
  client: ClientRecord,
  username: string,
  fullName: string
): boolean {
  const cd = parseCustomData(client.custom_data);
  const assignedTo = ((cd.assigned_to || cd.felelos || '') as string).trim();
  if (!assignedTo) return false;
  return assignedTo === username || (!!fullName && assignedTo === fullName);
}
