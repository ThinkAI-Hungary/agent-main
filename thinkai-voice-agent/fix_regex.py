import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_logic = """          if (finalDate === '-' || !finalDate) {
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
          }"""

new_logic = """          let cleanText = t.replace(/\\[\\d{4}-\\d{2}-\\d{2}\\s*\\d{2}:\\d{2}\\]/g, '');

          if (finalDate === '-' || !finalDate) {
              let dMatch = cleanText.match(/202\\d[\\s\\S]{1,45}?(?:\\d{1,2}:\\d{2}|\\d{1,2}\\s*óra)/i);
              if (dMatch) {
                  finalDate = dMatch[0].replace(/>\\s*/g, '').replace(/\\n/g, ' ').trim();
              }
          }
          
          if (finalService === '-' || !finalService) {
              let sMatch = cleanText.match(/(ultrahangos fogkőeltávolítás|fogkőeltávolítás|általános vizit|általános konzultáció|konzultáció|fogászat|vizit|vizsgálat|kezelés)/i);
              if (sMatch) {
                  finalService = sMatch[0].charAt(0).toUpperCase() + sMatch[0].slice(1);
              }
          }"""

if old_logic in html:
    html = html.replace(old_logic, new_logic)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Fixed!")
else:
    print("Old logic not found!")
