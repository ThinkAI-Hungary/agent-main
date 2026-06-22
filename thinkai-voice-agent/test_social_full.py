import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import urllib.request
import json

with open('latest_audit_result.json', encoding='utf-8') as f:
    audit = json.load(f)

payload = json.dumps({'audit': audit}).encode()
req = urllib.request.Request(
    'http://localhost:8000/marketing/api/zombo/social-batch',
    data=payload,
    headers={'Content-Type': 'application/json', 'Accept': 'text/event-stream'},
    method='POST'
)

resp = urllib.request.urlopen(req, timeout=300)
print(f"HTTP STATUS: {resp.status}\n")

results = []
visual_strategy = {}
buf = b''
done = False

while not done:
    chunk = resp.read(2048)
    if not chunk:
        break
    buf += chunk
    lines = buf.split(b'\n\n')
    buf = lines[-1]
    for line in lines[:-1]:
        text = line.decode('utf-8', errors='replace').strip()
        if not text.startswith('data:'):
            continue
        try:
            ev = json.loads(text[5:])
            etype = ev.get('type', '?')
            msg = ev.get('message', '')

            if etype == 'status':
                print(f"[STATUS] {msg}")

            elif etype == 'visual_strategy':
                visual_strategy = ev.get('strategy', {})
                print(f"\n=== VISUAL STRATEGY ===")
                print(f"Business: {visual_strategy.get('business_understood', '')}")
                print(f"Style: {visual_strategy.get('photography_style')}")
                print(f"Lighting: {visual_strategy.get('lighting')}")
                print(f"Mood: {visual_strategy.get('mood')}")
                print(f"Allow hands: {visual_strategy.get('allow_hands')}")
                print(f"Allow silhouettes: {visual_strategy.get('allow_human_silhouettes')}")
                print(f"Subjects: {visual_strategy.get('visual_subjects', [])}")
                print(f"Negations: {visual_strategy.get('flux_negations', [])}")
                print(f"Good example: {visual_strategy.get('good_prompt_example', '')}")
                print()

            elif etype == 'item_complete':
                item = ev.get('item', {})
                results.append(item)
                idx = item.get('index', 0)
                print(f"\n--- POST #{idx+1} [{item.get('content_type','')}] ---")
                print(f"TEXT: {item.get('post_text','')}")
                print(f"IMAGE PROMPT: {item.get('image_prompt','')}")
                print(f"IMAGE URL: {'OK' if item.get('image_url') else 'NO IMAGE'}")

            elif etype == 'item_start':
                print(f"  > Generating [{ev.get('index',0)+1}/10] {ev.get('content_type','')}")

            elif etype == 'complete':
                print(f"\n\n=== COMPLETE: {len(ev.get('results',[]))} posts ===")
                done = True

            elif etype == 'error':
                print(f"[ERROR] {msg}")
                done = True

        except Exception as e:
            pass

print(f"\n\nTotal results captured: {len(results)}")
