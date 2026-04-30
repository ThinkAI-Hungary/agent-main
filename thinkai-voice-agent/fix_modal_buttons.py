import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Fix Modal Title (Remove SVG and align left)
old_title = """        <h3 class="modal-title" style="font-size: 20px; margin: 0; display: flex; align-items: center;">
          <svg fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24" style="width: 24px; height: 24px; margin-right: 12px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg> Üzenet jóváhagyása
        </h3>"""

new_title = """        <h3 class="modal-title" style="font-size: 22px; font-weight: 700; margin: 0; display: flex; align-items: center; color: #0f172a;">Üzenet jóváhagyása</h3>"""

content = content.replace(old_title, new_title)


# 2. Fix Modal Buttons
old_buttons = """        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-secondary" onclick="submitApproval('reject')" id="btn-approval-reject" style="padding: 10px 24px; font-weight: 600;"><i class="fa-solid fa-xmark" style="margin-right: 6px;"></i> Elutasítás</button>
          <button class="btn btn-primary" onclick="submitApproval('approve')" id="btn-approval-approve" style="padding: 10px 24px; font-weight: 600;"><i class="fa-solid fa-paper-plane" style="margin-right: 6px;"></i> Jóváhagyás és Küldés</button>
        </div>"""

new_buttons = """        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button onclick="submitApproval('reject')" id="btn-approval-reject" style="background: #ef4444; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width: 16px; height: 16px; margin-right: 8px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
            </svg> Elutasítás
          </button>
          
          <button onclick="submitApproval('approve')" id="btn-approval-approve" style="background: linear-gradient(135deg, #1ceee0, #0bbdb1); color: #082432; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; box-shadow: 0 4px 16px rgba(28,238,224,0.3);" onmouseover="this.style.filter='brightness(1.05)'" onmouseout="this.style.filter='brightness(1)'">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 16px; height: 16px; margin-right: 8px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
            </svg> Jóváhagyás és Küldés
          </button>
        </div>"""

content = content.replace(old_buttons, new_buttons)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
