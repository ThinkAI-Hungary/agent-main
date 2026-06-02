import codecs
import re

with codecs.open('email_processor.py', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    'Ã¡': 'á',
    'é': 'é',
    'Ã\xad': 'í',  # ad is í in cp1252 but actually the utf8 is c3 ad
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
}

# The actual mojibake for í might be Ã\xad
# Let's just use cp1252 decode for the whole file? No, mixed is hard.
# Let's do the decode logic for all Ã.. characters:
import sys

def fix_mojibake(match):
    try:
        # Try to encode as cp1252, then decode as utf8
        return match.group(0).encode('cp1252').decode('utf-8')
    except:
        return match.group(0)

# Regex to match potential mojibake sequences
# Usually they start with Ã (c3) or Å (c5) followed by some character in the range 128-191
pattern = re.compile(r'[ÃÅ][\x80-\xbf\x90-\x9f\xad\xa1-\xbfa-zA-Z0-9\x91\x92\x93\x94\x81\x8d\x8f\x90\x9d\'\"]+')
# Actually, the simplest is to just manually replace the ones we know are there, or just use a full file convert.
# If the file has a mix of valid UTF-8 and mojibake, ftfy could help, but we don't have it.
