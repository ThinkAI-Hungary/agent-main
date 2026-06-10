/**
 * Client name resolution helpers.
 * Ported 1:1 from legacy admin-interactions.js resolveClientName() (lines 155–243)
 * and admin-customers.js bestClientName() logic.
 *
 * DO NOT modify matching logic – functional parity is critical.
 */

import { isRawId } from './formatters';

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
      const mid = (
        (cd?.messenger_id as string) ||
        (cd?.messenger_psid as string) ||
        ''
      )
        .toString()
        .trim();
      return mid && mid === directId;
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

  // Try all search values against all clients
  for (const searchVal of searchValues) {
    const match = allClients.find((c) => {
      const cd = parseCustomData(c.custom_data);
      // Match by name
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
      // Match by messenger_id
      const mid = (
        (cd?.messenger_id as string) ||
        (cd?.messenger_psid as string) ||
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
      // Match by phone
      const ph = (
        (cd?.phone as string) ||
        (cd?.telefon as string) ||
        c.phone ||
        ''
      ).replace(/\s/g, '');
      if (ph && ph === searchVal.replace(/\s/g, '')) return true;
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
  if (
    t.includes('email') ||
    sRoom.includes('email') ||
    (sessionId && sessionId.startsWith('reminder_'))
  )
    return 'Email';
  if (t.includes('messenger') || sRoom.includes('messenger'))
    return 'Messenger';
  if (t.includes('instagram') || sRoom.includes('instagram'))
    return 'Instagram';
  if (t.includes('whatsapp') || sRoom.includes('whatsapp')) return 'WhatsApp';
  return sessionChannel || 'Telefon';
}
