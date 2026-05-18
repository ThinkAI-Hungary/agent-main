import re

file_path = 'c:/Users/dani pc xd/Desktop/Projectek/agent-main/thinkai-voice-agent/web_server.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_str = "html_body = f'<div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">{final_text.replace(chr(10), \"<br>\")}</div>'"
new_str = "html_body = f'<div style=\"font-family: Arial, sans-serif;\">{final_text.replace(chr(10), \"<br>\")}</div>'"

if old_str in content:
    content = content.replace(old_str, new_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Email alignment fixed!")
else:
    print("Could not find the string in web_server.py")
