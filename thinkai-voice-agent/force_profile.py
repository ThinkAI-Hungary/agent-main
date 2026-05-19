with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace onclick
old_onclick = "onclick=\"alert('Gomb megnyomva!'); editClientProfile();\""
new_onclick = 'onclick="forceOpenProfile()"'
content = content.replace(old_onclick, new_onclick)

new_script = """
<script>
window.forceOpenProfile = function() {
    alert("Új script fut!");
    const data = window.currentClientDataForLog;
    if (!data) {
        alert("Nincs kiválasztva ügyfél.");
        return;
    }
    
    document.getElementById('edit-profile-name').value = data.name || '';
    document.getElementById('edit-profile-phone').value = data.phone || '';
    document.getElementById('edit-profile-email').value = data.email || '';
    
    let notes = '';
    if (data.custom_data && data.custom_data.notes) {
        notes = data.custom_data.notes;
    }
    document.getElementById('edit-profile-notes').value = notes;
    
    document.getElementById('edit-profile-modal').style.display = 'flex';
};
</script>
"""

content = content.replace('</body>', new_script + '\n</body>')

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("forceOpenProfile injected")
