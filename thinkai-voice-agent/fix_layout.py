import codecs
import re

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# The wrapper was inserted, but not closed.
# The original code had:
#     <!-- ÉRTESÍTÉSI HARANG ÉS TOAST KONTÉNER (SÜRGŐS ESETEK) -->
#     <div id="urgent-bell-wrapper" style="position:fixed; top:24px; right:32px; z-index:100;">
#       <div id="urgent-bell-container" title="Sürgős esetek" ...>
#         <svg ...></svg>
#         <span id="urgent-badge" ...>0</span>
#       </div>
#     <div id="urgent-toast-container" ...

# So currently we have:
#     <div id="urgent-bell-wrapper" style="position:fixed; top:24px; right:32px; z-index:100;">
#       <div id="urgent-bell-container" ...>
#         ...
#         <span id="urgent-badge" ...>0</span>
#       </div>
#     <div id="urgent-toast-container" ...

# I need to insert the dropdown div right after the </div> that closes urgent-bell-container,
# and then close the wrapper </div>.

# Wait, `urgent-bell-container` closing div is right before `urgent-toast-container`.
# Let's search for: `0</span>\n    </div>\n    <div id="urgent-toast-container"`

search_str = '0</span>\n    </div>\n    <div id="urgent-toast-container"'
replace_str = '''0</span>
      </div>
      <div id="urgent-dropdown" style="display:none; position:absolute; top:54px; right:0; width:300px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); max-height:400px; overflow-y:auto; flex-direction:column;">
        <div style="padding:12px 16px; border-bottom:1px solid var(--border); font-weight:600; font-size:14px; color:var(--text);">Sürgős riasztások</div>
        <div id="urgent-dropdown-list" style="display:flex; flex-direction:column;">
          <!-- List items will be injected here -->
        </div>
      </div>
    </div>
    <div id="urgent-toast-container"'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    print("Fixed unclosed wrapper")
else:
    print("Could not find the target string")

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
