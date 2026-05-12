import pandas as pd
import requests

# Create a dummy Excel file matching user's screenshot
data = {
    "Kategória": ["Konzultáció", "Diagnosztika"],
    "Szolgáltatás megnevezése": ["Szakorvosi állapotfelmérés", "Digitális röntgen"],
    "Ár": [15000, 12000],
    "Pénznem": ["HUF", "HUF"],
    "Megjegyzés": ["Tartalmazza a szűrővizsgálatot", "Kiadható CD-n"]
}
df = pd.DataFrame(data)
df.to_excel("test_upload.xlsx", index=False)

# Log in to get token (assuming admin/admin)
res = requests.post("http://localhost:8000/admin/api/login", json={"username": "admin", "password": "password"})
if res.status_code != 200:
    res = requests.post("http://localhost:8000/admin/api/login", json={"username": "admin", "password": "admin"})
token = res.json().get("access_token")

# Upload the file
headers = {"Authorization": f"Bearer {token}"}
with open("test_upload.xlsx", "rb") as f:
    files = {"file": ("test_upload.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res = requests.post("http://localhost:8000/admin/api/upload_prices", headers=headers, files=files)

print("Status:", res.status_code)
print("Response:", res.text)
