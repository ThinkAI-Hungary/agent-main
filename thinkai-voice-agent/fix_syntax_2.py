import re

html_file = "admin.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# Fix the broken deleteService code
broken_code = """      .catch(err => {
        console.error(err);
        showToast('error', 'Hiba történt a törléskor');
      });
    })
      .then(res => {
        if (!res.ok) throw new Error('Törlési hiba');
        showToast('success', '🗑️ Szolgáltatás törölve');
        fetchServices();
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

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
