import re

with open("web_server.py", "r", encoding="utf-8") as f:
    content = f.read()

with open("new_process_meta.py", "r", encoding="utf-8") as f:
    new_func = f.read()

# Find the old function
match = re.search(r"async def process_meta_message\(sender_id: str, message_text: str, source_channel: str = \"Messenger\", phone_number_id: str = None\):.*?(?=@app\.post\(\"/api/webhook/meta\"\))", content, re.DOTALL)

if match:
    old_func = match.group(0)
    # The new_func might not have trailing newlines, so add them
    new_content = content.replace(old_func, new_func + "\n\n")
    with open("web_server.py", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Replaced successfully.")
else:
    print("Could not find the function block to replace.")
