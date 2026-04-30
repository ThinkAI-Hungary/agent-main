import codecs
from bs4 import BeautifulSoup

with codecs.open('admin.html', 'r', 'utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
scripts = soup.find_all('script')

with codecs.open('extracted.js', 'w', 'utf-8') as f:
    for s in scripts:
        if s.string:
            f.write(s.string)
            f.write('\n\n')
