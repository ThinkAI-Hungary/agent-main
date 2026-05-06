# -*- coding: utf-8 -*-
import os

files = ['database.py', 'admin.html', 'extracted.js']
for file in files:
    with open(file, 'r', encoding='utf-8', errors='replace') as f:
        c = f.read()
    
    # Replace the \ufffd variants
    c = c.replace('Emlkeztet', 'Emlékeztető')
    c = c.replace('Visszahvs', 'Visszahívás')
    c = c.replace('Utnkvets', 'Utánkövetés')
    c = c.replace('Kampny', 'Kampány')
    c = c.replace('Passzv', 'Passzív')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(c)
print('Done replacing.')
