import codecs
import re

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Update the table header
content = re.sub(r'(ÖSSZEFOGLALÓ\s*<\/th>\s*<th[^>]*>\s*EREDMÉNY\s*<\/th>)', r'ÖSSZEFOGLALÓ</th>\n                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border);">NAPLÓ</th>\n                      <th style="padding:16px; font-size:11px; font-weight:600; color:#6b8b99; border-bottom:1px solid var(--border);">EREDMÉNY</th>', content)

# 2. Add the viewFullLogForClient function
view_log_func = """    let lastActiveCustomerView = 'clients';

    async function viewFullLogForClient() {
      const cData = window.currentClientDataForLog;
      if (!cData) return alert('Nincs kiválasztva ügyfél.');
      
      try {
        const res = await authFetch('/admin/api/clients');
        const data = await res.json();
        const client = data.clients.find(c => 
          (cData.id && c.id == cData.id) || 
          (cData.email && c.custom_data && c.custom_data.includes(cData.email)) ||
          (cData.name && c.name && c.name.toLowerCase() === cData.name.toLowerCase())
        );
        if (client && client.custom_data) {
          let customObj = typeof client.custom_data === 'string' ? JSON.parse(client.custom_data) : client.custom_data;
          let log = customObj.beszelgetes_naplo || 'Nincs rögzített beszélgetés napló ehhez az ügyfélhez.';
          openLogModal(btoa(encodeURIComponent(log)), cData.name, 'Rendszer', '');
        } else {
          alert('Nem található részletes napló.');
        }
      } catch (e) {
        console.error(e);
        alert('Hiba a napló lekérésekor.');
      }
    }

    function openClientDetails(clientData) {
      window.currentClientDataForLog = clientData;
"""
content = re.sub(r"let lastActiveCustomerView = 'clients';\s*function openClientDetails\(clientData\) \{", view_log_func, content)

# 4. Update the interaction row map
def row_replacer(match):
    s = match.group(0)
    # replace badge
    s = s.replace('<div style="display:inline-block;background:#ef4444;color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-bottom:4px;box-shadow:0 1px 2px rgba(239,68,68,0.4);">🚨 SÜRGŐS</div>', '<div onclick="viewFullLogForClient()" style="display:inline-block;background:#ef4444;color:white;font-size:10px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-bottom:4px;box-shadow:0 1px 2px rgba(239,68,68,0.4);cursor:pointer;" title="Kattints az e-mail megtekintéséhez!">🚨 SÜRGŐS</div>')
    # add log button before result
    s = re.sub(r'(<td[^>]*>\$\{esc\(r\.summary\)\}<\/td>\s*)(<td[^>]*>\$\{resultBadge\(r\.result\)\}<\/td>)', r'\1<td style="padding:16px; border-bottom:1px solid var(--border); font-size:13px;"><button onclick="viewFullLogForClient()" style="background:rgba(0,212,200,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;">Megtekintés</button></td>\n                  \2', s)
    return s

content = re.sub(r'let alertBadge = isUrgent \?[\s\S]*?\$\{resultBadge\(r\.result\)\}<\/td>\s*<\/tr>', row_replacer, content)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print("Done Regex Replace")
