import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

view_log_func = """
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

    function openClientDetails(clientData) {"""

content = content.replace("    function openClientDetails(clientData) {", view_log_func)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print('Injected viewFullLogForClient!')
