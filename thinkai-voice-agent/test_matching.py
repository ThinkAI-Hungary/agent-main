import json
import re

# Mocking JavaScript cleanStr function
def clean_str(val):
    if not val:
        return ''
    import unicodedata
    # Normalize unicode to strip accents
    normalized = unicodedata.normalize('NFD', str(val))
    stripped = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    return stripped.lower().strip()

def run_test():
    import database as db
    clients = db.get_clients()
    events = db.get_calendar_events()
    
    print(f"Total clients: {len(clients)}")
    print(f"Total events: {len(events)}")
    
    # Let's find Daniel Nagy client
    daniel_client = None
    for c in clients:
        if c.get('id') == 82 or 'daniel' in c.get('name', '').lower():
            daniel_client = c
            break
            
    if not daniel_client:
        print("Daniel Nagy client not found!")
        return
        
    print("\nClient found:")
    print(f"ID: {daniel_client.get('id')}")
    print(f"Name: {daniel_client.get('name')}")
    print(f"Email: {daniel_client.get('email')}")
    print(f"Custom Data: {daniel_client.get('custom_data')}")
    
    # Emulate openClientDetails enrichment
    client_data = {
        'id': daniel_client.get('id'),
        'name': daniel_client.get('name'),
        'email': daniel_client.get('email'),
        'phone': daniel_client.get('phone'),
        'custom_data': daniel_client.get('custom_data')
    }
    
    if isinstance(client_data['custom_data'], str):
        try:
            client_data['custom_data'] = json.loads(client_data['custom_data'])
        except Exception as e:
            client_data['custom_data'] = {}
            
    if client_data['custom_data']:
        cd = client_data['custom_data']
        realName = cd.get('name') or cd.get('Name') or cd.get('nev') or cd.get('név') or cd.get('Név')
        realEmail = cd.get('email') or cd.get('Email')
        realPhone = cd.get('telefonszam') or cd.get('phone') or cd.get('telefon')
        
        if realName: client_data['name'] = realName
        if realEmail: client_data['email'] = realEmail
        if realPhone: client_data['phone'] = realPhone

    print("\nEnriched Client Data:")
    print(f"Name: {client_data['name']}")
    print(f"Email: {client_data['email']}")
    
    # Run the matching loop as done in admin.html
    matches = []
    for ev in events:
        clean_client_email = clean_str(client_data.get('email'))
        clean_client_name = clean_str(client_data.get('name'))
        clean_ev_email = clean_str(ev.get('attendee_email'))
        clean_ev_attendee = clean_str(ev.get('attendee'))
        
        match_email = bool(clean_client_email and clean_ev_email and clean_client_email == clean_ev_email)
        match_name = bool(clean_client_name and clean_ev_attendee and clean_client_name == clean_ev_attendee)
        
        print(f"\nChecking event ID {ev.get('id')}: '{ev.get('title')}'")
        print(f"  Attendee: '{ev.get('attendee')}' -> clean: '{clean_ev_attendee}'")
        print(f"  Email: '{ev.get('attendee_email')}' -> clean: '{clean_ev_email}'")
        print(f"  Match Email: {match_email}, Match Name: {match_name}")
        
        if match_email or match_name:
            matches.append(ev)
            
    print(f"\nMatched events count: {len(matches)}")
    for m in matches:
        print(f"  - {m.get('title')} at {m.get('start_dt')}")

if __name__ == '__main__':
    run_test()
