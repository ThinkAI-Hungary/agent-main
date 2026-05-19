import re

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"clientInteractions\.sort\(\(a, b\) => \(b\.date \|\| ''\)\.localeCompare\(a\.date \|\| ''\)\);\s*document\.getElementById\('cd-total-interactions'\)\.innerText = `Összes interakció: \$\{clientInteractions\.length\}`;"

replacement = """clientInteractions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            document.getElementById('cd-total-interactions').innerText = `Összes interakció: ${clientInteractions.length}`;
            
            // Extract and render past appointments
            const appointmentRegex1 = /időpontot foglalt:\\s*(.*?)(?:,|$)/i;
            const appointmentRegex2 = /lefoglalva:.*?,?\\s*(.*?)-kor/i;
            let appointmentsHtml = '';
            
            clientInteractions.forEach(r => {
                const t = (r.type || '').toLowerCase();
                const topic = (r.topic || '').toLowerCase();
                if (t.includes('foglalás') || topic.includes('időpont')) {
                    let aptDate = r.date ? r.date.substring(0, 16).replace('T', ' ') : 'Ismeretlen időpont';
                    
                    const m1 = (r.summary || '').match(appointmentRegex1);
                    if (m1) {
                        aptDate = m1[1];
                    } else {
                        const m2 = (r.result || '').match(appointmentRegex2);
                        if (m2) aptDate = m2[1];
                    }
                    
                    appointmentsHtml += `<div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#4b5563;">
                      <svg fill="none" height="14" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      ${aptDate}
                    </div>`;
                }
            });
            
            const aptContainer = document.getElementById('cd-appointments');
            if (aptContainer) {
                if (appointmentsHtml === '') {
                    aptContainer.innerHTML = '<div style="font-size:13px; color:#9ca3af; font-style:italic;">Nincs korábbi foglalás.</div>';
                } else {
                    aptContainer.innerHTML = appointmentsHtml;
                }
            }"""

if re.search(target, content):
    content = re.sub(target, replacement.replace('\\', '\\\\'), content)
    with open('admin.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Appointments dynamic logic inserted successfully.')
else:
    print('Target string not found in admin.html.')
