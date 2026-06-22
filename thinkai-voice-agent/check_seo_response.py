import json
with open('zombo_audit_history.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Get the last entry with actual data
last = data[-1]
result = last.get("result", {})
seo = result.get("seo", {})
print(f"URL: {last.get('url')}")
print(f"Score: {seo.get('score')}")
print(f"H1 Count: {seo.get('h1_count')}")
print(f"H1 Texts: {seo.get('h1_texts')}")

dd = seo.get('deductions_detail', [])
print(f"\nDeductions Detail: {len(dd)} entries")
for i, d in enumerate(dd):
    print(f"\n  [{i}]")
    for k, v in d.items():
        print(f"    {k}: {repr(v)[:150]}")

print(f"\n=== Colors ===")
visuals = result.get('visuals', {})
web_colors = visuals.get('top_colors_detail', [])
img_colors = visuals.get('image_colors', [])
print(f"Website colors: {len(web_colors)}")
for c in web_colors:
    print(f"  {c}")
print(f"Image colors: {len(img_colors)}")
for c in img_colors:
    print(f"  {c}")

print(f"\n=== Contacts ===")
contacts = result.get('contacts', {})
print(json.dumps(contacts, indent=2, ensure_ascii=False)[:1500])

print(f"\n=== Products ===")
products = result.get('products', [])
for p in products:
    print(f"  {p.get('name', 'N/A')} | type={p.get('type', 'N/A')} | brand={p.get('brand', 'N/A')}")
