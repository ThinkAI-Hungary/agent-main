import re
content = open('admin.html', encoding='utf-8').read()

content = re.sub(r'\s*<!-- Action bar -->\s*<div class="tt-action-bar">.*?</div>\s*(?=</div><!-- end praxis content -->)', '\n        ', content, flags=re.DOTALL)
content = re.sub(r'\s*<!-- Action bar -->\s*<div class="tt-action-bar">.*?</div>\s*(?=</div><!-- end szabalyok content -->)', '\n        ', content, flags=re.DOTALL)

open('admin.html', 'w', encoding='utf-8').write(content)
