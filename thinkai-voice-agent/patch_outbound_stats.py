import sys
import logging

logger = logging.getLogger(__name__)

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# I want to add the renderOutgoingChart call at the end of the try block in loadOutboundStats
old = '''        if (funnelContainer) {
            if (total === 0) {'''
new = '''        if (data && data.activities) {
            renderOutgoingChart(data.activities);
        } else {
            renderOutgoingChart(null);
        }

        if (funnelContainer) {
            if (total === 0) {'''

content = content.replace(old, new)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

with open('extracted.js', 'r', encoding='utf-8') as f:
    ext_content = f.read()

ext_content = ext_content.replace(old, new)

with open('extracted.js', 'w', encoding='utf-8') as f:
    f.write(ext_content)

print('Done modifying loadOutboundStats')
