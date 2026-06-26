const API_BASE = ''; // relative since we are serving from same origin

// Cache variables
let devicesList = [];
let eventsLogs = [];
let currentFilter = 'all';
let selectedDeviceId = null;

// ================= ROUTING =================
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    if (!item.dataset.target) return;
    
    // Update active nav pill
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
    
    // Load page-specific data
    if (pageId === 'dashboard') {
      loadDashboard();
    } else if (pageId === 'devices') {
      loadDevices();
    } else if (pageId === 'logs') {
      loadLogs();
    } else if (pageId === 'analytics') {
      renderCharts();
    } else if (pageId === 'health') {
      checkHealth();
    }
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
    toast.style.animation = 'toastOut 0.3s ease forwards';
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
    if (res.status === 401) {
      currentUser = null;
      checkAuth();
      return null;
    }
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`[API] Failed to fetch ${endpoint}:`, error);
    showToast(`Failed to fetch data from ${endpoint}`, 'error');
    return null;
  }
}

// ================= DASHBOARD =================
async function loadDashboard() {
  // 1. Fetch devices list
  const devResponse = await fetchApi('/api/devices');
  if (devResponse && devResponse.success) {
    devicesList = devResponse.data || [];
  } else {
    devicesList = [];
  }

  // 2. Fetch events logs
  const eventsResponse = await fetchApi('/api/events');
  if (eventsResponse) {
    eventsLogs = eventsResponse.data || [];
  } else {
    eventsLogs = [];
  }

  // 3. Update dashboard counters
  const totalDevCount = devicesList.length;
  const onlineDevCount = devicesList.filter(d => d.online).length;
  const offlineDevCount = totalDevCount - onlineDevCount;
  const acOnCount = devicesList.filter(d => d.powerState).length;

  document.getElementById('dashTotalDev').innerText = totalDevCount;
  document.getElementById('dashOnlineDev').innerText = onlineDevCount;
  document.getElementById('dashOfflineDev').innerText = `${offlineDevCount} Offline`;
  document.getElementById('dashAcOn').innerText = acOnCount;
  document.getElementById('dashTotalEvents').innerText = eventsLogs.length;
  
  // Set cycle count from stats
  document.getElementById('cycleCountVal').innerText = eventsLogs.filter(e => e.event_type === 'AC_ON' || e.event_type === 'AC_OFF').length;

  // 4. Render left operations devices list
  renderOperationsList();

  // 5. Update Map Nodes based on selected device (default to first device if none selected)
  if (!selectedDeviceId && devicesList.length > 0) {
    selectDevice(devicesList[0].deviceId);
  } else if (selectedDeviceId) {
    // refresh current selection
    selectDevice(selectedDeviceId);
  } else {
    updateSchematicMap(null);
  }
}

function renderOperationsList() {
  const listContainer = document.getElementById('dashDeviceList');
  listContainer.innerHTML = '';

  const filtered = devicesList.filter(d => {
    if (currentFilter === 'online') return d.online;
    if (currentFilter === 'offline') return !d.online;
    return true;
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--secondary)">No devices in this category</div>`;
    return;
  }

  filtered.forEach(d => {
    const isSelected = d.deviceId === selectedDeviceId ? 'selected' : '';
    const statusText = d.online ? 'Online' : 'Offline';
    const statusBadge = d.online ? '<span class="badge badge-online">Online</span>' : '<span class="badge badge-offline">Offline</span>';
    const acBadge = d.powerState ? '<span class="badge badge-ac-on">AC ON</span>' : '<span class="badge badge-ac-off">AC OFF</span>';
    
    // Simulate battery life percentage or load RSSI representation
    const wifiSig = d.configData && d.configData.wifi ? d.configData.wifi : (d.online ? -65 : 0);
    const signalPercent = d.online ? Math.min(100, Math.max(10, (100 + wifiSig) * 1.5)) : 0;
    const isSignalLow = signalPercent < 40;

    // Warning for Empty Room with Radar Bypassed
    let warningHtml = '';
    if (d.powerState && !d.presence && d.radarBypassed) {
      warningHtml = `
        <div style="margin-top: 4px; margin-bottom: 4px; background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 8px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          ⚠️ Radar Bypassed & Room Empty!
        </div>
      `;
    }

    listContainer.innerHTML += `
      <div class="ops-device-card ${isSelected}" onclick="selectDevice('${d.deviceId}')">
        <div class="device-card-top">
          <span class="device-card-name">${d.deviceName}</span>
          ${statusBadge}
        </div>
        <div class="device-card-detail">
          <span>ID: ${d.deviceId}</span>
          ${acBadge}
        </div>
        ${warningHtml}
        <div class="battery-progress-box">
          <span class="battery-label">WiFi Signal</span>
          <div class="battery-bar-container">
            <div class="battery-bar-fill" style="width: ${signalPercent}%; background-color: ${isSignalLow ? 'var(--danger)' : 'var(--success)'};"></div>
          </div>
          <span style="font-size:10px; font-weight:600; color:var(--secondary)">${d.online ? wifiSig + 'dBm' : '--'}</span>
        </div>
      </div>
    `;
  });
}

function filterOpsList(type) {
  currentFilter = type;
  document.getElementById('tabOpsAll').classList.remove('active');
  document.getElementById('tabOpsOnline').classList.remove('active');
  document.getElementById('tabOpsOffline').classList.remove('active');
  
  if (type === 'all') document.getElementById('tabOpsAll').classList.add('active');
  if (type === 'online') document.getElementById('tabOpsOnline').classList.add('active');
  if (type === 'offline') document.getElementById('tabOpsOffline').classList.add('active');
  
  renderOperationsList();
}

function selectDevice(deviceId) {
  selectedDeviceId = deviceId;
  
  // Highlight card in left panel list
  document.querySelectorAll('.ops-device-card').forEach(card => {
    card.classList.remove('selected');
  });
  renderOperationsList(); // refresh selected state visual

  // Find the selected device object
  const device = devicesList.find(d => d.deviceId === deviceId);
  updateSchematicMap(device);
}

function updateSchematicMap(device) {
  const deviceNode = document.getElementById('schemaDeviceNode');
  const path1 = document.getElementById('line1');
  const path2 = document.getElementById('line2');

  if (!device) {
    document.getElementById('schemaDeviceName').innerText = 'No Device Selected';
    document.getElementById('schemaDeviceTemp').innerText = '-- °C';
    document.getElementById('schemaDeviceState').innerText = 'Offline';
    document.getElementById('schemaDeviceDot').className = 'node-status-dot inactive';
    document.getElementById('schemaAcReceiverDot').className = 'node-status-dot inactive';
    document.getElementById('schemaAcStateText').innerText = 'OFF';
    path1.className.baseVal = 'schema-path';
    path2.className.baseVal = 'schema-path';
    return;
  }

  // Update center node
  document.getElementById('schemaDeviceName').innerText = device.deviceName;
  document.getElementById('schemaDeviceTemp').innerText = device.online ? '24.2 °C' : '-- °C'; // mock temperature reading
  document.getElementById('schemaDeviceState').innerText = device.online ? 'Connected' : 'Offline';
  
  // Update status dots
  const devDot = document.getElementById('schemaDeviceDot');
  const acDot = document.getElementById('schemaAcReceiverDot');
  
  if (device.online) {
    devDot.className = 'node-status-dot active';
    path1.className.baseVal = 'schema-path active';
  } else {
    devDot.className = 'node-status-dot inactive';
    path1.className.baseVal = 'schema-path';
  }

  if (device.powerState) {
    acDot.className = 'node-status-dot active';
    document.getElementById('schemaAcStateText').innerText = 'COOL ON';
    path2.className.baseVal = 'schema-path active';
  } else {
    acDot.className = 'node-status-dot inactive';
    document.getElementById('schemaAcStateText').innerText = 'OFF';
    path2.className.baseVal = 'schema-path';
  }

  // Bind click action on the node to open full details side-panel
  deviceNode.onclick = () => openDevicePanel(device.deviceId);
}

// ================= DEVICES MANAGEMENT =================
async function loadDevices() {
  const devResponse = await fetchApi('/api/devices');
  const tbody = document.getElementById('devicesTableBody');
  tbody.innerHTML = '';

  if (!devResponse || !devResponse.success || devResponse.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No devices found. Synchronize your ESP32 device.</td></tr>`;
    return;
  }

  devicesList = devResponse.data;
  
  devicesList.forEach(d => {
    const statusBadge = d.online 
      ? '<span class="badge badge-online">🟢 Online</span>' 
      : '<span class="badge badge-offline">🔴 Offline</span>';
      
    const lastSeenTime = d.lastSeen 
      ? new Date(d.lastSeen).toLocaleString() 
      : 'Never';

    tbody.innerHTML += `
      <tr>
        <td><strong>${d.deviceId}</strong></td>
        <td>${d.deviceName}</td>
        <td>${statusBadge}</td>
        <td><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${d.activeConfigName}</code></td>
        <td>${lastSeenTime}</td>
        <td>
           <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="openDevicePanel('${d.deviceId}')">Inspect Details</button>
        </td>
      </tr>
    `;
  });
}

// ================= DEVICE SLIDE-IN PANEL =================
let currentPanelDeviceId = null;

function openDevicePanel(deviceId) {
  const device = devicesList.find(d => d.deviceId === deviceId);
  if (!device) return;

  currentPanelDeviceId = deviceId;
  document.getElementById('panelDevName').innerText = device.deviceName;
  document.getElementById('panelDevId').innerText = `Device Unique ID: ${device.deviceId}`;
  
  // Power & Temp
  const pAc = document.getElementById('panelAcState');
  pAc.innerText = device.powerState ? 'ON' : 'OFF';
  pAc.style.color = device.powerState ? 'var(--success)' : 'var(--secondary)';
  
  document.getElementById('panelTemp').innerText = device.online ? '24.2 °C' : '-- °C';
  
  // Radar & Presence Live Info
  const pRadar = document.getElementById('panelRadarState');
  pRadar.innerText = device.radarBypassed ? 'BYPASSED' : 'ACTIVE';
  pRadar.style.color = device.radarBypassed ? 'var(--warning)' : 'var(--success)';

  const pPresence = document.getElementById('panelPresenceState');
  pPresence.innerText = device.presence ? 'DETECTED' : 'EMPTY';
  pPresence.style.color = device.presence ? 'var(--success)' : 'var(--secondary)';

  // Radar Toggle Button Text
  const radarToggleBtn = document.getElementById('panelRadarToggle');
  if (radarToggleBtn) {
    radarToggleBtn.innerText = device.radarBypassed ? 'Enable Radar' : 'Bypass Radar';
  }
  
  // NVM / Settings
  document.getElementById('panelIp').innerText = device.online ? '192.168.1.104' : '--';
  document.getElementById('panelRssi').innerText = device.online ? (device.configData && device.configData.wifi ? device.configData.wifi + ' dBm' : '-65 dBm') : '--';
  document.getElementById('panelHeap').innerText = device.online ? '184 KB' : '--';
  document.getElementById('panelFw').innerText = device.firmwareVersion || 'v1.0.0';

  // Open overlay & panel
  document.getElementById('deviceOverlay').classList.add('show');
  document.getElementById('devicePanel').classList.add('open');
}

function closeDevicePanel() {
  currentPanelDeviceId = null;
  document.getElementById('deviceOverlay').classList.remove('show');
  document.getElementById('devicePanel').classList.remove('open');
}

async function toggleRadarBypass() {
  if (!currentPanelDeviceId) return;
  const device = devicesList.find(d => d.deviceId === currentPanelDeviceId);
  if (!device) return;
  
  const newBypass = !device.radarBypassed;
  showToast(`${newBypass ? 'Bypassing' : 'Enabling'} Radar Sensor...`, 'warning');
  
  try {
    const res = await fetch(`${API_BASE}/api/devices/${currentPanelDeviceId}/radar-bypass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bypass: newBypass })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Radar bypass successfully updated!`);
      device.radarBypassed = newBypass;
      openDevicePanel(currentPanelDeviceId);
      selectDevice(currentPanelDeviceId);
    } else {
      showToast(`Failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to connect to backend API server', 'error');
  }
}

async function sendQuickCommand(cmd) {
  if (!currentPanelDeviceId) return;
  
  let targetCmd = cmd;
  if (cmd === 'TURN_ON') targetCmd = 'power_on';
  if (cmd === 'TURN_OFF') targetCmd = 'power_off';

  showToast(`Sending ${targetCmd} to ${currentPanelDeviceId}...`, 'warning');
  
  try {
    // Determine whether to call specific endpoint or default command endpoint
    let url;
    let payload = {};

    if (targetCmd === 'power_on') {
        url = `/api/devices/${currentPanelDeviceId}/power-on`;
    } else if (targetCmd === 'power_off') {
        url = `/api/devices/${currentPanelDeviceId}/power-off`;
    } else if (targetCmd === 'LEARN') {
        url = `/api/devices/${currentPanelDeviceId}/learn-start`;
    } else {
        url = `/api/devices/${currentPanelDeviceId}/command`;
        payload = { command: targetCmd };
    }

    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (res.ok && (data.success || data.message)) {
      showToast(`Command ${targetCmd} published!`);
      // Optimistic state change update
      const dev = devicesList.find(d => d.deviceId === currentPanelDeviceId);
      if (dev) {
        if (targetCmd === 'power_on') dev.powerState = true;
        if (targetCmd === 'power_off') dev.powerState = false;
        selectDevice(currentPanelDeviceId);
        openDevicePanel(currentPanelDeviceId); // refresh panel values
      }
    } else {
      showToast(`Command failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch(e) {
    showToast('Failed to connect to backend API server', 'error');
  }
}

// ================= LOGS STREAMING =================
let allLogs = [];

async function loadLogs() {
  const terminal = document.getElementById('logTerminal');
  terminal.innerHTML = '<div style="color: #94a3b8;">Loading database logs...</div>';
  
  const events = await fetchApi('/api/events');
  if (!events) return;
  
  allLogs = events.data || [];
  renderLogs(allLogs);
}

function renderLogs(logs) {
  const terminal = document.getElementById('logTerminal');
  terminal.innerHTML = '';
  
  if (logs.length === 0) {
    terminal.innerHTML = '<div style="color: #94a3b8;">No logged actions recorded.</div>';
    return;
  }

  logs.forEach(log => {
    const time = new Date(log.created_at).toLocaleString();
    let typeClass = 'log-info';
    
    if (log.event_type === 'ERROR' || log.event_type === 'DISCONNECT') typeClass = 'log-err';
    else if (log.event_type === 'WARNING') typeClass = 'log-warn';
    
    let extra = '';
    if (log.temperature) extra += ` Temp: ${log.temperature}°C`;
    if (log.presence !== null && log.presence !== undefined) extra += ` Presence: ${log.presence}`;

    terminal.innerHTML += `
      <div class="log-line">
        <span class="log-time">[${time}]</span>
        <span class="log-id">[${log.device_id}]</span>
        <span class="${typeClass}"> ${log.event_type}</span>
        <span style="color:#cbd5e1">${extra}</span>
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

// ================= ANALYTICS =================
let chartsRendered = false;
let chartUsageRef = null;
let chartPresenceRef = null;
let chartOnOffRef = null;
let chartPowerRef = null;

function renderCharts() {
  if (chartsRendered || typeof Chart === 'undefined') return;
  
  // Set default styles for light theme
  Chart.defaults.color = '#64748b';
  Chart.defaults.borderColor = 'rgba(226, 232, 240, 0.6)';
  
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        grid: { drawBorder: false },
        ticks: { font: { size: 10 } }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      }
    }
  };

  // 1. Workload Chart (line chart with green/blue gradient)
  const ctxUsage = document.getElementById('chartUsage').getContext('2d');
  const gradient1 = ctxUsage.createLinearGradient(0, 0, 0, 180);
  gradient1.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
  gradient1.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

  chartUsageRef = new Chart(ctxUsage, {
    type: 'line',
    data: {
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
      datasets: [{
        data: [15, 20, 45, 68, 55, 40, 25],
        borderColor: '#3b82f6',
        borderWidth: 2,
        backgroundColor: gradient1,
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: commonOptions
  });

  // 2. Active Control Cycles (bar chart)
  const ctxOnOff = document.getElementById('chartOnOff').getContext('2d');
  chartOnOffRef = new Chart(ctxOnOff, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: [4, 6, 2, 8, 5, 10, 7],
        backgroundColor: '#10b981',
        borderRadius: 4,
        barThickness: 12
      }]
    },
    options: commonOptions
  });

  // 3. Presence Detection (bar chart)
  const ctxPresence = document.getElementById('chartPresence').getContext('2d');
  chartPresenceRef = new Chart(ctxPresence, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: [8, 9, 7, 12, 10, 14, 13],
        backgroundColor: '#4f46e5',
        borderRadius: 6,
        barThickness: 20
      }]
    },
    options: commonOptions
  });

  // 4. Power Estimation (line chart)
  const ctxPower = document.getElementById('chartPower').getContext('2d');
  const gradient2 = ctxPower.createLinearGradient(0, 0, 0, 240);
  gradient2.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
  gradient2.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  chartPowerRef = new Chart(ctxPower, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: [5.4, 7.2, 3.8, 9.6, 6.5, 12.4, 10.8],
        borderColor: '#10b981',
        borderWidth: 2,
        backgroundColor: gradient2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#10b981'
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
      document.getElementById('serverStatusText').innerText = 'Gateway Connected';
      document.getElementById('serverStatusDot').style.background = 'var(--success)';
    }
  } catch(e) {
    document.getElementById('healthApiStatus').innerText = 'Offline';
    document.getElementById('healthApiStatus').style.color = 'var(--danger)';
    
    document.getElementById('serverStatusText').innerText = 'Server Disconnected';
    document.getElementById('serverStatusDot').style.background = 'var(--danger)';
  }
}

// ================= MANUAL TESTING COMMANDS =================
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
    if (res.ok) showToast('Command published successfully!');
    else showToast(`Failed: ${data.error}`, 'error');
  } catch(e) { showToast('Network connection error', 'error'); }
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
    if (res.ok) showToast(`Success: Method ${method} executed!`);
    else showToast(`Failed: ${data.error}`, 'error');
  } catch(e) { showToast('Network connection error', 'error'); }
}

// ================= AUTHENTICATION ACTIONS =================
let currentUser = null;

async function checkAuth() {
  const overlay = document.getElementById('authOverlay');
  const errorBox = document.getElementById('authError');
  errorBox.style.display = 'none';

  try {
    // 1. Check setup-status (is setup required?)
    const setupRes = await fetch('/api/auth/setup-status');
    const setupData = await setupRes.json();
    
    if (setupData && setupData.setupRequired) {
      // Show setup form, hide login form
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('setupForm').style.display = 'block';
      document.getElementById('authTitle').innerText = 'AVIO Admin Setup';
      document.getElementById('authSubtitle').innerText = 'Create the initial administrator account.';
      overlay.style.visibility = 'visible';
      overlay.style.opacity = '1';
      return;
    }

    // 2. Check if logged in
    const meRes = await fetch('/api/auth/me');
    const meData = await meRes.json();

    if (meRes.ok && meData && meData.success) {
      currentUser = meData.user;
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.visibility = 'hidden';
      }, 400);

      // Update UI header profile
      document.getElementById('usernameDisplay').innerText = currentUser.username;
      const initial = currentUser.username.charAt(0).toUpperCase();
      document.getElementById('userAvatar').innerText = initial;

      // Start SSE and dashboard if not already started
      initializeDashboardOnce();
    } else {
      // Show login form, hide setup form
      document.getElementById('setupForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('authTitle').innerText = 'AVIO Admin';
      document.getElementById('authSubtitle').innerText = 'Please sign in to access the system metrics.';
      overlay.style.visibility = 'visible';
      overlay.style.opacity = '1';
    }
  } catch (err) {
    console.error('[AUTH CHECK FAILED]', err);
    showToast('Failed to connect to authentication server.', 'error');
  }
}

let dashboardInitialized = false;
function initializeDashboardOnce() {
  if (dashboardInitialized) {
    loadDashboard(); // Refresh
    return;
  }
  dashboardInitialized = true;
  loadDashboard();
  checkHealth();

  // SSE for live UI updates
  const sse = new EventSource('/api/stream');
  sse.onmessage = () => {
    if (currentUser) loadDashboard();
  };

  // Health check polling
  setInterval(() => {
    if (currentUser) checkHealth();
  }, 30000);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const errorBox = document.getElementById('authError');
  const btn = document.getElementById('loginSubmitBtn');
  errorBox.style.display = 'none';
  btn.disabled = true;

  const usernameOrEmail = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: usernameOrEmail, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Signed in successfully.');
      document.getElementById('loginPassword').value = '';
      checkAuth();
    } else {
      errorBox.innerText = data.error || 'Authentication failed.';
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.innerText = 'Network error, please try again.';
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  const errorBox = document.getElementById('authError');
  const btn = document.getElementById('setupSubmitBtn');
  errorBox.style.display = 'none';

  const username = document.getElementById('setupUsername').value;
  const email = document.getElementById('setupEmail').value;
  const password = document.getElementById('setupPassword').value;
  const confirmPassword = document.getElementById('setupConfirmPassword').value;

  if (password !== confirmPassword) {
    errorBox.innerText = 'Passwords do not match.';
    errorBox.style.display = 'block';
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Admin account created successfully!');
      // Clear inputs
      document.getElementById('setupUsername').value = '';
      document.getElementById('setupEmail').value = '';
      document.getElementById('setupPassword').value = '';
      document.getElementById('setupConfirmPassword').value = '';
      checkAuth();
    } else {
      errorBox.innerText = data.error || 'Setup registration failed.';
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.innerText = 'Network error during registration.';
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function handleLogoutClick() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    if (res.ok) {
      currentUser = null;
      showToast('Logged out successfully.');
      checkAuth();
    } else {
      showToast('Failed to log out.', 'error');
    }
  } catch (err) {
    showToast('Network error during log out.', 'error');
  }
}

// ================= INIT =================
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
