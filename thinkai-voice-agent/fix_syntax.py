import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# Fix the broken deleteDoctor code
broken_code = """      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Orvos törölve');
        fetchDoctors();
      })
      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }"""

fixed_code = """      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    }"""

content = content.replace(broken_code, fixed_code)

# Let's check if deleteService has the same problem! I didn't see it in err3.txt, it seems I overwrote deleteService correctly. Let me double check if `deleteService` is duplicated or has stray code.
# `deleteService` in err3.txt:
#    function deleteService(srvId, rowElement) {
#      if (!confirm('Biztosan törlöd ezt a szolgáltatást?')) return;
#      authFetch('/admin/api/services/' + srvId, { method: 'DELETE' })
#      .then(res => {
#        if (!res.ok) throw new Error('Törlési hiba');
#        showToast('success', '🗑️ Szolgáltatás törölve');
#        rowElement.remove();
#      })
#      .catch(err => {
#        console.error(err);
#        showToast('error', 'Hiba történt a törléskor');
#      });
#    }
# That looks perfect! No trailing `})`.

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
