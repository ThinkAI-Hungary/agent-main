import sys
import logging

logger = logging.getLogger(__name__)

with open('extracted.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Chunk 1: Update renderOutgoingChart to accept `activities` and use it.
old1 = '''    function renderOutgoingChart() {
      const ctx = document.getElementById('outgoing-activity-chart');
      if (!ctx) return;
      if (outgoingChart) { outgoingChart.destroy(); outgoingChart = null; }
      outgoingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Visszahívás', 'Emlékeztető', 'Utánkövetés', 'Kampány', 'Kontroll', 'Passzív'],
          datasets: [{ label: 'Aktivitás', data: [92, 78, 65, 48, 28, 15], backgroundColor: '#1ceee0', borderRadius: 6 }]
        },'''
new1 = '''    function renderOutgoingChart(activities = null) {
      const ctx = document.getElementById('outgoing-activity-chart');
      if (!ctx) return;
      if (outgoingChart) { outgoingChart.destroy(); outgoingChart = null; }
      
      const labels = ['Visszahívás', 'Emlékeztető', 'Utánkövetés', 'Kampány', 'Kontroll', 'Passzív'];
      let dataVals = [0, 0, 0, 0, 0, 0];
      if (activities) {
          dataVals = [
              activities['Visszahívás'] || 0,
              activities['Emlékeztető'] || 0,
              activities['Utánkövetés'] || 0,
              activities['Kampány'] || 0,
              activities['Kontroll'] || 0,
              activities['Passzív'] || 0
          ];
      }
      
      outgoingChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'Aktivitás', data: dataVals, backgroundColor: '#1ceee0', borderRadius: 6 }]
        },'''
content = content.replace(old1, new1)

# Chunk 2: Update loadOutboundStats to pass `data.activities` to `renderOutgoingChart`
old2 = '''      // Outgoing activity placeholder chart
      renderOutgoingChart();

      setTimeout(() => {'''
new2 = '''      // Outgoing activity placeholder chart
      if (data && data.activities) {
          renderOutgoingChart(data.activities);
      } else {
          renderOutgoingChart(null);
      }

      setTimeout(() => {'''
content = content.replace(old2, new2)

with open('extracted.js', 'w', encoding='utf-8') as f:
    f.write(content)

# We also need to update admin.html because it might contain the same inline script, or extracted.js is used.
# Let's check admin.html too.
with open('admin.html', 'r', encoding='utf-8') as f:
    admin_content = f.read()

admin_content = admin_content.replace(old1, new1)
admin_content = admin_content.replace(old2, new2)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(admin_content)

print('Done modifying frontend files.')
