import urllib.request, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

url = "http://localhost:8000/marketing/api/zombo/scrape"
payload = json.dumps({"url": "https://piktor.hu"}).encode()
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")

print("Sending scrape request...")
try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        print(f"Status: {resp.status}")
        lines_read = 0
        while True:
            line = resp.readline()
            if not line:
                break
            decoded = line.decode('utf-8', errors='replace').strip()
            if decoded:
                lines_read += 1
                try:
                    data = json.loads(decoded)
                    step = data.get("step", "")
                    msg = data.get("message", "")
                    if step == "error":
                        print(f"ERROR: {data}")
                    elif step in ("progress", "complete"):
                        print(f"[{step}] {msg[:100]}")
                    elif step == "complete" or "brand_personality" in str(data)[:100]:
                        print(f"[RESULT] Keys: {list(data.keys())[:10]}")
                except Exception as e:
                    print(f"Parse error: {e} | Raw: {decoded[:80]}")
                if lines_read > 50:
                    print("(truncated at 50 lines)")
                    break
except Exception as e:
    print(f"Request error: {e}")
