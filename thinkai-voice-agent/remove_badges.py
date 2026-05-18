import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/admin.html'
with open(file_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the specific badges using regex to ignore minor spacing differences
pattern = r'<span[^>]*>VISSZATÉRŐ ÜGYFÉL</span>\s*<span[^>]*>LEZÁRT</span>'
html = re.sub(pattern, '', html)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Removed hardcoded badges!")
