import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('latest_audit_result.json', encoding='utf-8') as f:
    a = json.load(f)

bp = a.get('brand_personality', {})

print("=== CONTENT PILLARS (from scraper) ===")
for p in bp.get('content_pillars', []):
    name = p.get('name', '?')
    ratio = p.get('ratio', '?')
    desc = p.get('description', '')[:70]
    ex = p.get('example_title', '')[:50]
    print(f"  [{ratio}%] {name}: {desc}")
    print(f"         example: {ex}")

print()
print("=== VISUAL RECIPE (scraper Call 3) ===")
vr = bp.get('visual_recipe', {})
print(json.dumps(vr, ensure_ascii=False, indent=2))

print()
print("=== BRAND_COORDINATES.VISUAL ===")
vc = bp.get('brand_coordinates', {}).get('visual', {})
print(json.dumps(vc, ensure_ascii=False, indent=2))

print()
print("=== DETECTED POSTS (from scraper) ===")
dp = a.get('content', {}).get('detected_posts', [])
print(f"  Count: {len(dp)}")
for p in dp[:3]:
    print(f"  {str(p)[:120]}")

print()
print("=== WORD STYLE ANALYSIS ===")
ws = a.get('content', {}).get('word_style_analysis', '')
print(ws[:400] if ws else 'EMPTY')

print()
print("=== PLATFORM RULES (active only) ===")
pr = bp.get('platform_rules', {})
for plat, rules in pr.items():
    if rules.get('active'):
        fmt = rules.get('preferred_format', '?')
        length = rules.get('optimal_post_length', '?')
        tone = rules.get('tone_modifier', '?')
        print(f"  [{plat}] format={fmt}, length={length}")
        print(f"          tone: {tone}")

print()
print("=== BRAND DONT ===")
bd = bp.get('brand_dont', {})
print("  tone_restrictions:", bd.get('tone_restrictions', []))
print("  content_restrictions:", bd.get('content_restrictions', []))
print("  visual_restrictions:", bd.get('visual_restrictions', []))

print()
print("=== LINGUISTIC FINGERPRINT ===")
lf = bp.get('linguistic_fingerprint', {})
if lf:
    print(json.dumps(lf, ensure_ascii=False, indent=2))
else:
    print("EMPTY — linguistic_fingerprint not yet in this audit (pre-fix)")

print()
print("=== VISUALS ===")
v = a.get('visuals', {})
print("  visual_style_description:", str(v.get('visual_style_description', ''))[:200])
print("  top_colors:", v.get('top_colors', [])[:5])
