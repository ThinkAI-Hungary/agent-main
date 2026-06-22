import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('latest_audit_result.json', encoding='utf-8') as f:
    a = json.load(f)

print("=== FULL SCRAPER_JSON ===")
sj = a.get('scraper_json', '')
print(repr(sj[:500]))

print()
print("=== STATUS field ===")
print(a.get('status', 'MISSING'))

print()
print("=== CONTENT.summary ===")
c = a.get('content', {})
print(c.get('summary', 'MISSING')[:300])

print()
print("=== CONTENT.business_category ===")
print(c.get('business_category', 'MISSING'))

print()
print("=== VISUALS.top_colors ===")
v = a.get('visuals', {})
print(v.get('top_colors', [])[:5])

print()
print("=== CONTACTS ===")
contacts = a.get('contacts', a.get('contact', {}))
print(str(contacts)[:200])
