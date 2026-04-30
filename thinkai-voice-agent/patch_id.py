import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

content = content.replace("div.className = 'kanban-card';\n            div.draggable = true;", "div.className = 'kanban-card';\n            div.dataset.id = c.id;\n            div.draggable = true;")

old_click = """        let email = '';
        let phone = '';
        const infoDivs = card.querySelectorAll('.client-info');
        infoDivs.forEach(d => {
          if (d.innerText.includes('@')) email = d.innerText.trim();
          else if (d.innerText.trim().length > 0) phone = d.innerText.trim();
        });

        openClientDetails({ name: name, email: email, phone: phone });"""

new_click = """        let email = '';
        let phone = '';
        const infoDivs = card.querySelectorAll('.client-info');
        infoDivs.forEach(d => {
          if (d.innerText.includes('@')) email = d.innerText.trim();
          else if (d.innerText.trim().length > 0) phone = d.innerText.trim();
        });

        let id = card.dataset.id ? parseInt(card.dataset.id) : null;
        openClientDetails({ id: id, name: name, email: email, phone: phone });"""

content = content.replace(old_click, new_click)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
print('Done id patch')
