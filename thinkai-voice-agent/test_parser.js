const fs = require('fs');

const data = JSON.parse(fs.readFileSync('custom_data_test.json', 'utf8'));
const t = data.beszelgetes_naplo;

const lines = t.split('\n');

let blocks = [];
let currentSender = 'system';
let currentBlock = [];

for (let line of lines) {
    line = line.trim();
    if (!line && currentSender !== 'ai') continue; // keep empty lines for AI emails formatting if needed, but actually trim is fine if we just want readable text. Let's keep empty lines!
    
    // Better logic: don't trim completely before checking, but for regex it's fine
    if (line.match(/^\[\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}\]/) || line.match(/^\[\d{4}-\d{2}-\d{2}\]/)) {
        if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });
        currentSender = 'system';
        currentBlock = [line];
    } else if (line.match(/^- Bejövő e-mail/i) || line.startsWith('Ügyfél')) {
        if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });
        currentSender = 'user';
        currentBlock = [line.replace(/^Ügyfél.*?:\\s*/, '').replace(/^- Bejövő e-mail.*?:\s*/i, '')];
    } else if (line.match(/^Bégé Design Kft.*?ezt írta/i) || line.startsWith('AI Válasz')) {
        if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });
        currentSender = 'ai';
        // We skip this specific line if it's just "Bégé Design Kft... ezt írta:"
        let cleanLine = line.replace(/^AI Válasz.*?:\\s*/, '').replace(/^Bégé Design Kft.*?:\s*/i, '');
        if (cleanLine.trim() !== '') currentBlock = [cleanLine];
        else currentBlock = [];
    } else {
        // Continue current block
        let cleanLine = line;
        if (currentSender === 'ai' && cleanLine.startsWith('>')) {
            cleanLine = cleanLine.substring(1);
            if (cleanLine.startsWith(' ')) cleanLine = cleanLine.substring(1);
        }
        currentBlock.push(cleanLine);
    }
}
if (currentBlock.length > 0) blocks.push({ sender: currentSender, content: currentBlock.join('\n') });

// Filter empty blocks and trim
blocks = blocks.map(b => ({ sender: b.sender, content: b.content.trim() })).filter(b => b.content !== '');

console.log(JSON.stringify(blocks, null, 2));
