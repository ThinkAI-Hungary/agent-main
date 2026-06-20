/**
 * GDPR Data Export — generates a JSON bundle of all client & interaction data.
 * GDPR 20. cikk — Adathordozhatósághoz való jog
 */
import { authFetch } from '../api/client';

export interface ExportResult {
  filename: string;
  blob: Blob;
  recordCount: number;
}

export async function exportAllDataAsJson(): Promise<ExportResult> {
  const bundle: Record<string, unknown[]> = {};
  let totalRecords = 0;

  // 1. Sessions (interactions)
  try {
    const res = await authFetch('/admin/api/sessions');
    if (res.ok) {
      const json = await res.json();
      bundle.interactions = json.data || [];
      totalRecords += bundle.interactions.length;
    }
  } catch { /* continue */ }

  // 2. Calendar events
  try {
    const res = await authFetch('/admin/api/calendar');
    if (res.ok) {
      const json = await res.json();
      bundle.calendar_events = json.data || [];
      totalRecords += bundle.calendar_events.length;
    }
  } catch { /* continue */ }

  // 3. Tasks
  try {
    const res = await authFetch('/admin/api/tasks');
    if (res.ok) {
      const json = await res.json();
      bundle.tasks = json.data || [];
      totalRecords += bundle.tasks.length;
    }
  } catch { /* continue */ }

  // 4. Users (admin only, just metadata)
  try {
    const res = await authFetch('/admin/api/users');
    if (res.ok) {
      const json = await res.json();
      // Strip sensitive fields
      bundle.users = (json.data || []).map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        last_login: u.last_login,
      }));
      totalRecords += bundle.users.length;
    }
  } catch { /* continue */ }

  const exportMeta = {
    exportedAt: new Date().toISOString(),
    exportVersion: '1.0',
    gdprArticle: 'GDPR 20. cikk — Adathordozhatósághoz való jog',
    totalRecords,
    tables: Object.keys(bundle),
    application: 'eaisydesk',
  };

  const fullExport = { _meta: exportMeta, ...bundle };
  const json = JSON.stringify(fullExport, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const filename = `eaisydesk_gdpr_export_${new Date().toISOString().split('T')[0]}.json`;

  return { filename, blob, recordCount: totalRecords };
}

/** Trigger download in browser */
export function downloadBlob(result: ExportResult) {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
