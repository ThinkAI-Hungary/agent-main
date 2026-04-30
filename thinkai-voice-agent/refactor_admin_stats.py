import os

def modify_admin_html():
    with open('admin.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # loadStats
    old_load_stats = """    async function loadStats() {
      const period = document.getElementById('stats-days').value;
      const kpiGrid = document.getElementById('kpi-grid-figma');
      kpiGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#6b7280;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;"></div></div>`;

      // Betöltjük az AI insightokat is párhuzamosan
      loadInsights();

      try {
        const res = await authFetch(`/admin/api/stats?period=${period}`);"""
        
    new_load_stats = """    async function loadStats() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      const kpiGrid = document.getElementById('kpi-grid-figma');
      kpiGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#6b7280;"><div class="spinner" style="border-color:#e5e7eb;border-top-color:#1ceee0;"></div></div>`;

      // Betöltjük az AI insightokat is párhuzamosan
      loadInsights();

      try {
        const res = await authFetch(`/admin/api/stats?period=${period}&channel=${channel}`);"""
    content = content.replace(old_load_stats, new_load_stats)

    # loadAlerts
    old_load_alerts = """    async function loadAlerts() {
      try {
        const res = await authFetch('/admin/api/analytics/alerts');"""
        
    new_load_alerts = """    async function loadAlerts() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      try {
        const res = await authFetch(`/admin/api/analytics/alerts?period=${period}&channel=${channel}`);"""
    content = content.replace(old_load_alerts, new_load_alerts)

    # loadFunnelStats
    old_load_funnel = """    async function loadFunnelStats() {
      const container = document.getElementById('funnel-container');
      if (!container) return;
      
      try {
        const res = await authFetch('/admin/api/analytics/funnel');"""
        
    new_load_funnel = """    async function loadFunnelStats() {
      const container = document.getElementById('funnel-container');
      if (!container) return;
      
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      try {
        const res = await authFetch(`/admin/api/analytics/funnel?period=${period}&channel=${channel}`);"""
    content = content.replace(old_load_funnel, new_load_funnel)

    # loadOutboundStats
    old_load_outbound = """    async function loadOutboundStats() {
      const period = document.getElementById('stats-days').value;
      try {
        const res = await authFetch(`/admin/api/analytics/outbound/summary?period=${period}`);"""
        
    new_load_outbound = """    async function loadOutboundStats() {
      const period = document.getElementById('stats-days').value;
      const channel = document.getElementById('filter-csatorna').value;
      try {
        const res = await authFetch(`/admin/api/analytics/outbound/summary?period=${period}&channel=${channel}`);"""
    content = content.replace(old_load_outbound, new_load_outbound)

    with open('admin.html', 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Modified admin.html successfully")

modify_admin_html()
