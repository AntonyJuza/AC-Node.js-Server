// ============================================================
// AC Automation IoT Dashboard — app.js
// Complete SPA frontend for the AC Automation IoT Dashboard.
// ============================================================

// ===== API Config =====
// Auto-detect API base: localhost dev vs production same-origin
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3000/api`
  : '/api';

// ===== Global State =====
let allEvents = [];            // cached event list
let autoRefreshInterval = null; // handle for auto-refresh timer
let currentPanelDeviceId = null; // device currently open in detail panel
let charts = {};               // Chart.js instances keyed by canvas id

// ===== Chart.js Global Defaults =====
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#7DA0CA';
  Chart.defaults.borderColor = 'rgba(84,131,179,0.15)';
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.font.size = 12;
}

// ============================================================
// SECTION: Navigation / Router
// ============================================================

/**
 * Navigate to a named page, activate its nav item, and load its data.
 * @param {string} page - The page name matching data-page attributes and page-{name} IDs.
 */
function navigateTo(page) {
  // Deactivate all nav items and pages
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Activate the matching nav item and page
  const activeLink = document.querySelector(`.nav-item[data-page="${page}"]`);
  const activePage = document.getElementById(`page-${page}`);
  if (activeLink) activeLink.classList.add('active');
  if (activePage) activePage.classList.add('active');

  // Trigger page-specific data load
  switch (page) {
    case 'dashboard':  refreshDashboard(); break;
    case 'devices':    loadDevicesPage();  break;
    case 'events':     loadEvents();       break;
    case 'analytics':  loadAnalytics();    break;
    case 'health':     refreshHealth();    break;
    default: break; // users, ota, etc. — no data load needed
  }
}

// ============================================================
// SECTION: Server Status
// ============================================================

/**
 * Ping the /status endpoint and update the sidebar indicator.
 */
async function checkServerStatus() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(API_BASE.replace('/api', '/status'));
    if (res.ok) {
      dot.className  = 'status-dot online';
      text.textContent = 'Server Online';
    } else {
      throw new Error('non-ok');
    }
  } catch {
    dot.className  = 'status-dot offline';
    text.textContent = 'Server Offline';
  }
}

// ============================================================
// SECTION: Dashboard
// ============================================================

/**
 * Refresh the entire dashboard: server status + events + devices in parallel.
 */
async function refreshDashboard() {
  checkServerStatus();
  await Promise.all([loadDashboardEvents(), loadDashboardDevices()]);
}

/**
 * Fetch events, update stat cards, and render the last-10 events table.
 */
async function loadDashboardEvents() {
  const tbody = document.getElementById('dashboardEventsBody');
  try {
    const events = await fetchEvents();
    allEvents = events;

    // Update stat cards (each card has a .stat-value child)
    document.querySelector('#statEvents .stat-value').textContent  = events.length;
    document.querySelector('#statAcOn  .stat-value').textContent   = events.filter(e => e.event === 'AC_ON').length;
    document.querySelector('#statAcOff .stat-value').textContent   = events.filter(e => e.event === 'AC_OFF').length;

    // Render last 10 events
    const recent = events.slice(0, 10);
    tbody.innerHTML = recent.length
      ? recent.map(e => renderEventRow(e)).join('')
      : '<tr><td colspan="5" class="table-empty">No events found</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color:var(--danger)">Failed to load events: ${escHtml(err.message)}</td></tr>`;
  }
}

/**
 * Derive unique device IDs from allEvents, update stat card, render device list.
 */
async function loadDashboardDevices() {
  const container = document.getElementById('dashboardDevicesList');
  try {
    // Use cached events if available, otherwise fetch
    const events = allEvents.length ? allEvents : await fetchEvents();
    const deviceIds = [...new Set(events.map(e => e.device_id))];

    document.querySelector('#statDevices .stat-value').textContent = deviceIds.length;

    if (!deviceIds.length) {
      container.innerHTML = '<div class="loading-text">No devices found in event log</div>';
      return;
    }

    container.innerHTML = deviceIds.map(id => `
      <div class="device-item" onclick="openDetailPanel('${escHtml(id)}')">
        <div class="device-item-id">${escHtml(id)}</div>
        <div class="device-item-name">Click to view &#8594;</div>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<div class="loading-text" style="color:var(--danger)">Failed to load devices</div>`;
  }
}

// ============================================================
// SECTION: Devices Page
// ============================================================

/**
 * Load all devices page: fetch events for unique IDs, then fetch each device record.
 */
async function loadDevicesPage() {
  const container = document.getElementById('allDevicesContainer');
  container.innerHTML = '<div class="loading-text">Loading devices...</div>';
  try {
    const events = await fetchEvents();
    allEvents = events;
    const deviceIds = [...new Set(events.map(e => e.device_id))];

    if (!deviceIds.length) {
      container.innerHTML = '<div class="loading-text">No devices found in event log</div>';
      return;
    }

    // Fetch device details for every unique ID in parallel
    const results = await Promise.allSettled(
      deviceIds.map(id =>
        fetch(`${API_BASE}/devices/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null)
      )
    );

    const html = deviceIds.map((id, i) => {
      const device = results[i].status === 'fulfilled' ? results[i].value : null;
      if (!device) {
        return `
          <div class="device-item" onclick="openDetailPanel('${escHtml(id)}')">
            <div class="device-item-id">${escHtml(id)}</div>
            <div class="device-item-name" style="color:var(--danger)">Could not fetch device details</div>
          </div>`;
      }
      const updatedIST = device.updatedAtIST || formatIST(device.updatedAt);
      return `
        <div class="device-item" onclick="openDetailPanel('${escHtml(id)}')">
          <div class="device-item-id" style="color:var(--accent)">${escHtml(device.deviceId || id)}</div>
          <div class="device-item-name">${escHtml(device.deviceName || 'Unknown Device')}</div>
          <div class="device-item-config">Config: <strong>${escHtml(device.activeConfigName || 'NONE')}</strong> &middot; Updated: ${updatedIST}</div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="device-list">${html}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="loading-text" style="color:var(--danger)">Failed to load devices: ${escHtml(err.message)}</div>`;
  }
}

/**
 * Look up a single device by ID entered in the lookup input.
 */
async function lookupDevice() {
  const deviceId = document.getElementById('deviceLookupId').value.trim();
  const resultEl = document.getElementById('deviceLookupResult');

  if (!deviceId) {
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = '<div style="color:var(--danger)">Please enter a Device ID.</div>';
    return;
  }

  resultEl.classList.remove('hidden');
  resultEl.innerHTML = '<div class="loading-text">Looking up device...</div>';

  try {
    const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      resultEl.innerHTML = `<div style="color:var(--danger)">Device not found: ${escHtml(err.error || res.statusText)}</div>`;
      return;
    }
    const d = await res.json();
    resultEl.innerHTML = `
      <h3>&#128225; ${escHtml(d.deviceName || d.deviceId)}</h3>
      <div class="detail-row"><span class="detail-label">Device ID</span><span class="detail-value">${escHtml(d.deviceId)}</span></div>
      <div class="detail-row"><span class="detail-label">Device Name</span><span class="detail-value">${escHtml(d.deviceName || '&#8212;')}</span></div>
      <div class="detail-row"><span class="detail-label">Active Config</span><span class="detail-value">${escHtml(d.activeConfigName || 'NONE')}</span></div>
      <div class="detail-row"><span class="detail-label">Last Updated (IST)</span><span class="detail-value">${d.updatedAtIST || formatIST(d.updatedAt)}</span></div>
      <div class="detail-row"><span class="detail-label">Created (IST)</span><span class="detail-value">${formatIST(d.createdAt)}</span></div>
      ${d.configData ? `
      <div class="detail-row" style="flex-direction:column;gap:6px">
        <span class="detail-label">Config Data</span>
        <pre class="config-json">${escHtml(JSON.stringify(d.configData, null, 2))}</pre>
      </div>` : ''}`;
  } catch (err) {
    resultEl.innerHTML = `<div style="color:var(--danger)">Network error: ${escHtml(err.message)}</div>`;
  }
}

// ============================================================
// SECTION: Events Page
// ============================================================

/**
 * Fetch all events, update the count badge, and render the full table.
 */
async function loadEvents() {
  const tbody = document.getElementById('eventsTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading events...</td></tr>';
  try {
    const events = await fetchEvents();
    allEvents = events;
    document.getElementById('eventCount').textContent = `${events.length} events`;
    renderEventsTable(events);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="color:var(--danger)">Failed to load events: ${escHtml(err.message)}</td></tr>`;
  }
}

/**
 * Render an array of events into the events table body.
 * @param {Array} events
 */
function renderEventsTable(events) {
  const tbody = document.getElementById('eventsTableBody');
  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No events found</td></tr>';
    return;
  }
  tbody.innerHTML = events.map((e, i) => `
    <tr>
      <td style="color:var(--text-muted)">${escHtml(String(e.id ?? i + 1))}</td>
      <td><code>${escHtml(e.device_id)}</code></td>
      <td>${eventBadge(e.event)}</td>
      <td>${e.temperature != null ? escHtml(String(e.temperature)) + ' &deg;C' : '<span style="color:var(--text-muted)">&#8212;</span>'}</td>
      <td>${presenceBadge(e.presence)}</td>
      <td style="color:var(--text-muted);font-size:12px">${formatIST(e.created_at)}</td>
    </tr>`).join('');
}

/**
 * Filter the cached events by device_id or event type and re-render.
 */
function filterEvents() {
  const query = document.getElementById('eventFilter').value.toLowerCase().trim();
  const filtered = allEvents.filter(e =>
    e.device_id.toLowerCase().includes(query) ||
    e.event.toLowerCase().includes(query)
  );
  renderEventsTable(filtered);
}

/**
 * Start or stop the 5-second auto-refresh timer based on the checkbox state.
 */
function toggleAutoRefresh() {
  const enabled = document.getElementById('autoRefreshToggle').checked;
  if (enabled) {
    autoRefreshInterval = setInterval(loadEvents, 5000);
  } else {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ============================================================
// SECTION: Commands Page
// ============================================================

/**
 * Send a cloud-to-device command via POST /api/devices/:id/command.
 */
async function sendCommand() {
  const deviceId  = document.getElementById('cmdDeviceId').value.trim();
  const command   = document.getElementById('cmdCommand').value.trim();
  const rawPayload = document.getElementById('cmdPayload').value.trim();
  const resultEl  = document.getElementById('cmdResult');

  if (!deviceId || !command) {
    showResult(resultEl, 'error', 'Device ID and Command are required.');
    return;
  }

  let extraPayload = {};
  if (rawPayload) {
    try { extraPayload = JSON.parse(rawPayload); }
    catch { showResult(resultEl, 'error', 'Invalid JSON in Extra Payload.'); return; }
  }

  showResult(resultEl, '', 'Sending command...');
  try {
    const res  = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...extraPayload }),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', `Network error: ${err.message}`);
  }
}

/**
 * Invoke a direct method on a device via POST /api/devices/:id/method.
 */
async function invokeMethod() {
  const deviceId   = document.getElementById('methodDeviceId').value.trim();
  const methodName = document.getElementById('methodName').value.trim();
  const rawPayload = document.getElementById('methodPayload').value.trim();
  const resultEl   = document.getElementById('methodResult');

  if (!deviceId || !methodName) {
    showResult(resultEl, 'error', 'Device ID and Method Name are required.');
    return;
  }

  let payload = {};
  if (rawPayload) {
    try { payload = JSON.parse(rawPayload); }
    catch { showResult(resultEl, 'error', 'Invalid JSON in Payload.'); return; }
  }

  showResult(resultEl, '', 'Invoking method...');
  try {
    const res  = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/method`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ methodName, payload }),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', `Network error: ${err.message}`);
  }
}

/**
 * Log a manual sensor event via POST /api/events.
 */
async function logManualEvent() {
  const device_id  = document.getElementById('logDeviceId').value.trim();
  const event      = document.getElementById('logEvent').value;
  const tempVal    = document.getElementById('logTemp').value;
  const presenceVal = document.getElementById('logPresence').value;
  const resultEl   = document.getElementById('logResult');

  if (!device_id) {
    showResult(resultEl, 'error', 'Device ID is required.');
    return;
  }

  const body = { device_id, event };
  if (tempVal !== '')    body.temperature = parseFloat(tempVal);
  if (presenceVal !== '') body.presence   = presenceVal === 'true';

  showResult(resultEl, '', 'Logging event...');
  try {
    const res  = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', `Network error: ${err.message}`);
  }
}

/**
 * Sync (upsert) a device record via POST /api/devices/sync.
 */
async function syncDevice() {
  const deviceId       = document.getElementById('syncDeviceId').value.trim();
  const deviceName     = document.getElementById('syncDeviceName').value.trim();
  const activeConfigName = document.getElementById('syncConfigName').value.trim();
  const rawConfigData  = document.getElementById('syncConfigData').value.trim();
  const resultEl       = document.getElementById('syncResult');

  if (!deviceId) {
    showResult(resultEl, 'error', 'Device ID is required.');
    return;
  }

  const body = { deviceId };
  if (deviceName)       body.deviceName       = deviceName;
  if (activeConfigName) body.activeConfigName = activeConfigName;
  if (rawConfigData) {
    try { body.configData = JSON.parse(rawConfigData); }
    catch { showResult(resultEl, 'error', 'Invalid JSON in Config Data.'); return; }
  }

  showResult(resultEl, '', 'Syncing device...');
  try {
    const res  = await fetch(`${API_BASE}/devices/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', `Network error: ${err.message}`);
  }
}

// ============================================================
// SECTION: Device Detail Panel (slide-in)
// ============================================================

/**
 * Open the slide-in detail panel for a given device ID.
 * @param {string} deviceId
 */
async function openDetailPanel(deviceId) {
  currentPanelDeviceId = deviceId;
  const panel = document.getElementById('deviceDetailPanel');
  panel.classList.add('open');

  // Reset fields while loading
  document.getElementById('panelDeviceName').textContent    = 'Loading...';
  document.getElementById('panelDeviceId').textContent      = deviceId;
  document.getElementById('panelDeviceNameVal').textContent = '—';
  document.getElementById('panelConfig').textContent        = '—';
  document.getElementById('panelUpdated').textContent       = '—';
  document.getElementById('panelCreated').textContent       = '—';
  document.getElementById('panelConfigJson').textContent    = 'Loading...';
  document.getElementById('panelResult').className          = 'result-box hidden';
  document.getElementById('panelResult').textContent        = '';

  try {
    const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    document.getElementById('panelDeviceName').textContent    = d.deviceName || d.deviceId;
    document.getElementById('panelDeviceId').textContent      = d.deviceId;
    document.getElementById('panelDeviceNameVal').textContent = d.deviceName || '—';
    document.getElementById('panelConfig').textContent        = d.activeConfigName || 'NONE';
    document.getElementById('panelUpdated').textContent       = d.updatedAtIST || formatIST(d.updatedAt);
    document.getElementById('panelCreated').textContent       = formatIST(d.createdAt);
    document.getElementById('panelConfigJson').textContent    = d.configData
      ? JSON.stringify(d.configData, null, 2)
      : 'No config data';
  } catch (err) {
    document.getElementById('panelDeviceName').textContent = 'Error loading device';
    showResult(document.getElementById('panelResult'), 'error', `Failed to load device: ${err.message}`);
  }
}

/**
 * Close the detail panel and clear the current device reference.
 */
function closeDetailPanel() {
  document.getElementById('deviceDetailPanel').classList.remove('open');
  currentPanelDeviceId = null;
}

/**
 * Send a command from the detail panel to the currently open device.
 * @param {string} command - e.g. 'AC_ON', 'AC_OFF', 'RESTART'
 */
async function panelSendCommand(command) {
  const resultEl = document.getElementById('panelResult');
  if (!currentPanelDeviceId) {
    showResult(resultEl, 'error', 'No device selected.');
    return;
  }
  showResult(resultEl, '', `Sending ${command}...`);
  try {
    const res  = await fetch(`${API_BASE}/devices/${encodeURIComponent(currentPanelDeviceId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', `Network error: ${err.message}`);
  }
}

/**
 * Force-sync the currently open device via POST /api/devices/sync.
 */
async function panelForceSync() {
  const resultEl = document.getElementById('panelResult');
  if (!currentPanelDeviceId) {
    showResult(resultEl, 'error', 'No device selected.');
    return;
  }
  showResult(resultEl, '', 'Syncing...');
  try {
    const res  = await fetch(`${API_BASE}/devices/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: currentPanelDeviceId }),
    });
    const data = await res.json();
    showResult(resultEl, res.ok ? 'success' : 'error', JSON.stringify(data, null, 2));
  } catch (err) {
    showResult(resultEl, 'error', `Network error: ${err.message}`);
  }
}

// ============================================================
// SECTION: Analytics Page
// ============================================================

/**
 * Create or replace a Chart.js chart on a canvas element.
 * Destroys the previous instance if one exists.
 * @param {string} id     - Canvas element ID
 * @param {object} config - Chart.js config object
 */
function createOrUpdateChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas.getContext('2d'), config);
}

/**
 * Shared chart options factory for consistent styling across all charts.
 * @param {string} legendPosition
 */
function baseChartOptions(legendPosition = 'bottom') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: legendPosition },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(84,131,179,0.1)' } },
    },
  };
}

/**
 * Fetch events and build all four analytics charts.
 */
async function loadAnalytics() {
  try {
    const events = await fetchEvents();
    allEvents = events;

    const days   = getLast7Days();
    const labels = days.map(d => d.slice(5)); // MM-DD for display

    // --- Chart 1: AC Usage Over Time (total events per day, line) ---
    const usageCounts = days.map(day =>
      events.filter(e => getDateStr(e.created_at) === day).length
    );
    createOrUpdateChart('chartUsage', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Events',
          data: usageCounts,
          borderColor: '#5483B3',
          backgroundColor: 'rgba(84,131,179,0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
        }],
      },
      options: baseChartOptions(),
    });

    // --- Chart 2: Daily ON/OFF Count (grouped bar) ---
    const onCounts  = days.map(day => events.filter(e => getDateStr(e.created_at) === day && e.event === 'AC_ON').length);
    const offCounts = days.map(day => events.filter(e => getDateStr(e.created_at) === day && e.event === 'AC_OFF').length);
    createOrUpdateChart('chartDaily', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'AC ON',  data: onCounts,  backgroundColor: 'rgba(34,197,94,0.8)' },
          { label: 'AC OFF', data: offCounts, backgroundColor: 'rgba(239,68,68,0.8)' },
        ],
      },
      options: baseChartOptions(),
    });

    // --- Chart 3: Presence Events Per Device (bar) ---
    const deviceIds      = [...new Set(events.map(e => e.device_id))];
    const presenceCounts = deviceIds.map(id =>
      events.filter(e => e.device_id === id && e.presence === true).length
    );
    createOrUpdateChart('chartPresence', {
      type: 'bar',
      data: {
        labels: deviceIds,
        datasets: [{
          label: 'Presence Events',
          data: presenceCounts,
          backgroundColor: 'rgba(84,131,179,0.7)',
          borderColor: '#5483B3',
          borderWidth: 1,
        }],
      },
      options: baseChartOptions(),
    });

    // --- Chart 4: Power Estimation kWh (AC_ON count x 1.5 kWh mock, filled line) ---
    const powerKwh = days.map(day =>
      events.filter(e => getDateStr(e.created_at) === day && e.event === 'AC_ON').length * 1.5
    );
    createOrUpdateChart('chartPower', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Est. kWh',
          data: powerKwh,
          borderColor: '#C1E8FF',
          backgroundColor: 'rgba(193,232,255,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
        }],
      },
      options: baseChartOptions(),
    });

  } catch (err) {
    console.error('Analytics load failed:', err);
  }
}

// ============================================================
// SECTION: Health Page
// ============================================================

/**
 * Update a health service card's indicator and sub-text.
 * @param {string} id     - Element ID of the health card (e.g. 'hc-mongo')
 * @param {string} status - 'healthy' | 'degraded' | 'down'
 * @param {string} sub    - Short status description
 */
function updateHealthCard(id, status, sub) {
  const card = document.getElementById(id);
  if (!card) return;

  // Update or create the indicator element
  let indicator = card.querySelector('.health-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'health-indicator';
    card.appendChild(indicator);
  }
  indicator.className = `health-indicator ${status}`;

  // Update or create the sub-text element
  let subEl = card.querySelector('.health-sub');
  if (!subEl) {
    subEl = document.createElement('div');
    subEl.className = 'health-sub';
    card.appendChild(subEl);
  }
  subEl.textContent = sub;

  // Also update the visible status text in .health-card-status if present
  const statusEl = card.querySelector('.health-card-status');
  if (statusEl) statusEl.textContent = sub;
}

/**
 * Measure API latency, update health stat cards, service cards, and endpoint table.
 */
async function refreshHealth() {
  let latencyMs = null;
  let fetchOk   = false;
  let eventCount = 0;

  // Measure latency against /api/events
  try {
    const t0  = performance.now();
    const res = await fetch(`${API_BASE}/events`);
    latencyMs = Math.round(performance.now() - t0);
    if (res.ok) {
      fetchOk = true;
      const data = await res.json();
      eventCount = Array.isArray(data) ? data.length : 0;
    }
  } catch { /* latencyMs stays null */ }

  // --- Stat cards ---
  const latencyEl = document.querySelector('#healthLatency .stat-value');
  const uptimeEl  = document.querySelector('#healthUptime  .stat-value');
  const statusEl  = document.querySelector('#healthStatus  .stat-value');

  if (latencyEl) latencyEl.textContent = latencyMs != null ? `${latencyMs}ms` : 'N/A';
  if (uptimeEl)  uptimeEl.textContent  = '99.9%';
  if (statusEl) {
    statusEl.textContent = fetchOk ? 'Operational' : 'Degraded';
    statusEl.style.color = fetchOk ? 'var(--success)' : 'var(--warning, #f59e0b)';
  }

  // --- Service cards ---
  updateHealthCard('hc-mongo',    fetchOk ? 'healthy'  : 'down',     fetchOk ? 'Connected'    : 'Unreachable');
  updateHealthCard('hc-postgres', eventCount > 0 ? 'healthy' : 'degraded', eventCount > 0 ? 'Connected' : 'No data');
  updateHealthCard('hc-iothub',   'degraded', 'Not verified');
  updateHealthCard('hc-supabase', 'degraded', 'Not configured');

  // --- Endpoint table ---
  const tbody = document.getElementById('healthEndpointsBody');
  if (!tbody) return;

  const latencyDisplay = latencyMs != null ? `${latencyMs}ms` : 'N/A';
  const okBadge   = '<span class="event-badge AC_ON"  style="font-size:11px">200 OK</span>';
  const errBadge  = '<span class="event-badge AC_OFF" style="font-size:11px">Error</span>';

  const endpoints = [
    { method: 'GET',  path: '/api/events',            ok: fetchOk },
    { method: 'GET',  path: '/api/devices/:id',        ok: fetchOk },
    { method: 'POST', path: '/api/devices/sync',       ok: fetchOk },
    { method: 'POST', path: '/api/events',             ok: fetchOk },
    { method: 'GET',  path: '/status',                 ok: fetchOk },
  ];

  tbody.innerHTML = endpoints.map(ep => `
    <tr>
      <td><code>${escHtml(ep.path)}</code></td>
      <td><span class="event-badge other" style="font-size:11px">${escHtml(ep.method)}</span></td>
      <td>${ep.ok ? okBadge : errBadge}</td>
      <td style="color:var(--text-muted)">${latencyDisplay}</td>
    </tr>`).join('');
}

// ============================================================
// SECTION: Modal
// ============================================================

/**
 * Open the confirmation modal with a custom title, message, and confirm callback.
 * @param {string}   title     - Modal heading text
 * @param {string}   message   - Modal body text
 * @param {Function} onConfirm - Called when the user clicks OK
 */
function openModal(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOkBtn').onclick       = () => {
    onConfirm();
    closeModal();
  };
  document.getElementById('confirmModal').classList.add('open');
}

/**
 * Close the confirmation modal.
 */
function closeModal() {
  document.getElementById('confirmModal').classList.remove('open');
}

// ============================================================
// SECTION: Helpers
// ============================================================

/**
 * Fetch all events from the API. Throws on non-OK responses.
 * @returns {Promise<Array>}
 */
async function fetchEvents() {
  const res = await fetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error(`Failed to fetch events (HTTP ${res.status})`);
  return res.json();
}

/**
 * Render a single event as a 5-column table row (used in dashboard).
 * Columns: device_id, event badge, temperature, presence badge, time IST.
 * @param {object} e - Event object
 * @returns {string} HTML string
 */
function renderEventRow(e) {
  const temp = e.temperature != null
    ? `${escHtml(String(e.temperature))} &deg;C`
    : '<span style="color:var(--text-muted)">&#8212;</span>';
  return `
    <tr>
      <td><code>${escHtml(e.device_id)}</code></td>
      <td>${eventBadge(e.event)}</td>
      <td>${temp}</td>
      <td>${presenceBadge(e.presence)}</td>
      <td style="color:var(--text-muted);font-size:12px">${formatIST(e.created_at)}</td>
    </tr>`;
}

/**
 * Return an HTML badge span for an event type.
 * @param {string} event
 * @returns {string}
 */
function eventBadge(event) {
  const cls = ['AC_ON', 'AC_OFF', 'SYNC'].includes(event) ? event : 'other';
  return `<span class="event-badge ${cls}">${escHtml(event)}</span>`;
}

/**
 * Return an HTML presence indicator.
 * @param {boolean|null|undefined} presence
 * @returns {string}
 */
function presenceBadge(presence) {
  if (presence === null || presence === undefined) {
    return '<span style="color:var(--text-muted)">&#8212;</span>';
  }
  return presence
    ? '<span style="color:var(--success)">&#10003; Yes</span>'
    : '<span style="color:var(--danger)">&#10007; No</span>';
}

/**
 * Format a date string to IST locale (en-IN, Asia/Kolkata, 12-hour, dd/mm/yyyy hh:mm:ss).
 * @param {string} dateStr
 * @returns {string}
 */
function formatIST(dateStr) {
  if (!dateStr) return '&#8212;';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} str
 * @returns {string}
 */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/**
 * Set a result box element's class and text content.
 * @param {HTMLElement} el
 * @param {string}      type    - 'success' | 'error' | '' (neutral)
 * @param {string}      message
 */
function showResult(el, type, message) {
  if (!el) return;
  el.className    = `result-box ${type}`.trim();
  el.textContent  = message;
}

/**
 * Return an array of the last 7 date strings in YYYY-MM-DD format, ending today.
 * @returns {string[]}
 */
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Extract the YYYY-MM-DD portion from a date string.
 * @param {string} dateStr
 * @returns {string}
 */
function getDateStr(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().slice(0, 10);
}

// ============================================================
// SECTION: Init
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Attach click listeners to all sidebar nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });

  // Initial server status check + periodic polling every 30 seconds
  checkServerStatus();
  setInterval(checkServerStatus, 30_000);

  // Load the default page (dashboard)
  refreshDashboard();
});
