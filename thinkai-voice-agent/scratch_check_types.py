from database import supabase

res = supabase.table("interactions").select("type").execute()
types = set(r.get("type") for r in res.data)
print("Distinct types in database:")
for t in types:
    print(repr(t))
