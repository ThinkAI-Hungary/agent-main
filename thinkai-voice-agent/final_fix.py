import re
with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the forceOpenProfile script with one without the annoying first alert,
# but with a try-catch that alerts any error, and an alert at the END.
new_script = """
<script>
window.forceOpenProfile = function() {
    try {
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
    } catch (e) {
        alert("Hiba történt: " + e.message);
    }
};
</script>
"""

# Replace the old <script>\nwindow.forceOpenProfile... with the new one
content = re.sub(r'<script>\s*window\.forceOpenProfile = function\(\) \{.*?</script>', new_script.strip(), content, flags=re.DOTALL)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Final fix applied")
