import os

def modify_web_server():
    with open('web_server.py', 'r', encoding='utf-8') as f:
        content = f.read()
        
    old_stats = """@app.get("/admin/api/stats")
def admin_stats(period: str = "month", username: str = Depends(verify_jwt)):
    \"\"\"Analytics summary stats.\"\"\"
    return db.get_stats(period=period)"""
    new_stats = """@app.get("/admin/api/stats")
def admin_stats(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    \"\"\"Analytics summary stats.\"\"\"
    return db.get_stats(period=period, channel=channel)"""
    content = content.replace(old_stats, new_stats)

    old_funnel = """@app.get("/admin/api/analytics/funnel")
def admin_funnel(username: str = Depends(verify_jwt)):
    \"\"\"Funnel stats based on interaction stages.\"\"\"
    return db.get_funnel_stats()"""
    new_funnel = """@app.get("/admin/api/analytics/funnel")
def admin_funnel(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    \"\"\"Funnel stats based on interaction stages.\"\"\"
    return db.get_funnel_stats(period=period, channel=channel)"""
    content = content.replace(old_funnel, new_funnel)

    old_alerts = """@app.get("/admin/api/analytics/alerts")
def admin_alerts(username: str = Depends(verify_jwt)):
    \"\"\"Operational alerts and tasks stats.\"\"\"
    return db.get_alerts_stats()"""
    new_alerts = """@app.get("/admin/api/analytics/alerts")
def admin_alerts(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    \"\"\"Operational alerts and tasks stats.\"\"\"
    return db.get_alerts_stats(period=period, channel=channel)"""
    content = content.replace(old_alerts, new_alerts)

    old_outbound = """@app.get("/admin/api/analytics/outbound/summary")
def admin_outbound_summary(period: str = "month", username: str = Depends(verify_jwt)):
    \"\"\"Outbound communication metrics.\"\"\"
    return db.get_outbound_stats(period=period)"""
    new_outbound = """@app.get("/admin/api/analytics/outbound/summary")
def admin_outbound_summary(period: str = "month", channel: str = "mind", username: str = Depends(verify_jwt)):
    \"\"\"Outbound communication metrics.\"\"\"
    return db.get_outbound_stats(period=period, channel=channel)"""
    content = content.replace(old_outbound, new_outbound)

    with open('web_server.py', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Modified web_server.py successfully")

modify_web_server()
