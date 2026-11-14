// --- STATE MANAGEMENT ---
const STORAGE_KEY = 'df_privacy_history_v1';

let currentScan = {
  id: null,
  timestamp: 'Not yet scanned',
  emails: [],
  phones: [],
  cnics: [],
  names: [],
  riskScore: 0,
  riskLevel: 'Low Risk'
};

const socialChecklistItems = [
  { id: 's1', label: 'Two-Factor Authentication (2FA) enabled on primary accounts', weight: 20, checked: false },
  { id: 's2', label: 'Phone number hidden from public profile lookup', weight: 20, checked: false },
  { id: 's3', label: 'Primary email address removed from public bios', weight: 15, checked: false },
  { id: 's4', label: 'Social media posts restricted to Friends / Connections only', weight: 20, checked: false },
  { id: 's5', label: 'Location tagging disabled on uploaded photos', weight: 15, checked: false },
  { id: 's6', label: 'Search engine indexing turned off for public profiles', weight: 10, checked: false }
];

// --- URL ROUTER & HISTORY API ---
function updateRoute(route, extraParams = {}) {
  const validRoutes = ['scanner', 'checklist', 'dashboard', 'history', 'report'];
  const activeRoute = validRoutes.includes(route) ? route : 'scanner';

  // Switch active tab button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === activeRoute);
  });

  // Switch visible section
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });
  const targetSection = document.getElementById(`view-${activeRoute}`);
  if (targetSection) targetSection.classList.add('active');

  // Build dynamic URL hash + query parameters
  const params = new URLSearchParams();
  if (currentScan.id) params.set('scanId', currentScan.id);
  if (currentScan.riskScore > 0) params.set('risk', currentScan.riskScore);
  Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));

  const queryString = params.toString();
  const newHash = queryString ? `#${activeRoute}?${queryString}` : `#${activeRoute}`;

  try {
    window.history.pushState({ route: activeRoute }, '', newHash);
  } catch (e) {
    window.location.hash = newHash;
  }

  document.getElementById('liveUrlDisplay').textContent = `index.html${newHash}`;

  if (activeRoute === 'dashboard') renderCharts();
  if (activeRoute === 'report') renderReport();
  if (activeRoute === 'history') renderHistory();
}

// Listen to browser back/forward buttons
window.addEventListener('popstate', () => {
  const rawHash = window.location.hash.replace('#', '').split('?')[0];
  updateRoute(rawHash || 'scanner');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => updateRoute(btn.dataset.route));
});

// --- PERSONAL INFORMATION REGEX DETECTOR ---
function analyzeText(text) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const cnicRegex = /\b\d{5}-\d{7}-\d{1}\b/g;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,4}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
  // Detects capitalized Full Names (e.g., Ali Raza, Sara Khan) excluding common sentence starters
  const nameRegex = /\b(?!Contact|Email|Phone|Address|Name|Digital|Privacy|Hello|Dear)[A-Z][a-z]{2,15}\s[A-Z][a-z]{2,15}\b/g;

  const emails = [...new Set(text.match(emailRegex) || [])];
  const cnics = [...new Set(text.match(cnicRegex) || [])];

  // Filter out CNIC fragments from phone matches
  const rawPhones = [...new Set(text.match(phoneRegex) || [])];
  const phones = rawPhones.filter(p => !cnics.some(c => c.includes(p.trim())));

  const names = [...new Set(text.match(nameRegex) || [])];

  // Weighted Exposure Score Calculation (Max 100)
  let score = (cnics.length * 35) + (phones.length * 20) + (emails.length * 15) + (names.length * 10);
  score = Math.min(100, score);

  let level = 'Low Exposure';
  if (score >= 70) level = 'Critical Exposure';
  else if (score >= 40) level = 'Moderate Exposure';
  else if (score > 0) level = 'Low-Moderate Exposure';

  return {
    id: 'SCAN-' + Date.now().toString().slice(-5),
    timestamp: new Date().toLocaleString(),
    emails,
    phones,
    cnics,
    names,
    riskScore: score,
    riskLevel: level
  };
}

// --- TRIGGER SCAN & ANIMATION ---
document.getElementById('scanBtn').addEventListener('click', () => {
  const text = document.getElementById('inputText').value.trim();
  if (!text) {
    alert('Please paste or load sample text before running a scan.');
    return;
  }

  const scanBox = document.getElementById('scanBox');
  scanBox.classList.remove('scanning');
  void scanBox.offsetWidth; // trigger reflow for restart
  scanBox.classList.add('scanning');

  setTimeout(() => {
    currentScan = analyzeText(text);
    updateScannerUI(currentScan);
    saveToHistory(currentScan);
    updateRoute('scanner', { scanId: currentScan.id, risk: currentScan.riskScore });
  }, 550);
});

document.getElementById('loadSampleBtn').addEventListener('click', () => {
  document.getElementById('inputText').value =
    "Hi, I am Kamran Ahmed based in Karachi. For freelance inquiries, reach me at kamran.ahmed92@gmail.com or call +92 321 9876543. Verification CNIC: 42201-7654321-9.";
});

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('inputText').value = '';
});

function updateScannerUI(data) {
  document.getElementById('scoreNumber').textContent = data.riskScore;
  document.getElementById('riskBadge').textContent = data.riskLevel;

  document.getElementById('countEmail').textContent = data.emails.length;
  document.getElementById('countPhone').textContent = data.phones.length;
  document.getElementById('countCnic').textContent = data.cnics.length;
  document.getElementById('countName').textContent = data.names.length;

  // Update SVG Circle Gauge
  const circle = document.getElementById('gaugeCircle');
  const circumference = 352;
  const offset = circumference - (data.riskScore / 100) * circumference;
  circle.style.strokeDashoffset = offset;

  if (data.riskScore >= 70) circle.style.stroke = '#dc2626';
  else if (data.riskScore >= 40) circle.style.stroke = '#d97706';
  else circle.style.stroke = '#16a34a';

  // Populate Detected Entities
  const box = document.getElementById('detectedItemsBox');
  const allItems = [
    ...data.cnics.map(v => `CNIC: ${v}`),
    ...data.emails.map(v => `Email: ${v}`),
    ...data.phones.map(v => `Phone: ${v}`),
    ...data.names.map(v => `Name: ${v}`)
  ];

  if (allItems.length === 0) {
    box.innerHTML = '<p class="muted-text">Clean scan. No sensitive personal identifiers detected.</p>';
  } else {
    box.innerHTML = allItems.map(item => `<span class="tag-item">${item}</span>`).join('');
  }
}

// --- SOCIAL PRIVACY CHECKLIST ---
function renderChecklist() {
  const container = document.getElementById('checklistContainer');
  container.innerHTML = socialChecklistItems.map(item => `
    <label class="check-item">
      <span>${item.label}</span>
      <input type="checkbox" data-id="${item.id}" ${item.checked ? 'checked' : ''} />
    </label>
  `).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const target = socialChecklistItems.find(i => i.id === e.target.dataset.id);
      if (target) target.checked = e.target.checked;
      updateChecklistScore();
    });
  });

  updateChecklistScore();
}

function getSocialProtectionPercentage() {
  return socialChecklistItems.reduce((sum, item) => sum + (item.checked ? item.weight : 0), 0);
}

function updateChecklistScore() {
  document.getElementById('checklistScoreText').textContent = `${getSocialProtectionPercentage()}%`;
}

// --- INTERACTIVE CANVAS CHARTS ---
function renderCharts() {
  // 1. Bar Chart
  const barCanvas = document.getElementById('barChart');
  const bCtx = barCanvas.getContext('2d');
  bCtx.clearRect(0, 0, barCanvas.width, barCanvas.height);

  const labels = ['Emails', 'Phones', 'CNICs', 'Names'];
  const values = [
    currentScan.emails.length,
    currentScan.phones.length,
    currentScan.cnics.length,
    currentScan.names.length
  ];
  const maxVal = Math.max(...values, 4);
  const barWidth = 52;
  const gap = 45;
  const startX = 55;
  const baseY = 215;

  labels.forEach((label, idx) => {
    const val = values[idx];
    const barHeight = (val / maxVal) * 150;
    const x = startX + idx * (barWidth + gap);
    const y = baseY - barHeight;

    bCtx.fillStyle = '#16a34a';
    bCtx.beginPath();
    bCtx.roundRect(x, y, barWidth, barHeight, [6, 6, 0, 0]);
    bCtx.fill();

    bCtx.fillStyle = '#0f3d26';
    bCtx.font = 'bold 13px sans-serif';
    bCtx.textAlign = 'center';
    bCtx.fillText(val, x + barWidth / 2, y - 8);
    bCtx.fillText(label, x + barWidth / 2, baseY + 20);
  });

  // 2. Donut Chart
  const donutCanvas = document.getElementById('donutChart');
  const dCtx = donutCanvas.getContext('2d');
  dCtx.clearRect(0, 0, donutCanvas.width, donutCanvas.height);

  const cx = donutCanvas.width / 2;
  const cy = donutCanvas.height / 2;
  const radius = 82;
  const riskAngle = (currentScan.riskScore / 100) * Math.PI * 2;

  // Safe background ring
  dCtx.beginPath();
  dCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  dCtx.strokeStyle = '#bbf7d0';
  dCtx.lineWidth = 22;
  dCtx.stroke();

  // Risk arc
  if (currentScan.riskScore > 0) {
    dCtx.beginPath();
    dCtx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + riskAngle);
    dCtx.strokeStyle = currentScan.riskScore >= 70 ? '#dc2626' : '#16a34a';
    dCtx.lineWidth = 22;
    dCtx.stroke();
  }

  dCtx.fillStyle = '#0f3d26';
  dCtx.font = 'bold 20px sans-serif';
  dCtx.textAlign = 'center';
  dCtx.fillText(`${currentScan.riskScore}% Risk`, cx, cy + 6);
}

// --- LOCALSTORAGE HISTORY ---
function saveToHistory(scan) {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  existing.unshift(scan);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, 15)));
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  if (items.length === 0) {
    list.innerHTML = '<p class="muted-text">No previous scans saved yet.</p>';
    return;
  }

  list.innerHTML = items.map((item, index) => `
    <div class="history-item">
      <div>
        <strong>${item.id} — ${item.riskLevel} (${item.riskScore}/100)</strong>
        <p class="muted-text">${item.timestamp} | Emails: ${item.emails.length}, Phones: ${item.phones.length}, CNICs: ${item.cnics.length}</p>
      </div>
      <button type="button" class="btn-outline" onclick="loadHistoryItem(${index})">Load Report</button>
    </div>
  `).join('');
}

window.loadHistoryItem = function(index) {
  const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (items[index]) {
    currentScan = items[index];
    updateScannerUI(currentScan);
    updateRoute('report', { scanId: currentScan.id });
  }
};

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

// --- REPORT GENERATOR ---
function renderReport() {
  document.getElementById('reportTimestamp').textContent = `Report ID: ${currentScan.id || 'N/A'} | Generated: ${currentScan.timestamp}`;
  document.getElementById('repScore').textContent = `${currentScan.riskScore} / 100`;
  document.getElementById('repLevel').textContent = currentScan.riskLevel;
  document.getElementById('repSocial').textContent = `${getSocialProtectionPercentage()}%`;

  const entitiesDiv = document.getElementById('repEntities');
  entitiesDiv.innerHTML = `
    <p><strong>Emails (${currentScan.emails.length}):</strong> ${currentScan.emails.join(', ') || 'None'}</p>
    <p><strong>Phone Numbers (${currentScan.phones.length}):</strong> ${currentScan.phones.join(', ') || 'None'}</p>
    <p><strong>CNIC Patterns (${currentScan.cnics.length}):</strong> ${currentScan.cnics.join(', ') || 'None'}</p>
    <p><strong>Full Names (${currentScan.names.length}):</strong> ${currentScan.names.join(', ') || 'None'}</p>
  `;

  const recs = [];
  if (currentScan.cnics.length > 0) recs.push('CRITICAL: Immediately remove your CNIC number from public text to prevent identity theft.');
  if (currentScan.phones.length > 0) recs.push('Replace personal phone numbers with a dedicated business line or contact form.');
  if (currentScan.emails.length > 0) recs.push('Use an email alias instead of your primary personal email on public profiles.');
  if (getSocialProtectionPercentage() < 80) recs.push('Complete remaining items in the Social Privacy Checklist to harden account visibility.');
  if (recs.length === 0) recs.push('Your exposure footprint is minimal. Continue auditing public bios periodically.');

  document.getElementById('repRecommendations').innerHTML = recs.map(r => `<li>${r}</li>`).join('');
}

document.getElementById('copyReportBtn').addEventListener('click', () => {
  const summary = `Digital Footprint Report (${currentScan.id || 'Draft'})\nRisk Score: ${currentScan.riskScore}/100 (${currentScan.riskLevel})\nEmails: ${currentScan.emails.length}, Phones: ${currentScan.phones.length}, CNICs: ${currentScan.cnics.length}, Names: ${currentScan.names.length}`;
  navigator.clipboard.writeText(summary);
  alert('Report summary copied to clipboard.');
});

// --- INITIALIZE APP ---
renderChecklist();
const initialRoute = window.location.hash.replace('#', '').split('?')[0] || 'scanner';
updateRoute(initialRoute);