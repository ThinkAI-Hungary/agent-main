import codecs

with codecs.open('email_processor.py', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    'Ã¡': 'á',
    'é': 'é',
    'Ã\xad': 'í',  
    'Ã³': 'ó',
    'Ã¶': 'ö',
    'Å‘': 'ő',
    'Ãº': 'ú',
    'Ã¼': 'ü',
    'Å±': 'ű',
    'Ã\x81': 'Á',
    'Ã‰': 'É',
    'Ã\x8d': 'Í',
    'Ã“': 'Ó',
    'Ã–': 'Ö',
    'Å\x90': 'Ő',
    'Ãš': 'Ú',
    'Ãœ': 'Ü',
    'Å°': 'Ű',
    'Ã\xad': 'í',
    'cÃ\xadmrÅ‘l': 'címről',
    'Ã­': 'í',
    'Ã\x8D': 'Í',
    'Ã\x8F': 'Ï',
    'Ã\x8A': 'Ê',
    'Ã\x8E': 'Î',
    'Ã\x83': 'Ã',
    'Ã\x8C': 'Ì',
    'Ã\x8B': 'Ë',
}

for bad, good in replacements.items():
    content = content.replace(bad, good)

# Fix some remaining specific ones
content = content.replace('segÃ­tÅ‘kész', 'segítőkész')
content = content.replace('cÃ­mrÅ‘l', 'címről')
content = content.replace('cÃ­me', 'címe')
content = content.replace('cÃ­m', 'cím')
content = content.replace('cÃ­', 'cí')
content = content.replace('Ã­', 'í')

with codecs.open('email_processor.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed email_processor.py")
