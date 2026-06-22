import json
with open('zombo_audit_history.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(f"Total entries: {len(data)}")
for i, e in enumerate(data):
    url = e.get("url", "?")
    score = e.get("seo", {}).get("score")
    h1 = e.get("seo", {}).get("h1_count")
    dd_count = len(e.get("seo", {}).get("deductions_detail", []))
    keys = list(e.keys())
    print(f"  [{i}] url={url}, score={score}, h1={h1}, dd={dd_count}, keys={keys}")
    if dd_count > 0:
        d0 = e["seo"]["deductions_detail"][0]
        print(f"       First dd keys: {list(d0.keys())}")
        print(f"       First dd: criterion={repr(d0.get('criterion'))}, points={repr(d0.get('points'))}")
