import codecs
import re

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Add let viewedUrgentIds = new Set();
content = re.sub(r'(let knownUrgentIds = new Set\(\);)', r'\1\n    let viewedUrgentIds = new Set();', content)

# 2. Add filter to pollUrgentCases
old_poll = r'const data = await res\.json\(\);\s*const urgentClients = data\.urgent_clients \|\| \[\];'
new_poll = 'const data = await res.json();\n        const urgentClients = (data.urgent_clients || []).filter(c => !viewedUrgentIds.has(c.id));'
content = re.sub(old_poll, new_poll, content)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print("Regex replace done!")
