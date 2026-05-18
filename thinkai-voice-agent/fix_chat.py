import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update the chat parsing and rendering logic in openLogModal
old_chat_logic = """      // Chat buborékok generálása
      const chatContainer = document.getElementById('log-modal-chat');
      if (chatContainer) {
          chatContainer.innerHTML = ''; // reset
          const lines = t.split('\\n');
          let currentMessage = null;
          
          lines.forEach(line => {
              line = line.trim();
              if (!line) return;
              
              const isDateLine = /^\\\[\\d{4}-\\d{2}-\\d{2}\\s*\\d{2}:\\d{2}\\\]$/.test(line) || /^\\\[\\d{4}-\\d{2}-\\d{2}\\\]$/.test(line);
              
              let sender = null;
              let content = line;
              
              if (line.startsWith('Ügyfél')) {
                  sender = 'user';
                  content = line.replace(/^Ügyfél.*?:\\s*/, '');
              } else if (line.startsWith('AI Válasz')) {
                  sender = 'ai';
                  content = line.replace(/^AI Válasz.*?:\\s*/, '');
              }
              
              if (sender) {
                  if (currentMessage) {
                      chatContainer.appendChild(createChatBubble(currentMessage.sender, currentMessage.content));
                  }
                  currentMessage = { sender: sender, content: content };
              } else if (currentMessage && !isDateLine) {
                  currentMessage.content += '\\n' + line;
              } else if (!isDateLine && !currentMessage) {
                  currentMessage = { sender: 'ai', content: line }; // Fallback
              }
          });
          
          if (currentMessage) {
              chatContainer.appendChild(createChatBubble(currentMessage.sender, currentMessage.content));
          }
          
          if (chatContainer.children.length === 0) {
              chatContainer.innerHTML = `<div style="color:var(--text-muted);font-style:italic;padding:12px;">A beszélgetés szövege nem értelmezhető formátumú, vagy üres.</div>`;
          }
      }"""

new_chat_logic = """      // Összefoglaló frissítése
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
      }"""

# Actually, I also need to make sure I don't leave the old `// Valós Eredmény adatok megjelenítése` block duplicating it.
# The original code had:
old_results_logic = """      // Valós Eredmény adatok megjelenítése
      const resContainer = document.getElementById('log-modal-result-box');
      if (resContainer) {
          document.getElementById('lm-res-date').textContent = cData.booked_datetime || 'Nincs foglalás';
          document.getElementById('lm-res-service').textContent = cData.service || '-';
          document.getElementById('lm-res-doctor').textContent = cData.doctor || '-';
          document.getElementById('lm-res-reminder').textContent = cData.reminder_sent_at || '-';
      }"""

html = html.replace(old_results_logic, "")
html = html.replace(old_chat_logic, new_chat_logic)

# Add createSystemBubble if it's missing
system_bubble_def = """    function createSystemBubble(content) {
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
    }"""

if "function createSystemBubble" not in html:
    html = html.replace("function createChatBubble(sender, content) {", system_bubble_def + "\n\n    function createChatBubble(sender, content) {")

# Update the summary box HTML to have an ID
old_summary_html = """<div style="font-size:13px; line-height:1.6; color:var(--text);">
                            Az asszisztens a beszélgetés során rögzítette a felhasználó igényeit és lefoglalt egy időpontot.
                        </div>"""
new_summary_html = """<div id="log-modal-summary" style="font-size:13px; line-height:1.6; color:var(--text);">
                            Az asszisztens a beszélgetés során rögzítette a felhasználó igényeit és lefoglalt egy időpontot.
                        </div>"""
html = html.replace(old_summary_html, new_summary_html)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Updated chat logic and summary box successfully!")
