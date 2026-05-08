'use strict';

/* ================================================================
   AbyssFetch – Frontend Application
   ================================================================ */

const API = 'http://127.0.0.1:57315';

// State
const state = {
  currentMetadata: null,
  currentUrl: '',
  clipboardUrl: null,
  clipboardWatching: false,
  clipboardTimer: null,
  lastClipboard: '',
  config: {},
  sseConnections: new Map(),
  fetchInProgress: false,
  appRoot: '',
  tools: {
    ytdlp: false,
    ffmpeg: false,
    ffprobe: false,
    checked: false
  }
};

// ================================================================
// INIT
// ================================================================
function init() {
  setupUIListeners();
  loadAppRoot();
  checkStatus();
  loadSettings().then(() => {
    applySettingsToUI();
    checkDrive();
  });
  loadQueue();
  setupDropZone();

  // Poll queue every 5s to catch updates from other sessions
  setInterval(loadQueue, 5000);
}

// ================================================================
// STATUS CHECK
// ================================================================
async function checkStatus() {
  const pillYtdlp = document.getElementById('pillYtdlp');
  const pillFfmpeg = document.getElementById('pillFfmpeg');
  try {
    const res = await apiFetch('/api/status');
    const data = await res.json();

    state.tools = {
      ytdlp: !!(data.ytdlp && data.ytdlp.available),
      ffmpeg: !!(data.ffmpeg && data.ffmpeg.available),
      ffprobe: !!(data.ffprobe && data.ffprobe.available),
      checked: true
    };

    setPillStatus(pillYtdlp, data.ytdlp && data.ytdlp.available, data.ytdlp && data.ytdlp.version);
    setPillStatus(pillFfmpeg, data.ffmpeg && data.ffmpeg.available, data.ffmpeg && data.ffmpeg.version);
    renderToolSetup();
    refreshPrimaryActions();

    if (!state.tools.ytdlp) {
      showNotification('yt-dlp.exe is missing from bin/. Fetch and downloads stay disabled until you add it.', 'warn', 8000);
    }
    const missingMediaTools = getMissingMediaTools();
    if (missingMediaTools.length) {
      showNotification(`Missing from bin/: ${missingMediaTools.join(', ')}. MP4 merges and conversions are disabled.`, 'warn', 8000);
    }
  } catch (_) {
    state.tools = { ytdlp: false, ffmpeg: false, ffprobe: false, checked: true };
    setPillStatus(pillYtdlp, false, null);
    setPillStatus(pillFfmpeg, false, null);
    renderToolSetup();
    refreshPrimaryActions();
    showNotification('Cannot reach backend. Is the app running correctly?', 'error', 0);
  }
}

function setPillStatus(pill, ok, version) {
  if (!pill) return;
  pill.classList.toggle('ok', !!ok);
  pill.classList.toggle('err', !ok);
  if (version) pill.title = version;
}

// ================================================================
// DRIVE CHECK
// ================================================================
async function checkDrive() {
  const pillDrive = document.getElementById('pillDrive');
  try {
    const res = await apiFetch('/api/diskspace');
    const data = await res.json();
    const ok = data.sufficient !== false && !data.error;
    if (pillDrive) {
      pillDrive.classList.toggle('ok', ok);
      pillDrive.classList.toggle('warn', !ok);
      if (data.formatted) {
        pillDrive.title = `Free: ${data.formatted.available} / ${data.formatted.total}`;
        pillDrive.querySelector('.pill-label').textContent = ok ? 'drive ok' : 'low space';
      }
    }
    if (!ok && !data.error) {
      showNotification('Low disk space in downloads folder.', 'warn', 5000);
    }
    if (data.error && data.error.includes('not exist')) {
      showNotification('Download folder not found. Check settings.', 'warn', 6000);
    }
  } catch (_) {
    if (pillDrive) pillDrive.classList.add('warn');
  }
}

// ================================================================
// UI EVENT LISTENERS
// ================================================================
function setupUIListeners() {
  const urlInput = document.getElementById('urlInput');
  const btnFetch = document.getElementById('btnFetch');
  const btnClearUrl = document.getElementById('btnClearUrl');
  const btnDownload = document.getElementById('btnDownload');
  const btnQueue = document.getElementById('btnQueue');
  const btnSettings = document.getElementById('btnSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnOpenDownloads = document.getElementById('btnOpenDownloads');
  const btnOpenLogs = document.getElementById('btnOpenLogs');
  const btnClearCompleted = document.getElementById('btnClearCompleted');
  const toggleClipboard = document.getElementById('toggleClipboard');
  const toggleAdvanced = document.getElementById('toggleAdvanced');
  const advancedSection = document.getElementById('advancedSection');
  const formatSelect = document.getElementById('formatSelect');
  const qualitySelect = document.getElementById('qualitySelect');
  const btnPlaylistConfirm = document.getElementById('btnPlaylistConfirm');
  const btnPlaylistCancel = document.getElementById('btnPlaylistCancel');
  const btnAddClipboard = document.getElementById('btnAddClipboard');
  const btnDismissClipboard = document.getElementById('btnDismissClipboard');
  const btnOpenBinFolder = document.getElementById('btnOpenBinFolder');
  const btnGetYtdlp = document.getElementById('btnGetYtdlp');
  const btnGetFfmpeg = document.getElementById('btnGetFfmpeg');

  // URL input
  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    state.currentUrl = val;
    btnClearUrl.style.display = val ? 'block' : 'none';
    const hasUrl = val.length > 3;
    urlInput.classList.toggle('has-url', hasUrl);
    urlInput.classList.remove('invalid');
    if (state.currentMetadata && !val.includes(state.currentMetadata.id)) {
      hidePreview();
    }
    refreshPrimaryActions();
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnFetch.disabled) {
      fetchVideoInfo(urlInput.value.trim());
    }
  });

  btnClearUrl.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.dispatchEvent(new Event('input'));
    hidePreview();
    urlInput.focus();
  });

  btnFetch.addEventListener('click', () => {
    fetchVideoInfo(urlInput.value.trim());
  });

  btnDownload.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return;
    downloadCurrent(url);
  });

  btnQueue.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) return;
    downloadCurrent(url);
  });

  // Format/quality intelligence
  qualitySelect.addEventListener('change', () => {
    if (qualitySelect.value === 'audio only') {
      formatSelect.value = 'm4a';
    }
  });

  formatSelect.addEventListener('change', () => {
    if ((formatSelect.value === 'mp3' || formatSelect.value === 'm4a') &&
        qualitySelect.value !== 'audio only') {
      qualitySelect.value = 'audio only';
    }
  });

  // Advanced toggle
  toggleAdvanced.addEventListener('change', () => {
    advancedSection.style.display = toggleAdvanced.checked ? 'block' : 'none';
  });

  // Clipboard watcher
  toggleClipboard.addEventListener('change', () => {
    if (toggleClipboard.checked) {
      startClipboardWatcher();
    } else {
      stopClipboardWatcher();
    }
  });

  // Clipboard alert actions
  if (btnAddClipboard) {
    btnAddClipboard.addEventListener('click', () => {
      if (state.clipboardUrl) {
        addToQueue(state.clipboardUrl, getDownloadOptions());
        dismissClipboardAlert();
      }
    });
  }

  if (btnDismissClipboard) {
    btnDismissClipboard.addEventListener('click', dismissClipboardAlert);
  }

  // Settings modal
  btnSettings.addEventListener('click', () => openSettings());
  btnCloseSettings.addEventListener('click', () => closeSettings());
  btnCancelSettings.addEventListener('click', () => closeSettings());
  btnSaveSettings.addEventListener('click', () => saveSettings());

  // Settings overlay click outside
  document.getElementById('settingsOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });

  // Footer buttons
  btnOpenDownloads.addEventListener('click', () => {
    openFolder(state.config.downloadRoot || './downloads');
  });

  btnOpenLogs.addEventListener('click', () => {
    openFolder('./portable/logs');
  });

  if (btnOpenBinFolder) {
    btnOpenBinFolder.addEventListener('click', () => {
      openBinFolder();
    });
  }

  if (btnGetYtdlp) {
    btnGetYtdlp.addEventListener('click', () => {
      openExternal('https://github.com/yt-dlp/yt-dlp/releases/latest');
    });
  }

  if (btnGetFfmpeg) {
    btnGetFfmpeg.addEventListener('click', () => {
      openExternal('https://www.gyan.dev/ffmpeg/builds/');
    });
  }

  // Clear completed
  btnClearCompleted.addEventListener('click', async () => {
    try {
      const queue = await (await apiFetch('/api/queue')).json();
      const completed = queue.filter(j => ['completed', 'cancelled', 'failed'].includes(j.status));
      await Promise.all(completed.map(j => apiFetch(`/api/queue/${j.id}`, { method: 'DELETE' })));
      loadQueue();
    } catch (err) {
      showNotification('Failed to clear completed jobs.', 'error');
    }
  });

  // Playlist dialog
  if (btnPlaylistConfirm) {
    btnPlaylistConfirm.addEventListener('click', () => {
      const rawCount = parseInt(document.getElementById('playlistItemCount').value, 10);
      const count = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : getPreferredBatchLimit();
      const dialog = document.getElementById('playlistDialog');
      const url = dialog.dataset.pendingUrl;
      if (url) {
        addToQueue(url, { ...getDownloadOptions(), playlistLimit: count });
        dialog.dataset.pendingUrl = '';
        dialog.style.display = 'none';
      }
    });
  }

  if (btnPlaylistCancel) {
    btnPlaylistCancel.addEventListener('click', () => {
      document.getElementById('playlistDialog').style.display = 'none';
    });
  }
}

// ================================================================
// FETCH VIDEO INFO
// ================================================================
async function fetchVideoInfo(url) {
  if (!url || state.fetchInProgress) return;
  if (!ensureYtdlpReady('Metadata fetch is unavailable until yt-dlp.exe is added to bin/.')) return;

  // Basic pre-flight
  if (!isLikelyYouTubeUrl(url)) {
    showUrlInvalid();
    showNotification('Please paste a valid YouTube URL.', 'error');
    return;
  }

  state.fetchInProgress = true;
  const btnFetch = document.getElementById('btnFetch');
  const origContent = btnFetch.innerHTML;
  btnFetch.innerHTML = '<span class="spinner"></span> FETCHING';
  btnFetch.disabled = true;

  try {
    const res = await apiFetch('/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const metadata = await res.json();
    state.currentMetadata = metadata;
    state.currentUrl = url;

    renderPreview(metadata);
    refreshPrimaryActions();
    if (isBatchSource(url, metadata)) {
      const batchLabel = getBatchLabel(metadata, url);
      showNotification(`${batchLabel} detected. Choose Download or Add to Queue to batch-fetch videos.`, 'info', 5000);
    }
  } catch (err) {
    showNotification(`Fetch failed: ${formatToolError(err.message)}`, 'error');
    showUrlInvalid();
  } finally {
    btnFetch.innerHTML = origContent;
    state.fetchInProgress = false;
    refreshPrimaryActions();
  }
}

function showUrlInvalid() {
  const urlInput = document.getElementById('urlInput');
  urlInput.classList.add('invalid');
  urlInput.classList.add('shake');
  setTimeout(() => urlInput.classList.remove('shake'), 500);
}

function isLikelyYouTubeUrl(url) {
  return /youtube\.com|youtu\.be/i.test(url);
}

// ================================================================
// RENDER PREVIEW
// ================================================================
function renderPreview(meta) {
  const card = document.getElementById('previewCard');
  const thumb = document.getElementById('previewThumb');
  const title = document.getElementById('previewTitle');
  const channel = document.getElementById('previewChannel');
  const duration = document.getElementById('previewDuration');
  const badge = document.getElementById('previewTypeBadge');
  const views = document.getElementById('previewViews');
  const date = document.getElementById('previewDate');

  if (meta.thumbnail) {
    thumb.src = meta.thumbnail;
    thumb.onerror = () => { thumb.style.display = 'none'; };
  }

  title.textContent = meta.title || 'Unknown Title';
  channel.textContent = meta.channel || (meta.requestedType === 'channel' ? 'Channel batch download' : '');
  duration.textContent = meta.durationString || formatDuration(meta.duration);

  let type = 'VIDEO';
  if (meta.webpage_url && meta.webpage_url.includes('/shorts/')) type = 'SHORTS';
  else if (meta.requestedType === 'channel') type = 'CHANNEL';
  else if (meta.requestedType === 'playlist' || meta._type === 'playlist') type = 'PLAYLIST';
  else if (meta.is_live) type = 'LIVE';
  badge.textContent = type;

  if (meta.playlist_count) {
    views.textContent = `${formatNumber(meta.playlist_count)} videos`;
  } else if (meta.view_count) {
    views.textContent = `${formatNumber(meta.view_count)} views`;
  } else {
    views.textContent = '';
  }
  if (meta.upload_date && meta.upload_date.length === 8) {
    const d = meta.upload_date;
    date.textContent = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  } else {
    date.textContent = '';
  }

  card.style.display = 'flex';
}

function hidePreview() {
  document.getElementById('previewCard').style.display = 'none';
  state.currentMetadata = null;
}

// ================================================================
// PLAYLIST DIALOG
// ================================================================
function showPlaylistDialog(url, meta) {
  const dialog = document.getElementById('playlistDialog');
  const body = document.getElementById('playlistDialogBody');
  const playlistItemCount = document.getElementById('playlistItemCount');
  const batchLabel = getBatchLabel(meta, url).toLowerCase();
  dialog.dataset.pendingUrl = url;
  const count = meta.playlist_count ? ` (${meta.playlist_count} videos found)` : '';
  body.textContent = `This URL points to a ${batchLabel}${count}. How many videos would you like to download?`;
  if (playlistItemCount) {
    playlistItemCount.value = getPreferredBatchLimit();
  }
  dialog.style.display = 'block';
}

// ================================================================
// DOWNLOAD / QUEUE
// ================================================================
async function downloadCurrent(url) {
  const opts = getDownloadOptions();
  opts.title = state.currentMetadata ? state.currentMetadata.title : 'Downloading...';

  if (isBatchSource(url, state.currentMetadata)) {
    showPlaylistDialog(url, state.currentMetadata || {});
    return;
  }

  await addToQueue(url, opts);
}

function isBatchSource(url, meta = null) {
  if (meta && (meta.requestedType === 'playlist' || meta.requestedType === 'channel')) {
    return true;
  }
  return /(list=)|youtube\.com\/(@|channel\/|c\/|user\/)/i.test(url);
}

function getBatchLabel(meta = null, url = '') {
  if (meta && meta.requestedType === 'channel') return 'Channel';
  if (meta && meta.requestedType === 'playlist') return 'Playlist';
  if (/youtube\.com\/(@|channel\/|c\/|user\/)/i.test(url || '')) return 'Channel';
  return 'Playlist';
}

function getPreferredBatchLimit() {
  const advancedLimit = parseInt(document.getElementById('playlistLimit')?.value, 10);
  if (Number.isInteger(advancedLimit) && advancedLimit >= 0) {
    return advancedLimit;
  }
  if (Number.isInteger(state.config.playlistLimit) && state.config.playlistLimit >= 0) {
    return state.config.playlistLimit;
  }
  return 10;
}

async function addToQueue(url, options = {}) {
  if (!ensureYtdlpReady('Downloads are unavailable until yt-dlp.exe is added to bin/.')) return;
  try {
    const res = await apiFetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        format: options.format || 'mp4',
        quality: options.quality || 'best',
        playlistLimit: options.playlistLimit,
        saveThumbnail: options.saveThumbnail || false,
        saveInfoJson: options.saveInfoJson || false,
        saveSubtitles: options.saveSubtitles || false,
        title: options.title || 'New Download'
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    showNotification('Download started!', 'success', 3000);
    loadQueue();
    connectSSE(data.jobId);
  } catch (err) {
    showNotification(`Queue error: ${formatToolError(err.message)}`, 'error');
  }
}

function getDownloadOptions() {
  return {
    format: document.getElementById('formatSelect').value,
    quality: document.getElementById('qualitySelect').value,
    playlistLimit: getPreferredBatchLimit(),
    saveThumbnail: document.getElementById('toggleThumbnail').checked,
    saveInfoJson: document.getElementById('toggleInfoJson').checked,
    saveSubtitles: document.getElementById('toggleSubtitles').checked
  };
}

// ================================================================
// SSE PROGRESS
// ================================================================
function connectSSE(jobId) {
  if (state.sseConnections.has(jobId)) return;

  const evtSource = new EventSource(`${API}/api/progress/${jobId}`);
  state.sseConnections.set(jobId, evtSource);

  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      updateJobProgress(jobId, data);
      if (['completed', 'failed', 'cancelled'].includes(data.status)) {
        evtSource.close();
        state.sseConnections.delete(jobId);
        // Refresh full queue after a moment
        setTimeout(loadQueue, 500);
      }
    } catch (_) { /* ignore malformed */ }
  };

  evtSource.onerror = () => {
    evtSource.close();
    state.sseConnections.delete(jobId);
  };
}

function updateJobProgress(jobId, data) {
  const item = document.getElementById(`job-${jobId}`);
  if (!item) {
    // Item not rendered yet — render queue
    loadQueue();
    return;
  }

  // Update progress bar
  const fill = item.querySelector('.progress-bar-fill');
  const pct = item.querySelector('.progress-percent');
  const progressWrap = item.querySelector('.progress-wrap');
  if (fill && data.progress !== undefined) {
    fill.style.width = `${Math.max(0, Math.min(100, data.progress))}%`;
    if (pct) pct.textContent = `${Math.round(data.progress)}%`;
    if (progressWrap) progressWrap.style.display = '';
  }

  // Status badge
  const badge = item.querySelector('.queue-status-badge');
  if (badge && data.status) {
    badge.textContent = data.status.toUpperCase();
    badge.className = `queue-status-badge ${data.status}`;
  }

  // Stats
  const stats = item.querySelector('.queue-stats');
  if (stats && (data.speed || data.eta)) {
    stats.innerHTML = `
      ${data.speed ? `<span>⚡ ${data.speed}</span>` : ''}
      ${data.eta ? `<span>ETA ${data.eta}</span>` : ''}
      ${data.totalSize ? `<span>${data.totalSize}</span>` : ''}
    `;
  }

  // Error
  const errEl = item.querySelector('.queue-error');
  if (errEl) {
    if (data.error) {
      errEl.textContent = data.error;
      errEl.style.display = '';
    } else {
      errEl.style.display = 'none';
    }
  }

  // Item class
  item.className = `queue-item ${data.status || 'queued'}`;
}

// ================================================================
// QUEUE MANAGEMENT
// ================================================================
async function loadQueue() {
  try {
    const res = await apiFetch('/api/queue');
    if (!res.ok) return;
    const items = await res.json();
    renderQueue(items);

    const count = items.length;
    const el = document.getElementById('queueCount');
    if (el) el.textContent = `${count} item${count !== 1 ? 's' : ''}`;

    // Connect SSE for active jobs
    items.forEach(job => {
      if (job.status === 'downloading' || job.status === 'queued') {
        connectSSE(job.id);
      }
    });
  } catch (_) { /* backend might not be ready */ }
}

function renderQueue(items) {
  const list = document.getElementById('queueList');
  const emptyEl = document.getElementById('queueEmpty');
  if (!list) return;

  if (!items || items.length === 0) {
    emptyEl.style.display = 'flex';
    // Clear non-empty items
    Array.from(list.querySelectorAll('.queue-item')).forEach(el => el.remove());
    return;
  }

  emptyEl.style.display = 'none';

  // Update existing / add new items
  const existingIds = new Set(
    Array.from(list.querySelectorAll('.queue-item')).map(el => el.dataset.jobId)
  );

  // Remove stale items
  existingIds.forEach(id => {
    if (!items.find(j => j.id === id)) {
      const el = document.getElementById(`job-${id}`);
      if (el) el.remove();
    }
  });

  // Add/update items
  items.forEach((job, idx) => {
    let item = document.getElementById(`job-${job.id}`);
    if (!item) {
      item = createQueueItemEl(job);
      list.appendChild(item);
    } else {
      // Update in place via updateJobProgress
      updateJobProgress(job.id, job);
    }
  });
}

function createQueueItemEl(job) {
  const div = document.createElement('div');
  div.className = `queue-item ${job.status || 'queued'}`;
  div.id = `job-${job.id}`;
  div.dataset.jobId = job.id;

  const showProgress = job.status === 'downloading' || job.status === 'completed';
  const progressWidth = Math.max(0, Math.min(100, job.progress || 0));

  div.innerHTML = `
    <div class="queue-item-header">
      <div class="queue-item-title" title="${escHtml(job.title || job.url)}">${escHtml(job.title || 'New Download')}</div>
      <div class="queue-item-meta">
        <span class="queue-status-badge ${job.status || 'queued'}">${(job.status || 'queued').toUpperCase()}</span>
        <div class="queue-item-actions">
          ${job.status === 'completed' ? `<button class="btn btn-xs btn-ghost open-folder-btn" title="Open output folder">📂</button>` : ''}
          ${['queued','downloading'].includes(job.status) ? `<button class="btn btn-xs btn-danger cancel-btn" title="Cancel">✕</button>` : ''}
          ${['completed','failed','cancelled'].includes(job.status) ? `<button class="btn btn-xs btn-ghost remove-btn" title="Remove">✕</button>` : ''}
        </div>
      </div>
    </div>
    <div class="progress-wrap" style="${showProgress ? '' : 'display:none'}">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${progressWidth}%"></div>
      </div>
      <span class="progress-percent">${Math.round(progressWidth)}%</span>
    </div>
    <div class="queue-stats">
      ${job.speed ? `<span>⚡ ${job.speed}</span>` : ''}
      ${job.eta ? `<span>ETA ${job.eta}</span>` : ''}
    </div>
    <div class="queue-error" style="${job.error ? '' : 'display:none'}">${escHtml(job.error || '')}</div>
    <div class="queue-item-sub" style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono)">
      ${escHtml(job.format || 'mp4')} · ${escHtml(job.quality || 'best')}
    </div>
  `;

  // Bind buttons
  const cancelBtn = div.querySelector('.cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => cancelJob(job.id));
  }

  const removeBtn = div.querySelector('.remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => removeJob(job.id, div));
  }

  const openBtn = div.querySelector('.open-folder-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      openFolder(job.outputPath || state.config.downloadRoot || './downloads');
    });
  }

  return div;
}

async function cancelJob(id) {
  try {
    await apiFetch(`/api/queue/${id}`, { method: 'DELETE' });
    loadQueue();
  } catch (err) {
    showNotification('Failed to cancel job.', 'error');
  }
}

function removeJob(id, el) {
  apiFetch(`/api/queue/${id}`, { method: 'DELETE' }).catch(() => {});
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }
  loadQueue();
}

// ================================================================
// CLIPBOARD WATCHER
// ================================================================
function startClipboardWatcher() {
  if (state.clipboardTimer) return;
  state.clipboardWatching = true;
  state.clipboardTimer = setInterval(watchClipboard, 2000);
}

function stopClipboardWatcher() {
  state.clipboardWatching = false;
  if (state.clipboardTimer) {
    clearInterval(state.clipboardTimer);
    state.clipboardTimer = null;
  }
}

async function watchClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text || text === state.lastClipboard) return;
    state.lastClipboard = text;
    const trimmed = text.trim();
    if (isLikelyYouTubeUrl(trimmed) && trimmed !== state.currentUrl) {
      state.clipboardUrl = trimmed;
      showClipboardAlert(trimmed);
    }
  } catch (_) { /* permission denied or no focus */ }
}

function showClipboardAlert(url) {
  const alert = document.getElementById('clipboardAlert');
  const text = document.getElementById('clipboardAlertText');
  if (!alert) return;
  text.textContent = `Detected: ${truncate(url, 50)}`;
  alert.style.display = 'flex';
}

function dismissClipboardAlert() {
  const alert = document.getElementById('clipboardAlert');
  if (alert) alert.style.display = 'none';
  state.clipboardUrl = null;
}

// ================================================================
// DRAG AND DROP
// ================================================================
function setupDropZone() {
  const overlay = document.getElementById('dropOverlay');

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (overlay) overlay.style.display = 'flex';
  });

  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || e.relatedTarget === document.body) {
      if (overlay) overlay.style.display = 'none';
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (overlay) overlay.style.display = 'none';

    const files = Array.from(e.dataTransfer.files || []);
    const textFile = files.find(f =>
      f.name.endsWith('.txt') || f.type === 'text/plain'
    );

    if (textFile) {
      await handleDropZone(textFile);
    } else {
      // Try reading dragged text
      const text = e.dataTransfer.getData('text/plain');
      if (text && isLikelyYouTubeUrl(text)) {
        addToQueue(text.trim(), getDownloadOptions());
        showNotification('URL added to queue from drag.', 'info', 3000);
      } else {
        showNotification('Drop a .txt file with YouTube URLs, or drag a URL directly.', 'warn', 4000);
      }
    }
  });
}

async function handleDropZone(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result || '';
      const lines = content.split('\n').map(l => l.trim()).filter(l => isLikelyYouTubeUrl(l));
      if (lines.length === 0) {
        showNotification('No valid YouTube URLs found in the file.', 'warn');
        return resolve();
      }
      const confirmed = window.confirm(
        `Found ${lines.length} YouTube URL${lines.length > 1 ? 's' : ''} in the file.\nAdd all to download queue?`
      );
      if (confirmed) {
        lines.forEach(url => addToQueue(url, getDownloadOptions()));
        showNotification(`Added ${lines.length} URL${lines.length > 1 ? 's' : ''} to queue.`, 'success', 3000);
      }
      resolve();
    };
    reader.onerror = () => {
      showNotification('Could not read dropped file.', 'error');
      resolve();
    };
    reader.readAsText(file);
  });
}

// ================================================================
// SETTINGS
// ================================================================
async function loadSettings() {
  try {
    const res = await apiFetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    state.config = cfg;
    return cfg;
  } catch (_) {
    state.config = {};
    return {};
  }
}

function applySettingsToUI() {
  const cfg = state.config;
  // Apply default toggle states
  const toggleThumbnail = document.getElementById('toggleThumbnail');
  const toggleSubtitles = document.getElementById('toggleSubtitles');
  const toggleInfoJson = document.getElementById('toggleInfoJson');
  const toggleAdvanced = document.getElementById('toggleAdvanced');
  const formatSelect = document.getElementById('formatSelect');
  const qualitySelect = document.getElementById('qualitySelect');

  if (toggleThumbnail) toggleThumbnail.checked = !!cfg.saveThumbnail;
  if (toggleSubtitles) toggleSubtitles.checked = !!cfg.saveSubtitles;
  if (toggleInfoJson) toggleInfoJson.checked = !!cfg.saveInfoJson;
  if (toggleAdvanced) {
    toggleAdvanced.checked = !!cfg.advancedMode;
    document.getElementById('advancedSection').style.display = cfg.advancedMode ? 'block' : 'none';
  }
  if (formatSelect && cfg.defaultFormat) formatSelect.value = cfg.defaultFormat;
  if (qualitySelect && cfg.defaultQuality) qualitySelect.value = cfg.defaultQuality;
  if (document.getElementById('playlistLimit')) {
    document.getElementById('playlistLimit').value = cfg.playlistLimit != null ? cfg.playlistLimit : 10;
  }
}

function openSettings() {
  const overlay = document.getElementById('settingsOverlay');
  const cfg = state.config;

  // Populate form
  setValue('cfgDownloadRoot', cfg.downloadRoot || './downloads');
  setValue('cfgVideoFolder', cfg.videoFolder || './downloads/video');
  setValue('cfgAudioFolder', cfg.audioFolder || './downloads/audio');
  setValue('cfgShortsFolder', cfg.shortsFolder || './downloads/shorts');
  setValue('cfgDefaultFormat', cfg.defaultFormat || 'mp4');
  setValue('cfgDefaultQuality', cfg.defaultQuality || 'best');
  setValue('cfgPlaylistLimit', cfg.playlistLimit != null ? cfg.playlistLimit : 10);
  setChecked('cfgSaveThumbnail', !!cfg.saveThumbnail);
  setChecked('cfgSaveSubtitles', !!cfg.saveSubtitles);
  setChecked('cfgSaveInfoJson', !!cfg.saveInfoJson);
  setChecked('cfgAdvancedMode', !!cfg.advancedMode);

  overlay.style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none';
}

async function saveSettings() {
  const newCfg = {
    downloadRoot: getVal('cfgDownloadRoot'),
    videoFolder: getVal('cfgVideoFolder'),
    audioFolder: getVal('cfgAudioFolder'),
    shortsFolder: getVal('cfgShortsFolder'),
    defaultFormat: getVal('cfgDefaultFormat'),
    defaultQuality: getVal('cfgDefaultQuality'),
    playlistLimit: (() => {
      const parsed = parseInt(getVal('cfgPlaylistLimit'), 10);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : 10;
    })(),
    saveThumbnail: getChecked('cfgSaveThumbnail'),
    saveSubtitles: getChecked('cfgSaveSubtitles'),
    saveInfoJson: getChecked('cfgSaveInfoJson'),
    advancedMode: getChecked('cfgAdvancedMode')
  };

  try {
    const res = await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCfg)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();
    state.config = result.config || newCfg;
    applySettingsToUI();
    closeSettings();
    showNotification('Settings saved.', 'success', 3000);
    checkDrive();
  } catch (err) {
    showNotification(`Failed to save settings: ${err.message}`, 'error');
  }
}

// ================================================================
// FOLDER OPENER
// ================================================================
function openFolder(folderPath) {
  if (window.electronAPI && window.electronAPI.openFolder) {
    window.electronAPI.openFolder(folderPath).catch(() => {});
  }
  // In browser/dev mode, nothing can be done
}

async function loadAppRoot() {
  if (state.appRoot || !window.electronAPI || !window.electronAPI.getAppRoot) return;
  try {
    state.appRoot = await window.electronAPI.getAppRoot();
  } catch (_) { /* ignore */ }
}

async function openBinFolder() {
  await loadAppRoot();
  openFolder(state.appRoot ? `${state.appRoot}/bin` : './bin');
}

function openExternal(targetUrl) {
  if (window.electronAPI && window.electronAPI.openExternal) {
    window.electronAPI.openExternal(targetUrl).catch(() => {});
    return;
  }
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}

// ================================================================
// NOTIFICATIONS
// ================================================================
function showNotification(message, type = 'info', autoDismiss = 5000) {
  const area = document.getElementById('notificationArea');
  if (!area) return;

  const note = document.createElement('div');
  note.className = `notification ${type}`;
  note.innerHTML = `
    <span>${escHtml(message)}</span>
    <button class="notification-close" aria-label="Dismiss">✕</button>
  `;
  note.querySelector('.notification-close').addEventListener('click', () => {
    note.remove();
  });

  area.appendChild(note);

  if (autoDismiss > 0) {
    setTimeout(() => {
      if (note.parentNode) {
        note.style.opacity = '0';
        note.style.transition = 'opacity 0.3s';
        setTimeout(() => note.remove(), 300);
      }
    }, autoDismiss);
  }
}

// Legacy helpers
function showError(msg) { showNotification(msg, 'error'); }
function showSuccess(msg) { showNotification(msg, 'success', 3000); }

// ================================================================
// UTILITY FUNCTIONS
// ================================================================
function apiFetch(path, options = {}) {
  return fetch(`${API}${path}`, options);
}

function refreshPrimaryActions() {
  const urlInput = document.getElementById('urlInput');
  const btnFetch = document.getElementById('btnFetch');
  const btnDownload = document.getElementById('btnDownload');
  const btnQueue = document.getElementById('btnQueue');
  if (!urlInput || !btnFetch || !btnDownload || !btnQueue) return;

  const hasUrl = urlInput.value.trim().length > 3;
  const canUseDownloader = !state.tools.checked || state.tools.ytdlp;
  btnFetch.disabled = !hasUrl || !canUseDownloader || state.fetchInProgress;
  btnDownload.disabled = !hasUrl || !canUseDownloader;
  btnQueue.disabled = !hasUrl || !canUseDownloader;
}

function renderToolSetup() {
  const card = document.getElementById('toolSetupCard');
  const copy = document.getElementById('toolSetupCopy');
  if (!card || !copy || !state.tools.checked) return;

  const missing = [];
  if (!state.tools.ytdlp) missing.push('yt-dlp.exe');
  missing.push(...getMissingMediaTools());

  if (!missing.length) {
    card.style.display = 'none';
    copy.textContent = '';
    return;
  }

  const parts = [];
  if (!state.tools.ytdlp) {
    parts.push('Add yt-dlp.exe to bin/ to re-enable metadata fetches and downloads.');
  }
  if (!state.tools.ffmpeg || !state.tools.ffprobe) {
    parts.push('Add both ffmpeg.exe and ffprobe.exe to bin/ so merges and audio conversions can run.');
  }
  copy.textContent = `Missing tools: ${missing.join(', ')}. ${parts.join(' ')}`;
  card.style.display = 'flex';
}

function ensureYtdlpReady(message) {
  if (!state.tools.checked || state.tools.ytdlp) return true;
  renderToolSetup();
  showNotification(message, 'warn', 7000);
  return false;
}

function formatToolError(message) {
  const raw = String(message || '').trim();
  if (/yt-dlp(?:\.exe)? is missing/i.test(raw) || /yt-dlp not found or failed to start/i.test(raw)) {
    return 'yt-dlp.exe is missing from bin/. Add it, then restart AbyssFetch.';
  }
  if (/(ffmpeg|ffprobe)(?:\.exe)?\s+is missing/i.test(raw) || /(ffmpeg|ffprobe).*(not found|failed to start)/i.test(raw)) {
    return 'ffmpeg.exe and ffprobe.exe must both be present in bin/ for merges and conversions.';
  }
  return raw || 'Request failed';
}

function getMissingMediaTools() {
  const missing = [];
  if (!state.tools.ffmpeg) missing.push('ffmpeg.exe');
  if (!state.tools.ffprobe) missing.push('ffprobe.exe');
  return missing;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function truncate(str, len) {
  if (!str) return '';
  return str.length <= len ? str : str.slice(0, len) + '…';
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function getChecked(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

// ================================================================
// BOOTSTRAP
// ================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
