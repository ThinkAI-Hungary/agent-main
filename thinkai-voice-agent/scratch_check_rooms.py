from database import supabase

res = supabase.table("sessions").select("room_name").execute()
rooms = set(r.get("room_name") for r in res.data)
print("Distinct room_names in database:")
for r in rooms:
    print(repr(r))
