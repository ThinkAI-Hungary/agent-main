import codecs

with codecs.open('admin.html', 'r', 'utf-8') as f:
    content = f.read()

old_logic = """        const clientsPage = document.getElementById('page-clients');
        if (clientsPage && clientsPage.classList.contains('active')) {
          loadClientsTable();
        }"""

new_logic = """        const clientsPage = document.getElementById('view-clients');
        if (clientsPage && clientsPage.style.display !== 'none') {
          loadClientsTable();
        }"""

content = content.replace(old_logic, new_logic)

with codecs.open('admin.html', 'w', 'utf-8') as f:
    f.write(content)
