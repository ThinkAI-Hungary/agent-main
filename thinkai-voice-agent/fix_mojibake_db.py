import database as db

def fix_mojibake():
    try:
        # Fetch all interactions where summary contains 'Bejöv'
        res = db.supabase.table("interactions").select("*").ilike("summary", "%Bejöv%").execute()
        for row in res.data:
            summary = row["summary"]
            new_summary = summary.replace("BejövÅ‘", "Bejövő").replace("címrÅ‘l", "címről")
            
            # Extra safety: replace other common mojibake if needed
            if new_summary != summary:
                db.supabase.table("interactions").update({"summary": new_summary}).eq("id", row["id"]).execute()
                print(f"Fixed row {row['id']}: {new_summary}")
        
        # Also check ai_draft_response for HTML tags if we want to fix existing drafts?
        # Maybe not necessary, but good to know it's there.
        
        print("Database mojibake cleanup complete.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_mojibake()
