"""
Scrapes piktor.hu fresh and saves the result, then runs download_images.py with good data.
"""
import urllib.request, json, sys, io, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

url = "http://localhost:8000/marketing/api/zombo/scrape"
payload = json.dumps({"url": "https://piktor.hu"}).encode()
req = urllib.request.Request(url, data=payload,
                             headers={"Content-Type": "application/json"}, method="POST")

print("Scraping piktor.hu...")
last_msg = ""
with urllib.request.urlopen(req, timeout=300) as resp:
    print(f"HTTP {resp.status}")
    for raw_line in resp:
        line = raw_line.decode('utf-8', errors='replace').strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
            step = ev.get("step", "")
            msg = ev.get("message", "")
            if step == "progress" and msg != last_msg:
                print(f"  [{step}] {msg[:100]}")
                last_msg = msg
            elif step == "complete":
                print(f"  [COMPLETE] Keys: {list(ev.keys())[:10]}")
            elif step == "error":
                print(f"  [ERROR] {ev}")
        except Exception:
            pass

print("\nScrape done. Checking latest_audit_result.json...")

import os
fname = "latest_audit_result.json"
if os.path.exists(fname):
    mtime = os.path.getmtime(fname)
    import datetime
    print(f"File modified: {datetime.datetime.fromtimestamp(mtime)}")
    with open(fname, encoding='utf-8') as f:
        a = json.load(f)
    bp = a.get('brand_personality', {})
    sj = a.get('scraper_json', '')
    print(f"Title from scraper_json: {json.loads(sj).get('metadata',{}).get('title','?') if sj else 'empty'}")
    print(f"Products: {len(a.get('products',[]))}")
    print(f"Brand archetype: {bp.get('brand_archetype','?')}")
    print(f"Content pillars: {[p.get('name') for p in bp.get('content_pillars',[])]}")
    print(f"Linguistic fingerprint: {'YES' if bp.get('linguistic_fingerprint') else 'NO'}")
