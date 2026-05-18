import database as db

# get a client id
clients = db.get_clients()
if clients:
    cid = clients[0]['id']
    print(f"Trying to delete {cid}")
    res = db.delete_client(cid)
    print("Delete result:", res)
else:
    print("No clients")
