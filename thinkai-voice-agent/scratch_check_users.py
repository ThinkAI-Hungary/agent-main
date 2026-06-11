import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, service_role)

# Use supabase admin api to list users
users_response = supabase.auth.admin.list_users()
print("--- AUTH USERS ---")
for user in users_response:
    print(f"ID: {user.id}, Email: {user.email}, Confirmed: {user.email_confirmed_at}, Last Login: {user.last_sign_in_at}")
