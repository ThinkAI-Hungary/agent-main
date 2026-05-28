"""
Migrate admin_users table: add role, created_by, last_login columns.
Run this script once from Supabase Dashboard SQL Editor, or use this script
if SUPABASE_KEY is a service_role key.

If columns can't be added via API (anon key), the script will print the SQL
to run manually in Supabase Dashboard.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

THIS_DIR = Path(__file__).resolve().parent
load_dotenv(THIS_DIR / ".env")

MIGRATION_SQL = """
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
UPDATE admin_users SET role = 'admin', created_by = 'system' WHERE role IS NULL;
"""

def run_migration():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("❌ SUPABASE_URL or SUPABASE_KEY not found in .env")
        return
    
    # Try using httpx to run SQL via management API
    try:
        import httpx
        # Try the SQL endpoint (works with service_role key)
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        
        # Try pgrest health check first
        resp = httpx.get(f"{url}/rest/v1/admin_users?select=role&limit=1", headers=headers, timeout=10)
        
        if resp.status_code == 200:
            print("✅ 'role' column already exists!")
            return
        
        if "does not exist" in resp.text:
            print("⚠️  'role' column does not exist yet.")
            print("")
            print("=" * 60)
            print("FUTTATSD EZT AZ SQL-T A SUPABASE DASHBOARD SQL EDITOR-BAN:")
            print("=" * 60)
            print(MIGRATION_SQL)
            print("=" * 60)
            print("")
            print("URL: https://supabase.com/dashboard → SQL Editor → New Query")
    except Exception as e:
        print(f"Error: {e}")
        print("\nFuttatsd manuálisan:")
        print(MIGRATION_SQL)

if __name__ == "__main__":
    run_migration()
