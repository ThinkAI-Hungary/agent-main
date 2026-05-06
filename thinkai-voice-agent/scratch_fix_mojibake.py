import sys

def fix_mojibake(text):
    # Try to encode as windows-1252 and decode as utf-8
    try:
        return text.encode('windows-1252').decode('utf-8')
    except Exception as e:
        print(f"Error converting: {e}")
        return text

with open('email_processor.py', 'r', encoding='utf-8') as f:
    content = f.read()

fixed = fix_mojibake(content)
if fixed != content:
    with open('email_processor.py', 'w', encoding='utf-8') as f:
        f.write(fixed)
    print("Fixed via windows-1252/utf-8 cycle!")
else:
    # Manual fallback if the cycle fails due to some characters
    print("Cycle failed or unchanged, doing manual replacement...")
    replacements = {
        "Ã‰": "É",
        "Ã“": "Ó",
        "Ãœ": "Ü",
        "Ãš": "Ú",
        "Å‘": "ő",
        "Ã–": "Ö",
        "Ã¡": "á",
        "Ã¶": "ö",
        "Ã¼": "ü",
        "Ã³": "ó",
        "Ãº": "ú",
        "Ã©": "é",
        "Ã": "í", # wait, Ã might be ambiguous. "í" is C3 AD (Ã­)
        "Ã­": "í",
        "Ã¡": "á",
        "Å±": "ű",
        "Å°": "Ű",
    }
    for bad, good in replacements.items():
        content = content.replace(bad, good)
    with open('email_processor.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Manual replacement done.")
