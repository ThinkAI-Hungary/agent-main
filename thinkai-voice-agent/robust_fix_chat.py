import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

replacement = """function openLogModal(encodedText, name, channel, date, encodedCustomObj) {
      let t = '';
      try { t = decodeURIComponent(atob(encodedText)); } catch (e) { }
      
      let cData = {};
      if (encodedCustomObj) {
          try { cData = JSON.parse(decodeURIComponent(atob(encodedCustomObj))); } catch(e) {}
      }

      if (name) document.getElementById('log-modal-title-name').textContent = name;
      if (channel) document.getElementById('log-modal-channel').textContent = channel;
      if (date) document.getElementById('log-modal-date').textContent = date;
      document.getElementById('log-modal-topic').textContent = 'Interakciós összefoglaló';
      
      // Összefoglaló frissítése
      const summaryBox = document.getElementById('log-modal-summary');
      if (summaryBox) {
          summaryBox.textContent = cData.problem_description || 'Az asszisztens a beszélgetés során rögzítette a felhasználó igényeit és lefoglalt egy időpontot.';
      }

      // Valós Eredmény adatok megjelenítése
      const resContainer = document.getElementById('log-modal-result-box');
      if (resContainer) {
          document.getElementById('lm-res-date').textContent = cData.booked_datetime || '-';
          document.getElementById('lm-res-service').textContent = cData.service || '-';
          document.getElementById('lm-res-doctor').textContent = cData.doctor || '-';
          document.getElementById('lm-res-reminder').textContent = cData.reminder_sent_at || '-';
      }

      // Chat buborékok generálása
      const chatContainer = document.getElementById('log-modal-chat');
      if (chatContainer) {
          chatContainer.innerHTML = ''; // reset
          const lines = t.split('\\n');
          
          let blocks = [];
          let currentSender = 'system';
          let currentBlock = [];

          for (let line of lines) {
              line = line.trim();
              if (!line && currentSender !== 'ai') continue;
              
              if (line.match(/^\\[\\d{4}-\\d{2}-\\d{2}\\s*\\d{2}:\\d{2}\\]/) || line.match(/^\\[\\d{4}-\\d{2}-\\d{2}\\]/)) {
                  if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\\n') });
                  currentSender = 'system';
                  currentBlock = [line];
              } else if (line.match(/^- Bejövő e-mail/i) || line.startsWith('Ügyfél')) {
                  if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\\n') });
                  currentSender = 'user';
                  currentBlock = [line.replace(/^Ügyfél.*?:\\s*/, '').replace(/^- Bejövő e-mail.*?\\):\\s*/i, '').trim()];
              } else if (line.match(/^Bégé Design Kft.*?ezt írta/i) || line.startsWith('AI Válasz')) {
                  if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\\n') });
                  currentSender = 'ai';
                  let cleanLine = line.replace(/^AI Válasz.*?:\\s*/, '').replace(/^Bégé Design Kft.*?:\\s*/i, '').replace(/ezt írta.*?:\\s*$/i, '');
                  if (cleanLine.trim() !== '') currentBlock = [cleanLine.trim()];
                  else currentBlock = [];
              } else {
                  let cleanLine = line;
                  if (currentSender === 'ai' && cleanLine.startsWith('>')) {
                      cleanLine = cleanLine.substring(1);
                      if (cleanLine.startsWith(' ')) cleanLine = cleanLine.substring(1);
                  }
                  currentBlock.push(cleanLine);
              }
          }
          if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\\n') });

          blocks = blocks.map(b => ({ sender: b.sender, content: b.content.trim() })).filter(b => b.content !== '');
          
          blocks.forEach(msg => {
              if (msg.sender === 'system') {
                  chatContainer.appendChild(createSystemBubble(msg.content));
              } else {
                  chatContainer.appendChild(createChatBubble(msg.sender, msg.content));
              }
          });
          
          if (chatContainer.children.length === 0) {
              chatContainer.innerHTML = `<div style="color:var(--text-muted);font-style:italic;padding:12px;">A beszélgetés szövege nem értelmezhető formátumú, vagy üres.</div>`;
          }
      }
      
      document.getElementById('log-modal').style.display = 'flex';
      // Alapból rejtve a teljes beszélgetés
      document.getElementById('log-modal-chat-container').style.display = 'none';
      const toggleBtn = document.getElementById('log-modal-toggle-btn');
      if (toggleBtn) {
          toggleBtn.innerHTML = `<span style="margin-right:6px;">↓</span> Interakció megtekintése`;
      }
    }

    function createSystemBubble(content) {
        const div = document.createElement('div');
        div.style.textAlign = 'center';
        div.style.margin = '16px 0';
        div.style.fontSize = '11.5px';
        div.style.color = 'var(--text-muted)';
        div.style.fontWeight = '500';
        div.style.fontStyle = 'italic';
        div.style.padding = '4px 16px';
        div.style.background = 'rgba(0,0,0,0.03)';
        div.style.borderRadius = '8px';
        div.textContent = content;
        return div;
    }

    function createChatBubble"""

start_idx = html.find('function openLogModal')
end_idx = html.find('function createChatBubble')

if start_idx != -1 and end_idx != -1:
    html = html[:start_idx] + replacement + html[end_idx:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Replace done!")
else:
    print("Could not find boundaries")
