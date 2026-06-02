import io
with open('email_processor.py', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    'Ã¡': 'á', 'é': 'é', 'Ã\xad': 'í', 'Ã³': 'ó', 'Ã¶': 'ö', 'Å‘': 'ő', 'Ãº': 'ú', 'Ã¼': 'ü', 'Å±': 'ű',
    'Ã\x81': 'Á', 'Ã‰': 'É', 'Ã\x8d': 'Í', 'Ã“': 'Ó', 'Ã–': 'Ö', 'Å\x90': 'Ő', 'Ãš': 'Ú', 'Ãœ': 'Ü', 'Å°': 'Ű',
    'cÃ­mrÅ‘l': 'címről', 'Ã­': 'í', 'BejÃ¶vÅ‘': 'Bejövő', 'TÃ¡rgy:': 'Tárgy:', 'íœzenet:': 'Üzenet:',
    'BEJÃ–VŐ': 'BEJÖVŐ', 'Ãœzenet:': 'Üzenet:', 'BejövÅ‘': 'Bejövő', 'sürgÅ‘s': 'sürgős', 'SürgÅ‘s': 'Sürgős',
    'címrÅ‘l': 'címről', 'idÅ‘pont': 'időpont', 'idÅ‘pontot': 'időpontot', 'idÅ‘pontokról': 'időpontokról',
    'késÅ‘bb': 'később', 'ismétlÅ‘dÅ‘': 'ismétlődő', 'KÃ–TELEZŐ': 'KÖTELEZŐ', 'KÃ–TELEZŐEN': 'KÖTELEZŐEN',
    'Ãœgyfél': 'Ügyfél', 'Ã‰rtékeld': 'Értékeld', 'KIZÁRÃ“LAG': 'KIZÁRÓLAG', 'NÃ‰LKÃœL': 'NÉLKÜL',
    'STRUKTÃšRA': 'STRUKTÚRA', 'jarmu_tipusa": "autó / hajó / motor / stb.': 'jarmu_tipusa": "autó / hajó / motor / stb.',
    'törlendÅ‘': 'törlendő', 'KIVÃ‰TEL': 'KIVÉTEL', 'ALÃ“L': 'ALÓL', 'kollég': 'kollég',
    'élÅ‘': 'élő', 'segítÅ‘kész': 'segítőkész', 'bejövÅ‘': 'bejövő', 'figyelÅ‘': 'figyelő',
    'ElérhetÅ‘ség': 'Elérhetőség'
}

for bad, good in replacements.items():
    content = content.replace(bad, good)

with open('email_processor.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixes applied to email_processor.py")
