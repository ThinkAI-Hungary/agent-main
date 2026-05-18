import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_logic = "document.getElementById('lm-res-date').textContent = finalDate;"
new_logic = """
          // Tisztítjuk a dátumot, hogy ne legyenek benne kötőszavak (pl. -re, -ra, órára)
          if (finalDate !== '-') {
              finalDate = finalDate.replace(/-r[ea]\\b/gi, '')
                                   .replace(/órára/gi, '')
                                   .replace(/óra/gi, '')
                                   .replace(/\\s+/g, ' ')
                                   .trim();
          }
          document.getElementById('lm-res-date').textContent = finalDate;"""

if old_logic in html:
    html = html.replace(old_logic, new_logic)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Formatting fixed!")
else:
    print("Could not find logic to replace")
