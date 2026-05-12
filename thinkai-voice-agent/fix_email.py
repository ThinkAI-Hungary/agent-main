import re

with open('email_processor.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix HTML instructions
text = re.sub(r'\"email_reply\": \".*?\",', '\"email_reply\": \"A pontos válaszlevél szövege (TILOS HTML TAGEKET HASZNÁLNI! Listákhoz kötőjelet, sortöréshez \\\\n-t használj)\",', text)

# Fix mojibake Bejövo e-mail
text = re.sub(r'summary=f\"Bejöv.*? e-mail \{from_email\} címr.*?l\",', 'summary=f\"Bejövő e-mail {from_email} címről\",', text)

with open('email_processor.py', 'w', encoding='utf-8') as f:
    f.write(text)
print('Kész!')
