// ============================================================
// CDE — Background Service Worker
// v2.1 — Advanced Image & Video Downloading
// ============================================================

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    ["enabled", "videosEnabled", "minSize", "downloadCount", "sessionDownloadCount", "downloadFolder",
     "downloadFormat", "recentDownloads"],
    (result) => {
      const updates = {};
      if (result.enabled === undefined) updates.enabled = true;
      if (result.videosEnabled === undefined) updates.videosEnabled = true;
      if (result.minSize === undefined) updates.minSize = 100;
      if (result.downloadCount === undefined) updates.downloadCount = 0;
      if (result.downloadFolder === undefined) updates.downloadFolder = "MediaDownloads";
      if (result.downloadFormat === undefined) updates.downloadFormat = "original";
      if (result.recentDownloads === undefined) updates.recentDownloads = [];
      updates.sessionDownloadCount = 0;
      chrome.storage.local.set(updates);
    }
  );
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({ sessionDownloadCount: 0 });
});

// ── Helpers ──────────────────────────────────────────────────

function getFilenameFromUrl(url, fallback, isVideo = false) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return `${fallback}.${isVideo ? 'mp4' : 'jpg'}`;
  }
  try {
    const pathname = new URL(url).pathname;
    let name = pathname.substring(pathname.lastIndexOf('/') + 1).split('?')[0];
    name = decodeURIComponent(name).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    if (!name || name.length < 3 || !name.includes('.')) return `${fallback}.${isVideo ? 'mp4' : 'jpg'}`;
    return name;
  } catch {
    return `${fallback}.${isVideo ? 'mp4' : 'jpg'}`;
  }
}

function sanitizeFolder(folder) {
  return (folder || "MediaDownloads").replace(/[^a-zA-Z0-9_\-\/]/g, '_');
}

// ── Logging Helper ──────────────────────────────────────────
function remoteLog(level, source, message, data = null) {
  fetch("http://127.0.0.1:8000/api/log", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-Extension-Key": "HD-SECURE-KEY-2026"
    },
    body: JSON.stringify({ level, source, message, data }),
  }).catch(() => {}); // Ignore logging failures
}

// ── Heartbeat Ping ─────────────────────────────────────────────
chrome.alarms.create("heartbeat", { periodInMinutes: 0.1 }); // Every 6 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "heartbeat") {
    fetch("http://127.0.0.1:8000/api/ping", {
      headers: { "X-Extension-Key": "HD-SECURE-KEY-2026" }
    }).catch(() => {});
  }
});

// ── Sync History to Backend ────────────────────────────────────
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.recentDownloads) {
    const history = changes.recentDownloads.newValue || [];
    fetch("http://127.0.0.1:8000/api/sync-history", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Extension-Key": "HD-SECURE-KEY-2026"
      },
      body: JSON.stringify({ history: history })
    }).catch(() => {});
  }
});

// ── Message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Single Image Download ───────────────────────────────────────
  if (message.action === "downloadImage") {
    const { url } = message;
    remoteLog("info", "Background-Image", "Attempting image download", { url });
    const timestamp = Date.now();
    const fallbackName = `photo_${timestamp}`;
    const filename = getFilenameFromUrl(url, fallbackName, false).replace(/\.(mp4|webm|mov)$/i, ".jpg");

    chrome.storage.local.get(["downloadFolder", "downloadCount", "sessionDownloadCount", "recentDownloads"], (settings) => {
      const folder = sanitizeFolder(settings.downloadFolder);
      const savePath = `${folder}/${filename}`;

      chrome.downloads.download({ url, filename: savePath, conflictAction: "uniquify", saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError) {
          remoteLog("error", "Background-Image", "Download failed", { error: chrome.runtime.lastError.message });
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          remoteLog("info", "Background-Image", "Download successful", { savePath, downloadId });
          const recentList = settings.recentDownloads || [];
          const newItem = { url: url.startsWith("data:") ? "Converted" : url, thumbnailUrl: url, filename, timestamp, type: "image" };
          chrome.storage.local.set({
            downloadCount: (settings.downloadCount || 0) + 1,
            sessionDownloadCount: (settings.sessionDownloadCount || 0) + 1,
            recentDownloads: [newItem, ...recentList].slice(0, 5)
          });
          sendResponse({ success: true, downloadId });
        }
      });
    });
    return true;
  }

  // ── Video Info Extraction ───────────────────────────────────────
  if (message.action === "extractVideo") {
    const { url } = message;
    remoteLog("info", "Background-Video", "Requesting video extraction", { url });
    
    fetch("http://127.0.0.1:8000/api/extract-video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Key": "HD-SECURE-KEY-2026"
      },
      body: JSON.stringify({ url })
    })
    .then(res => res.json())
    .then(data => {
      if (data.formats) {
        remoteLog("info", "Background-Video", "Extraction successful via Backend");
        sendResponse({ success: true, title: data.title, formats: data.formats });
      } else {
        remoteLog("error", "Background-Video", "Backend returned error", { detail: data.detail });
        sendResponse({ success: false, error: data.detail || "Unknown error extracting video" });
      }
    })
    .catch(err => {
      console.error("FastAPI backend error:", err);
      remoteLog("error", "Background-Video", "Failed to connect to FastAPI backend", { error: err.toString() });
      sendResponse({ success: false, error: "Failed to connect to FastAPI backend. Is it running?" });
    });

    return true;
  }

  // ── Download Selected Video ───────────────────────────────────────
  if (message.action === "downloadSelectedVideo") {
    const { url, filename, folder } = message;
    const timestamp = Date.now();
    
    chrome.storage.local.get(["downloadCount", "sessionDownloadCount", "recentDownloads"], (settings) => {
      const sanitizedFolder = sanitizeFolder(folder);
      const savePath = `${sanitizedFolder}/${filename.replace(/[^a-zA-Z0-9_\-\.\ ]/g, '_')}`;

      chrome.downloads.download({ url, filename: savePath, conflictAction: "uniquify", saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          const recentList = settings.recentDownloads || [];
          const newItem = { url, thumbnailUrl: "icons/icon48.png", filename, timestamp, type: "video" };
          chrome.storage.local.set({
            downloadCount: (settings.downloadCount || 0) + 1,
            sessionDownloadCount: (settings.sessionDownloadCount || 0) + 1,
            recentDownloads: [newItem, ...recentList].slice(0, 5)
          });
          sendResponse({ success: true, downloadId });
        }
      });
    });

    return true;
  }

  // ── Batch Image Download ───────────────────────────────────────
  if (message.action === "downloadAllImages") {
    const { urls } = message;
    
    if (!urls || urls.length === 0) {
      sendResponse({ success: false, error: "No images found" });
      return false;
    }

    chrome.storage.local.get(["downloadFolder", "downloadCount", "sessionDownloadCount", "recentDownloads"], (settings) => {
      const folder = sanitizeFolder(settings.downloadFolder);
      let downloadedCount = 0;
      let newRecentDownloads = settings.recentDownloads || [];

      // Download images sequentially or batch them
      urls.forEach((url, index) => {
        const timestamp = Date.now() + index;
        const fallbackName = `photo_batch_${timestamp}`;
        const filename = getFilenameFromUrl(url, fallbackName, false).replace(/\.(mp4|webm|mov)$/i, ".jpg");
        const savePath = `${folder}/${filename}`;

        chrome.downloads.download({ url, filename: savePath, conflictAction: "uniquify", saveAs: false }, (downloadId) => {
          if (!chrome.runtime.lastError) {
            downloadedCount++;
            
            // Only add the first few to recent downloads to avoid cluttering
            if (index < 3) {
              newRecentDownloads.unshift({ 
                url: url.startsWith("data:") ? "Converted" : url, 
                thumbnailUrl: url, 
                filename, 
                timestamp,
                type: "image"
              });
            }

            // Update stats when all are done
            if (index === urls.length - 1) {
              chrome.storage.local.set({
                downloadCount: (settings.downloadCount || 0) + downloadedCount,
                sessionDownloadCount: (settings.sessionDownloadCount || 0) + downloadedCount,
                recentDownloads: newRecentDownloads.slice(0, 5)
              });
            }
          }
        });
      });
      
      sendResponse({ success: true, count: urls.length });
    });
    return true;
  }

});
