lines = open('web_server.py', encoding='utf-8').readlines()
# Find brand_dna_extractor_prompt definition
for i, l in enumerate(lines):
    if 'brand_dna_extractor_prompt' in l and 'f"""' in l:
        print(f"START at line {i+1}")
        for j in range(i, min(i+3, len(lines))):
            print(f"{j+1}: {lines[j].rstrip()[:100]}")
        break

# Find the end of the prompt (closing triple quote)
in_prompt = False
for i, l in enumerate(lines):
    if 'brand_dna_extractor_prompt' in l and 'f"""' in l:
        in_prompt = True
    if in_prompt and i > 4900:
        if '"""' in l and 'brand_dna_extractor_prompt' not in l:
            print(f"END at line {i+1}: {l.rstrip()[:80]}")
            break
        if 'linguistic_fingerprint' in l:
            print(f"  LF at line {i+1}: {l.rstrip()[:100]}")
