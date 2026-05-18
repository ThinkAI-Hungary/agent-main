import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_logic = """      // Valós Eredmény adatok megjelenítése
      const resContainer = document.getElementById('log-modal-result-box');
      if (resContainer) {
          document.getElementById('lm-res-date').textContent = cData.booked_datetime || '-';
          document.getElementById('lm-res-service').textContent = cData.service || '-';
          document.getElementById('lm-res-doctor').textContent = cData.doctor || '-';
          document.getElementById('lm-res-reminder').textContent = cData.reminder_sent_at || '-';
      }"""

new_logic = """      // Valós Eredmény adatok megjelenítése
      const resContainer = document.getElementById('log-modal-result-box');
      if (resContainer) {
          let finalDate = cData.booked_datetime || '-';
          let finalService = cData.service || '-';
          let finalDoctor = cData.doctor || '-';
          
          if (finalDate === '-' || !finalDate) {
              // Intelligens regex keresés a szövegben, amely átível az új sorokon is
              let dMatch = t.match(/202\\d[\\s\\S]{5,40}?(?:\\d{1,2}:\\d{2}|\\d{1,2}\\s*óra)/i);
              if (dMatch) {
                  finalDate = dMatch[0].replace(/>\\s*/g, '').replace(/\\n/g, ' ').trim();
              }
          }
          
          if (finalService === '-' || !finalService) {
              let sMatch = t.match(/(általános vizit|általános konzultáció|konzultáció|fogászat|vizit)/i);
              if (sMatch) {
                  finalService = sMatch[0].charAt(0).toUpperCase() + sMatch[0].slice(1);
              }
          }

          document.getElementById('lm-res-date').textContent = finalDate;
          document.getElementById('lm-res-service').textContent = finalService;
          document.getElementById('lm-res-doctor').textContent = finalDoctor;
          document.getElementById('lm-res-reminder').textContent = cData.reminder_sent_at || '-';
      }"""

html = html.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("Fallback added!")
