import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

content = content.replace('<div id="urgent-bell-wrapper" style="position:fixed; top:24px; right:32px; z-index:100;">', '<div id="urgent-bell-wrapper" style="position:fixed; top:24px; right:32px; z-index:100; display:flex; flex-direction:column; align-items:flex-end;">')

content = content.replace('<div id="urgent-bell-container" title="Sürgős esetek" onclick="toggleUrgentDropdown()" style="cursor:pointer; background:var(--bg3); border:1px solid var(--border); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); transition:all 0.2s;">', '<div id="urgent-bell-container" title="Sürgős esetek" onclick="toggleUrgentDropdown()" style="position:relative; cursor:pointer; background:var(--bg3); border:1px solid var(--border); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); transition:all 0.2s;">')

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print('Fixed CSS layout!')
