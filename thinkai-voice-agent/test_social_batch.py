import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import urllib.request
import json

# Load the latest audit result
with open('latest_audit_result.json', encoding='utf-8') as f:
    audit = json.load(f)

print(f"Audit loaded: {audit.get('url', '?')}")
print(f"Business: {audit.get('content', {}).get('business_category', '?')}")
print()

payload = json.dumps({'audit': audit}).encode()
req = urllib.request.Request(
    'http://localhost:8000/marketing/api/zombo/social-batch',
    data=payload,
    headers={'Content-Type': 'application/json', 'Accept': 'text/event-stream'},
    method='POST'
)

resp = urllib.request.urlopen(req, timeout=60)
print(f"HTTP STATUS: {resp.status}")
print("--- SSE Events (first 4) ---")

count = 0
buf = b''
while count < 4:
    chunk = resp.read(1024)
    if not chunk:
        break
    buf += chunk
    lines = buf.split(b'\n\n')
    buf = lines[-1]
    for line in lines[:-1]:
        text = line.decode('utf-8', errors='replace').strip()
        if text.startswith('data:'):
            try:
                ev = json.loads(text[5:])
                etype = ev.get('type', '?')
                msg = ev.get('message', '')
                if etype == 'visual_strategy':
                    strat = ev.get('strategy', {})
                    print(f"[{etype}] Business: {strat.get('business_understood', '')[:100]}")
                    print(f"          allow_hands={strat.get('allow_hands')}, style={strat.get('photography_style')}")
                    print(f"          subjects: {strat.get('visual_subjects', [])[:3]}")
                    print(f"          negations: {strat.get('flux_negations', [])[:5]}")
                else:
                    print(f"[{etype}] {msg[:120]}")
                count += 1
                if count >= 4:
                    break
            except Exception as e:
                print(f"Parse error: {e} | raw: {text[:80]}")

print()
print("Test complete — endpoint is working!")
