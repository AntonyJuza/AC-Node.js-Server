// ===== Config =====
// Auto-detect API base URL: same origin in production, or override for dev
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3000/api`
  : '/api';

// ===== State =====
let allEvents = [];
let autoRefreshInterval = null;

// ===== Navigation =====
document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.page;
    navigateTo(page);
  });
});

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const activeLink = document.querySelector(`.nav-item[data-page="${page}"]`);
  const activePage = document.getElementById(`page-${page}`);

  if (activeLink) activeLink.classList.add('active');
  if (activePage) activePage.classList.add('active');

  // Load data for the page
  if (page === 'dashboard') refreshDashboard();
  if (page === 'devices') loadDevicesPage();
  if (page === 'events') loadEvents();
}

// ===== Server Status =====
async function checkServerStatus() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(API_BASE.replace('/api', '/status'));
    if (res.ok) {
      dot.className = 'status-dot online';
      text.textContent = 'Server Online';
    } else {
      throw new Error();
    }
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = 'Server Offline';
  }
}

// ===== Dashboard =====
async function refreshDashboard() {
  checkServerStatus();
  await Promise.all([loadDashboardEvents(), loadDashboardDevices()]);
}

async function loadDashboardEvents() {
  try {
    const events = await fetchEvents();
    allEvents = events;

    // Stats
    document.getElementById('statEvents').textContent = events.length;
    document.getElementById('statAcOn').textContent = events.filter(e => e.event === 'AC_ON').length;
    document.getElementById('statAcOff').textContent = events.filter(e => e.event === 'AC_OFF').length;

    // Table (last 10)
    const tbody = document.getElementById('dashboardEventsBody');
    const recent = events.slice(0, 10);
    tbody.innerHTML = recent.length
      ? recent.map(e => `
          <tr>
            <td><code>${escHtml(e.device_id)}</code></td>
            <td>${eventBadge(e.event)}</td>
            <td>${e.temperature !== null && e.temperature !== undefined ? e.temperature + ' °C' : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td>${presenceBadge(e.presence)}</td>
            <td style="color:var(--text-muted);font-size:12px">${formatIST(e.created_at)}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="loading">No events found</td></tr>';
  } catch (err) {
    document.getElementById('dashboardEventsBody').innerHTML =
      `<tr><td colspan="5" class="loading" style="color:var(--danger)">Failed to load events</td></tr>`;
  }
}

async function loadDashboardDevices() {
  const container = document.getElementById('dashboardDevicesList');
  try {
    // We don't have a "list all devices" endpoint, so we try to get devices
    // from the events data (unique device IDs)
    const events = allEvents.length ? allEvents : await fetchEvents();
    const deviceIds = [...new Set(events.map(e => e.device_id))];

    document.getElementById('statDevices').textContent = deviceIds.length;

    if (!deviceIds.length) {
      container.innerHTML = '<div class="loading">No devices found in event log</div>';
      return;
    }

    container.innerHTML = deviceIds.map(id => `
      <div class="device-item" onclick="navigateTo('devices'); setTimeout(()=>{ document.getElementById('deviceLookupId').value='${escHtml(id)}'; lookupDevice(); }, 100)">
        <div class="device-item-id">${escHtml(id)}</div>
        <div class="device-item-name">Click to view details →</div>
      </div>`).join('');
  } catch {
    container.innerHTML = '<div class="loading" style="color:var(--danger)">Failed to load devices</div>';
  }
}

// ===== Devices Page =====
async function loadDevicesPage() {
  const container = document.getElementById('allDevicesContainer');
  try {
    const events = await fetchEvents();
    allEvents = events;
    const deviceIds = [...new Set(events.map(e => e.device_id))];

    if (!deviceIds.length) {
      container.innerHTML = '<div class="loading">No devices found in event log</div>';
      return;
    }

    // Fetch device details for each unique device
    const deviceCards = await Promise.allSettled(
      deviceIds.map(id => fetch(`${API_BASE}/devices/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null))
    );

    const html = deviceIds.map((id, i) => {
      const result = deviceCards[i];
      const device = result.status === 'fulfilled' ? result.value : null;
      return renderDeviceCard(id, device);
    }).join('');

    container.innerHTML = `<div class="device-list">${html}</div>`;
  } catch {
    container.innerHTML = '<div class="loading" style="color:var(--danger)">Failed to load devices</div>';
  }
}

function renderDeviceCard(id, device) {
  if (!device) {
    return `
      <div class="device-item">
        <div class="device-item-id">${escHtml(id)}</div>
        <div class="device-item-name" style="color:var(--danger)">Could not fetch device details</div>
      </div>`;
  }
  return `
    <div class="device-item" onclick="showDeviceDetail('${escHtml(id)}')">
      <div class="device-item-id">${escHtml(device.deviceId || id)}</div>
      <div class="device-item-name">${escHtml(device.deviceName || 'Unknown Device')}</div>
      <div class="device-item-config">Config: <strong>${escHtml(device.activeConfigName || 'NONE')}</strong> · Updated: ${device.updatedAtIST || formatIST(device.updatedAt)}</div>
    </div>`;
}

async function lookupDevice() {
  const deviceId = document.getElementById('deviceLookupId').value.trim();
  const resultEl = document.getElementById('deviceLookupResult');

  if (!deviceId) {
    showDeviceResult(resultEl, null, 'Please enter a Device ID');
    return;
  }

  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<div class="loading">Looking up device...</div>';

  try {
    const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      resultEl.innerHTML = `<div style="color:var(--danger)">Device not found: ${escHtml(err.error || res.statusText)}</div>`;
      return;
    }
    const device = await res.json();
    resultEl.innerHTML = `
      <h3>📡 ${escHtml(device.deviceName || device.deviceId)}</h3>
      <div class="detail-row"><span class="detail-label">Device ID</span><span class="detail-value">${escHtml(device.deviceId)}</span></div>
      <div class="detail-row"><span class="detail-label">Device Name</span><span class="detail-value">${escHtml(device.deviceName || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Active Config</span><span class="detail-value">${escHtml(device.activeConfigName || 'NONE')}</span></div>
      <div class="detail-row"><span class="detail-label">Last Updated (IST)</span><span class="detail-value">${device.updatedAtIST || formatIST(device.updatedAt)}</span></div>
      <div class="detail-row"><span class="detail-label">Created (IST)</span><span class="detail-value">${formatIST(device.createdAt)}</span></div>
      ${device.configData ? `
      <div class="detail-row" style="flex-direction:column">
        <span class="detail-label">Config Data</span>
        <pre class="config-json">${escHtml(JSON.stringify(device.configData, null, 2))}</pre>
      </div>` : ''}
    `;
  } catch {
    resultEl.innerHTML = `<div style="color:var(--danger)">Failed to connect to server</div>`;
  }
}

async function showDeviceDetail(deviceId) {
  document.getElementById('deviceLookupId').value = deviceId;
  await lookupDevice();
  document.getElementById('deviceLookupResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== Events Page =====
async function loadEvents() {
  const tbody = document.getElementById('eventsTableBody');
  const badge = document.getElementById('eventCount');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading events...</td></tr>';

  try {
    const events = await fetchEvents();
    allEvents = events;
    badge.textContent = `${events.length} events`;
    renderEventsTable(events);
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="loading" style="color:var(--danger)">Failed to load events</td></tr>';
  }
}

function renderEventsTable(events) {
  const tbody = document.getElementById('eventsTableBody');
  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No events found</td></tr>';
    return;
  }
  tbody.innerHTML = events.map((e, i) => `
    <tr>
      <td style="color:var(--text-muted)">${e.id || i + 1}</td>
      <td><code>${escHtml(e.device_id)}</code></td>
      <td>${eventBadge(e.event)}</td>
      <td>${e.temperature !== null && e.temperature !== undefined ? e.temperature + ' °C' : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${presenceBadge(e.presence)}</td>
      <td style="color:var(--text-muted);font-size:12px">${formatIST(e.created_at)}</td>
    </tr>`).join('');
}

function filterEvents() {
  const query = document.getElementById('eventFilter').value.toLowerCase();
  const filtered = allEvents.filter(e =>
    e.device_id.toLowerCase().includes(query) ||
    e.event.toLowerCase().includes(query)
  );
  renderEventsTable(filtered);
}

function toggleAutoRefresh() {
  const enabled = document.getElementById('autoRefreshToggle').checked;
  if (enabled) {
    autoRefreshInterval = setInterval(loadEvents, 5000);
  } else {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ===== Commands Page =====
async function sendCommand() {
  const deviceId = document.getElementById('cmdDeviceId').value.trim();
  const command = document.getElementById('cmdCommand').value.trim();
  const payloadRaw = document.getElementById('cmdPayload').value.trim();
  const resultEl = document.getElementById('cmdResult');

  if (!deviceId || !command) {
    showResult(resultEl, 'error', 'Device ID and Command are required.');
    return;
  }

  let extraPayload = {};
  if (payloadRaw) {
    try { extraPayload = JSON.parse(payloadRaw); }
    catch { showResult(resultEl, 'error', 'Invalid JSON in Extra Payload.'); return; }
  }

  showResult(resultEl, '', 'Sending command...');

  try {
    const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...extraPayload }),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', 'Network error: ' + err.message);
  }
}

async function invokeMethod() {
  const deviceId = document.getElementById('methodDeviceId').value.trim();
  const methodName = document.getElementById('methodName').value.trim();
  const payloadRaw = document.getElementById('methodPayload').value.trim();
  const resultEl = document.getElementById('methodResult');

  if (!deviceId || !methodName) {
    showResult(resultEl, 'error', 'Device ID and Method Name are required.');
    return;
  }

  let payload = {};
  if (payloadRaw) {
    try { payload = JSON.parse(payloadRaw); }
    catch { showResult(resultEl, 'error', 'Invalid JSON in Payload.'); return; }
  }

  showResult(resultEl, '', 'Invoking method...');

  try {
    const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/method`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ methodName, payload }),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', 'Network error: ' + err.message);
  }
}

async function logManualEvent() {
  const device_id = document.getElementById('logDeviceId').value.trim();
  const event = document.getElementById('logEvent').value;
  const tempVal = document.getElementById('logTemp').value;
  const presenceVal = document.getElementById('logPresence').value;
  const resultEl = document.getElementById('logResult');

  if (!device_id) {
    showResult(resultEl, 'error', 'Device ID is required.');
    return;
  }

  const body = { device_id, event };
  if (tempVal !== '') body.temperature = parseFloat(tempVal);
  if (presenceVal !== '') body.presence = presenceVal === 'true';

  showResult(resultEl, '', 'Logging event...');

  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', 'Network error: ' + err.message);
  }
}

async function syncDevice() {
  const deviceId = document.getElementById('syncDeviceId').value.trim();
  const deviceName = document.getElementById('syncDeviceName').value.trim();
  const activeConfigName = document.getElementById('syncConfigName').value.trim();
  const configDataRaw = document.getElementById('syncConfigData').value.trim();
  const resultEl = document.getElementById('syncResult');

  if (!deviceId) {
    showResult(resultEl, 'error', 'Device ID is required.');
    return;
  }

  const body = { deviceId };
  if (deviceName) body.deviceName = deviceName;
  if (activeConfigName) body.activeConfigName = activeConfigName;
  if (configDataRaw) {
    try { body.configData = JSON.parse(configDataRaw); }
    catch { showResult(resultEl, 'error', 'Invalid JSON in Config Data.'); return; }
  }

  showResult(resultEl, '', 'Syncing device...');

  try {
    const res = await fetch(`${API_BASE}/devices/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', 'Network error: ' + err.message);
  }
}

// ===== Helpers =====
async function fetchEvents() {
  const res = await fetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

function eventBadge(event) {
  const cls = ['AC_ON', 'AC_OFF', 'SYNC'].includes(event) ? event : 'other';
  return `<span class="event-badge ${cls}">${escHtml(event)}</span>`;
}

function presenceBadge(presence) {
  if (presence === null || presence === undefined) return '<span style="color:var(--text-muted)">—</span>';
  return presence
    ? '<span style="color:var(--success)">✓ Yes</span>'
    : '<span style="color:var(--danger)">✗ No</span>';
}

function formatIST(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true,
    });
  } catch { return dateStr; }
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showResult(el, type, message) {
  el.className = `result-box ${type}`;
  el.textContent = message;
}

// ===== Init =====
checkServerStatus();
setInterval(checkServerStatus, 30000);
refreshDashboard();
