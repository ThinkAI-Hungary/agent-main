"""Test what colors the CSS extraction produces for piktor.hu."""
import requests
from bs4 import BeautifulSoup
import re
from collections import Counter
from urllib.parse import urljoin
import colorsys

resp = requests.get('https://piktor.hu', timeout=10)
html = resp.text
soup = BeautifulSoup(html, 'lxml')

# Extract CSS text
styles_text = []
for tag in soup.find_all(style=True):
    styles_text.append(tag['style'])
for tag in soup.find_all('style'):
    styles_text.append(tag.string or '')

# External CSS
css_links = []
for link_tag in soup.find_all('link', rel=lambda x: x and 'stylesheet' in x):
    href = link_tag.get('href', '')
    if href and not href.startswith('data:'):
        css_links.append(urljoin('https://piktor.hu', href))

print(f"Found {len(css_links)} external CSS files:")
for url in css_links:
    print(f"  {url}")

for css_url in css_links[:3]:
    try:
        css_resp = requests.get(css_url, timeout=5)
        if css_resp.status_code == 200 and len(css_resp.text) < 500000:
            styles_text.append(css_resp.text)
            print(f"  Loaded: {css_url} ({len(css_resp.text)} bytes)")
    except:
        pass

full_style_content = " ".join(styles_text)
print(f"\nTotal style text length: {len(full_style_content)} chars")

# Extract colors
standardized_colors = []
for h in re.findall(r'#(?:[0-9a-fA-F]{3}){1,2}\b', full_style_content):
    h = h.lower()
    if len(h) == 4:
        h = '#' + ''.join([c*2 for c in h[1:]])
    standardized_colors.append(h)

for rgb in re.findall(r'rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d\.]+)?\s*\)', full_style_content):
    nums = re.findall(r'\d+', rgb)
    if len(nums) >= 3:
        r, g, b = int(nums[0]), int(nums[1]), int(nums[2])
        hex_val = f"#{r:02x}{g:02x}{b:02x}"
        standardized_colors.append(hex_val)

# SVG
for tag in soup.find_all(['svg', 'path', 'rect', 'circle', 'polygon', 'line', 'g', 'use', 'ellipse']):
    for attr in ['fill', 'stroke', 'stop-color']:
        val = tag.get(attr, '')
        if val and val != 'none' and val != 'currentColor' and val.startswith('#'):
            h = val.lower()
            if len(h) == 4:
                h = '#' + ''.join([c*2 for c in h[1:]])
            if len(h) == 7:
                standardized_colors.append(h)

color_counts = Counter(standardized_colors)
total_cols = len(standardized_colors)
print(f"\nTotal color instances: {total_cols}")
print(f"Unique colors: {len(color_counts)}")

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    if len(hex_str) == 6:
        try:
            return int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16)
        except ValueError:
            return None
    return None

def hex_distance(h1, h2):
    r1 = hex_to_rgb(h1)
    r2 = hex_to_rgb(h2)
    if not r1 or not r2: return 999
    return sum(abs(a - b) for a, b in zip(r1, r2))

print(f"\n=== All colors above 5% ===")
for col, count in color_counts.most_common():
    pct = (count / total_cols) * 100
    if pct >= 5:
        print(f"  {col}: {count} ({pct:.1f}%)")

print(f"\n=== All colors (no threshold, deduplicated) ===")
deduped = []
for col, count in color_counts.most_common():
    is_dup = False
    for existing, _ in deduped:
        if hex_distance(col, existing) < 30:
            is_dup = True
            break
    if not is_dup:
        deduped.append((col, count))

print(f"Deduplicated count: {len(deduped)}")
for col, count in deduped:
    pct = (count / total_cols) * 100
    print(f"  {col}: {count} ({pct:.1f}%)")
