import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

# 1. Add the label HTML
old_html = """        <div class="approvals-grid" id="approvals-grid">"""
new_html = """        <div id="approval-count-label" style="text-align: right; margin-bottom: 12px; font-size: 13px; color: var(--text-muted); font-weight: 600;">0 megjelenítve</div>
        <div class="approvals-grid" id="approvals-grid">"""

if '<div id="approval-count-label"' not in content:
    content = content.replace(old_html, new_html)

# 2. Add the JS update logic
old_js = """        if (filteredItems.length === 0) {"""
new_js = """        const countLabel = document.getElementById('approval-count-label');
        if (countLabel) {
           countLabel.innerText = `${filteredItems.length} megjelenítve`;
        }
        
        if (filteredItems.length === 0) {"""

content = content.replace(old_js, new_js)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
