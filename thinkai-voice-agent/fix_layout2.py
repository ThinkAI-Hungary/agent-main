import codecs
import re

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

search_str = '    </div>\r\n    <div id="urgent-toast-container"'
replace_str = '''      </div>\r\n      <div id="urgent-dropdown" style="display:none; position:absolute; top:54px; right:0; width:300px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); max-height:400px; overflow-y:auto; flex-direction:column;">\r\n        <div style="padding:12px 16px; border-bottom:1px solid var(--border); font-weight:600; font-size:14px; color:var(--text);">Sürgős riasztások</div>\r\n        <div id="urgent-dropdown-list" style="display:flex; flex-direction:column;">\r\n          <!-- List items will be injected here -->\r\n        </div>\r\n      </div>\r\n    </div>\r\n    <div id="urgent-toast-container"'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    print('Fixed layout!')
else:
    print('Still not found!')

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
