"""
Runs the social-batch SSE endpoint, captures all 10 image URLs,
downloads each image to disk, and prints the post text + image prompt.
"""
import urllib.request, json, sys, io, os, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

OUT_DIR = "downloaded_images"
os.makedirs(OUT_DIR, exist_ok=True)

url = "http://localhost:8000/marketing/api/zombo/social-batch"
# Use the latest audit data (whatever is on disk)
with open("latest_audit_result.json", encoding='utf-8') as af:
    audit_data = json.load(af)

payload = json.dumps({"audit": audit_data}).encode()
req = urllib.request.Request(url, data=payload,
                             headers={"Content-Type": "application/json"}, method="POST")

print("Sending social-batch request...")
results = []

with urllib.request.urlopen(req, timeout=300) as resp:
    print(f"HTTP {resp.status}")
    for raw_line in resp:
        line = raw_line.decode('utf-8', errors='replace').strip()
        if not line:
            continue
        if line.startswith("data: "):
            line = line[6:]
        try:
            ev = json.loads(line)
        except Exception:
            continue

        etype = ev.get("type", "")
        if etype == "status":
            print(f"[STATUS] {ev.get('message','')[:80]}")
        elif etype == "item_complete":
            item = ev.get("item", {})
            idx = item.get("index", len(results))
            ct = item.get("content_type", "?")
            text = item.get("post_text", "")
            prompt = item.get("image_prompt", "")
            img_url = item.get("image_url", "")

            print(f"\n--- POST #{idx+1} [{ct}] ---")
            print(f"TEXT: {text[:200]}")
            print(f"PROMPT: {prompt[:200]}")
            print(f"IMG URL: {'SET' if img_url else 'EMPTY'}")

            # Download image
            local_path = ""
            if img_url:
                fname = os.path.join(OUT_DIR, f"post_{idx+1:02d}_{ct}.jpg")
                try:
                    with urllib.request.urlopen(img_url, timeout=30) as ir:
                        img_bytes = ir.read()
                    with open(fname, 'wb') as f:
                        f.write(img_bytes)
                    local_path = fname
                    print(f"SAVED: {fname} ({len(img_bytes)//1024}KB)")
                except Exception as e:
                    print(f"DOWNLOAD ERROR: {e}")

            results.append({
                "index": idx+1,
                "content_type": ct,
                "post_text": text,
                "image_prompt": prompt,
                "image_url": img_url,
                "local_path": local_path
            })
        elif etype == "error":
            print(f"[ERROR] {ev.get('message','')}")
        elif etype == "complete":
            print(f"\n=== DONE: {len(results)} posts ===")

# Save summary
with open(os.path.join(OUT_DIR, "summary.json"), 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\nSaved summary to {OUT_DIR}/summary.json")
