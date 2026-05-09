const API_BASE = ''; // relative since we are serving from same origin

// ================= ROUTING =================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    // skip clicks on nav items without data-target (like headers)
    if (!item.dataset.target) return;
    
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // Update active page
    const target = item.dataset.target;
    navTo(target);
  });
});

function navTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${pageId}`);
  if (page) {
    page.classList.add('active');
    
    // Load page specific data
    if (pageId === 'dashboard') loadDashboard();
    else if (pageId === 'devices') loadDevices();
    else if (pageId === 'logs') loadLogs();
    else if (pageId === 'analytics') renderCharts();
    else if (pageId === 'health') checkHealth();
  }
}

// ================= TOAST NOTIFICATIONS =================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ================= API HELPERS =================
async function fetchApi(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`[API] Failed to fetch ${endpoint}:`, error);
    showToast(`Failed to fetch data`, 'error');
    return null;
  }
}

// ================= DASHBOARD =================
async function loadDashboard() {
  const events = await fetchApi('/api/events');
  if (!events) return;

  const logs = events.data || [];
  
  // Stats
  const uniqueDevices = new Set(logs.map(e => e.device_id));
  document.getElementById('dashTotalDev').innerText = uniqueDevices.size;
  document.getElementById('dashOnlineDev').innerText = uniqueDevices.size; // Mock online count
  document.getElementById('dashTotalEvents').innerText = logs.length;
  
  const acOn = logs.filter(e => e.event_type === 'AC_ON').length;
  document.getElementById('dashAcOn').innerText = acOn;

  // Recent Events Table
  const tbody = document.getElementById('dashEventsTable');
  tbody.innerHTML = '';
  
  const recent = logs.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No recent events</td></tr>`;
  } else {
    recent.forEach(log => {
      let eventBadge = `<span class="badge badge-on">${log.event_type}</span>`;
      if (log.event_type === 'AC_OFF') eventBadge = `<span class="badge badge-off">${log.event_type}</span>`;
      else if (log.event_type === 'SYNC') eventBadge = `<span class="badge badge-online">${log.event_type}</span>`;
      
      const time = new Date(log.created_at).toLocaleTimeString();
      tbody.innerHTML += `
        <tr>
          <td><strong style="color:var(--accent-pale)">${log.device_id}</strong></td>
          <td>${eventBadge}</td>
          <td style="color:var(--text-secondary)">${time}</td>
        </tr>
      `;
    });
  }

  // Quick Devices List
  const devList = document.getElementById('dashDeviceList');
  devList.innerHTML = '';
  
  Array.from(uniqueDevices).slice(0, 4).forEach(id => {
    // Find latest event for this device to guess status
    const devEvents = logs.filter(e => e.device_id === id);
    let isAcOn = false;
    let lastTemp = '--';
    
    if (devEvents.length > 0) {
      isAcOn = devEvents[0].event_type === 'AC_ON';
      if (devEvents[0].temperature) lastTemp = devEvents[0].temperature;
    }

    devList.innerHTML += `
      <div class="device-item" onclick="openDevicePanel('${id}')">
        <div class="dev-info-main">
          <div class="dev-icon">📱</div>
          <div>
            <div style="font-weight: 600; color: var(--text-primary);">${id}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Temp: ${lastTemp}°C</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap: 12px;">
          ${isAcOn ? '<span class="badge badge-online">AC ON</span>' : '<span class="badge badge-off">AC OFF</span>'}
          <span style="color: var(--text-muted)">❯</span>
        </div>
      </div>
    `;
  });
}

// ================= DEVICES =================
async function loadDevices() {
  const events = await fetchApi('/api/events');
  if (!events) return;
  const logs = events.data || [];
  const uniqueDevices = new Set(logs.map(e => e.device_id));

  const tbody = document.getElementById('devicesTableBody');
  tbody.innerHTML = '';

  if (uniqueDevices.size === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No devices found</td></tr>`;
    return;
  }

  uniqueDevices.forEach(id => {
    // Mock Data for fields we don't have
    const devEvents = logs.filter(e => e.device_id === id);
    const lastSeen = devEvents.length > 0 ? new Date(devEvents[0].created_at).toLocaleString() : 'Unknown';

    tbody.innerHTML += `
      <tr>
        <td><strong>${id}</strong></td>
        <td style="color:var(--text-secondary)">Smart AC Node</td>
        <td><span class="badge badge-online">Online</span></td>
        <td>v1.0.2</td>
        <td style="font-size: 12px; color:var(--text-secondary)">${lastSeen}</td>
        <td>
           <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="openDevicePanel('${id}')">Details</button>
        </td>
      </tr>
    `;
  });
}

// ================= DEVICE PANEL =================
let currentPanelDeviceId = null;

function openDevicePanel(deviceId) {
  currentPanelDeviceId = deviceId;
  document.getElementById('panelDevName').innerText = 'Smart AC Node';
  document.getElementById('panelDevId').innerText = `id: ${deviceId}`;
  
  // Mock live data update
  document.getElementById('panelAcState').innerText = Math.random() > 0.5 ? 'ON' : 'OFF';
  document.getElementById('panelAcState').style.color = document.getElementById('panelAcState').innerText === 'ON' ? 'var(--success)' : 'var(--text-secondary)';
  document.getElementById('panelTemp').innerText = (22 + Math.random() * 5).toFixed(1) + ' °C';
  
  document.getElementById('deviceOverlay').classList.add('show');
  document.getElementById('devicePanel').classList.add('open');
}

function closeDevicePanel() {
  currentPanelDeviceId = null;
  document.getElementById('deviceOverlay').classList.remove('show');
  document.getElementById('devicePanel').classList.remove('open');
}

async function sendQuickCommand(cmd) {
  if (!currentPanelDeviceId) return;
  showToast(`Sending ${cmd} to ${currentPanelDeviceId}...`, 'warning');
  
  try {
    const res = await fetch(`${API_BASE}/api/devices/${currentPanelDeviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Command ${cmd} sent successfully!`);
    } else {
      showToast(`Command failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch(e) {
    showToast('Failed to reach server', 'error');
  }
}

// ================= LOGS =================
let allLogs = [];

async function loadLogs() {
  const terminal = document.getElementById('logTerminal');
  terminal.innerHTML = '<div style="color: #888;">Fetching logs...</div>';
  
  const events = await fetchApi('/api/events');
  if (!events) return;
  
  allLogs = events.data || [];
  renderLogs(allLogs);
}

function renderLogs(logs) {
  const terminal = document.getElementById('logTerminal');
  terminal.innerHTML = '';
  
  if (logs.length === 0) {
    terminal.innerHTML = '<div style="color: #888;">No logs found.</div>';
    return;
  }

  logs.forEach(log => {
    const time = new Date(log.created_at).toLocaleString();
    let typeClass = 'log-info';
    
    if (log.event_type === 'ERROR' || log.event_type === 'DISCONNECT') typeClass = 'log-err';
    else if (log.event_type === 'WARNING') typeClass = 'log-warn';
    
    let extra = '';
    if (log.temperature) extra += ` Temp: ${log.temperature}°C`;
    if (log.presence !== null) extra += ` Presence: ${log.presence}`;

    terminal.innerHTML += `
      <div class="log-line">
        <span class="log-time">[${time}]</span>
        <span class="log-id">[${log.device_id}]</span>
        <span class="${typeClass}"> ${log.event_type}</span>
        <span style="color:#aaa">${extra}</span>
      </div>
    `;
  });
}

function filterLogs() {
  const q = document.getElementById('logFilter').value.toLowerCase();
  const filtered = allLogs.filter(log => 
    log.device_id.toLowerCase().includes(q) || 
    log.event_type.toLowerCase().includes(q)
  );
  renderLogs(filtered);
}

// ================= ANALYTICS (Charts) =================
let chartsRendered = false;

function renderCharts() {
  if (chartsRendered || typeof Chart === 'undefined') return;
  
  Chart.defaults.color = '#7DA0CA';
  Chart.defaults.borderColor = 'rgba(84, 131, 179, 0.1)';
  
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  // Usage Chart
  new Chart(document.getElementById('chartUsage').getContext('2d'), {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Hours',
        data: [4, 6, 3, 8, 5, 12, 10],
        borderColor: '#C1E8FF',
        backgroundColor: 'rgba(193, 232, 255, 0.2)',
        fill: true,
        tension: 0.4
      }]
    },
    options: commonOptions
  });

  // Presence Chart
  new Chart(document.getElementById('chartPresence').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Hours detected',
        data: [8, 9, 8, 10, 8, 14, 16],
        backgroundColor: '#5483B3',
        borderRadius: 4
      }]
    },
    options: commonOptions
  });

  // ON/OFF Count
  new Chart(document.getElementById('chartOnOff').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Cycles',
        data: [2, 4, 1, 3, 2, 5, 4],
        backgroundColor: '#22c55e',
        borderRadius: 4
      }]
    },
    options: commonOptions
  });

  // Power
  new Chart(document.getElementById('chartPower').getContext('2d'), {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'kWh',
        data: [6, 9, 4.5, 12, 7.5, 18, 15],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        fill: true,
        tension: 0.4
      }]
    },
    options: commonOptions
  });

  chartsRendered = true;
}

// ================= HEALTH =================
async function checkHealth() {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE}/status`);
    const end = performance.now();
    const data = await res.json();
    
    if (res.ok) {
      document.getElementById('healthApiStatus').innerText = 'Online';
      document.getElementById('healthApiStatus').style.color = 'var(--success)';
      document.getElementById('healthLatency').innerText = Math.round(end - start);
      
      // Update sidebar status
      document.getElementById('serverStatusText').innerText = 'Server Online';
      document.getElementById('serverStatusDot').style.background = 'var(--success)';
      document.getElementById('serverStatusDot').style.boxShadow = '0 0 8px var(--success)';
    }
  } catch(e) {
    document.getElementById('healthApiStatus').innerText = 'Offline';
    document.getElementById('healthApiStatus').style.color = 'var(--danger)';
    
    document.getElementById('serverStatusText').innerText = 'Server Offline';
    document.getElementById('serverStatusDot').style.background = 'var(--danger)';
    document.getElementById('serverStatusDot').style.boxShadow = '0 0 8px var(--danger)';
  }
}

// ================= COMMANDS PAGE =================
async function sendCommand() {
  const id = document.getElementById('cmdDeviceId').value;
  const cmd = document.getElementById('cmdName').value;
  let payload = {};
  
  try {
    if (document.getElementById('cmdPayload').value.trim()) {
      payload = JSON.parse(document.getElementById('cmdPayload').value);
    }
  } catch(e) {
    showToast('Invalid JSON payload', 'error');
    return;
  }

  if (!id || !cmd) return showToast('ID and Command required', 'warning');
  
  showToast(`Sending to ${id}...`, 'warning');
  try {
    const res = await fetch(`${API_BASE}/api/devices/${id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, payload })
    });
    const data = await res.json();
    if (data.success) showToast('Command sent!');
    else showToast(`Failed: ${data.error}`, 'error');
  } catch(e) { showToast('Network error', 'error'); }
}

async function invokeMethod() {
  const id = document.getElementById('methodDeviceId').value;
  const method = document.getElementById('methodName').value;
  
  if (!id || !method) return showToast('ID and Method required', 'warning');
  
  showToast(`Invoking ${method}...`, 'warning');
  try {
    const res = await fetch(`${API_BASE}/api/devices/${id}/method`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ methodName: method, payload: {} })
    });
    const data = await res.json();
    if (data.success) showToast(`Success: Response status ${data.status}`);
    else showToast(`Failed: ${data.error}`, 'error');
  } catch(e) { showToast('Network error', 'error'); }
}

// ================= INIT =================
window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  checkHealth();
  // Poll health every 30s
  setInterval(checkHealth, 30000);
});
