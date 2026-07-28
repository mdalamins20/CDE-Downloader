document.addEventListener("DOMContentLoaded", () => {
  const extensionToggle = document.getElementById("extension-toggle");
  const statusText = document.getElementById("status-text");
  
  const videoToggle = document.getElementById("video-toggle");
  const videoStatusText = document.getElementById("video-status-text");
  
  const sizeSlider = document.getElementById("size-slider");
  const sizeVal = document.getElementById("size-val");
  const downloadCountEl = document.getElementById("download-count");
  const sessionCountEl = document.getElementById("session-count");
  
  // Advanced Features Controls
  const formatSelect = document.getElementById("format-select");
  const folderInput = document.getElementById("folder-input");
  const recentListContainer = document.getElementById("recent-list-container");
  const recentCountBadge = document.getElementById("recent-count-badge");
  const batchDownloadBtn = document.getElementById("batch-download-btn");

  // Success SVG icon markup
  const successIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  `;

  // Load saved configurations and stats
  chrome.storage.local.get(
    [
      "enabled", "minSize", "downloadCount", "sessionDownloadCount", "downloadFormat", "downloadFolder", "recentDownloads"
    ],
    (result) => {
      // Set photo toggle state
      const isEnabled = result.enabled !== false; // default true
      extensionToggle.checked = isEnabled;
      updateStatusUI(isEnabled, statusText);

      // Set video toggle state
      const isVideoEnabled = result.videosEnabled !== false; // default true
      videoToggle.checked = isVideoEnabled;
      updateStatusUI(isVideoEnabled, videoStatusText);

      // Set slider state
      const minSize = result.minSize !== undefined ? result.minSize : 100;
      sizeSlider.value = minSize;
      sizeVal.textContent = `${minSize}px`;

      // Set stats
      downloadCountEl.textContent = result.downloadCount || 0;
      sessionCountEl.textContent = result.sessionDownloadCount || 0;

      // Set format dropdown
      formatSelect.value = result.downloadFormat || "original";

      // Set custom folder
      folderInput.value = result.downloadFolder || "PhotoDownloads";

      // Render recent downloads list
      renderRecentDownloads(result.recentDownloads || []);
    }
  );

  // Monitor storage changes in real-time to update stats & history
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.downloadCount) {
        downloadCountEl.textContent = changes.downloadCount.newValue;
      }
      if (changes.sessionDownloadCount) {
        sessionCountEl.textContent = changes.sessionDownloadCount.newValue;
      }
      if (changes.recentDownloads) {
        renderRecentDownloads(changes.recentDownloads.newValue || []);
      }
    }
  });

  // Photo toggle state event listener
  extensionToggle.addEventListener("change", (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ enabled: isEnabled }, () => {
      updateStatusUI(isEnabled, statusText);
    });
  });

  // Video toggle state event listener
  videoToggle.addEventListener("change", (e) => {
    const isVideoEnabled = e.target.checked;
    chrome.storage.local.set({ videosEnabled: isVideoEnabled }, () => {
      updateStatusUI(isVideoEnabled, videoStatusText);
    });
  });

  // Slider change event listener
  sizeSlider.addEventListener("input", (e) => {
    const minSize = parseInt(e.target.value, 10);
    sizeVal.textContent = `${minSize}px`;
    chrome.storage.local.set({ minSize: minSize });
  });

  // Format selection event listener
  formatSelect.addEventListener("change", (e) => {
    chrome.storage.local.set({ downloadFormat: e.target.value });
  });

  // Subfolder text input listener (debounced slightly to prevent constant writes)
  let inputTimeout;
  folderInput.addEventListener("input", (e) => {
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(() => {
      // Clean path name from illegal characters
      let sanitized = e.target.value.trim().replace(/[^a-zA-Z0-9_\-\/]/g, '_');
      if (sanitized === "") sanitized = "PhotoDownloads";
      chrome.storage.local.set({ downloadFolder: sanitized });
    }, 400);
  });

  // Batch download button click handler
  if (batchDownloadBtn) {
    batchDownloadBtn.addEventListener("click", () => {
      const originalText = batchDownloadBtn.querySelector('.action-label').innerText;
      batchDownloadBtn.querySelector('.action-label').innerText = "Scanning...";
      batchDownloadBtn.style.opacity = "0.7";

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "downloadAllImagesFromPage" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              batchDownloadBtn.querySelector('.action-label').innerText = "No images found / Error";
              setTimeout(() => {
                batchDownloadBtn.querySelector('.action-label').innerText = originalText;
                batchDownloadBtn.style.opacity = "1";
              }, 2000);
            } else {
              batchDownloadBtn.querySelector('.action-label').innerText = `Downloading ${response.count} images!`;
              setTimeout(() => {
                batchDownloadBtn.querySelector('.action-label').innerText = originalText;
                batchDownloadBtn.style.opacity = "1";
              }, 2000);
            }
          });
        }
      });
    });
  }

    // Clear history button click handler
  const clearHistoryBtn = document.getElementById("clear-history-btn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      chrome.storage.local.set({ recentDownloads: [] }, () => {
        renderRecentDownloads([]);
      });
    });
  }

  // Render recent downloads history list
  function renderRecentDownloads(items) {
    recentCountBadge.textContent = items.length;
    
    if (items.length === 0) {
      recentListContainer.innerHTML = '<p class="no-recent-msg">No files downloaded yet</p>';
      return;
    }

    recentListContainer.innerHTML = ""; // Clear loader/previous
    items.forEach(item => {
      const itemEl = document.createElement("div");
      itemEl.className = "recent-item";

      // Handle thumbnail previews
      const isVideo = item.type === "video";
      const thumbUrl = item.thumbnailUrl || "icons/icon48.png";
      const badgeText = isVideo ? "VID" : "IMG";
      const badgeColor = isVideo ? "var(--primary)" : "var(--accent-cyan)";
      const mediaBadge = `<div class="media-badge" style="position: absolute; bottom: 0; right: 0; background: ${badgeColor}; color: #0a0a0f; border-radius: 3px; padding: 1px 3px; font-size: 7px; font-weight: bold; line-height: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.6);">${badgeText}</div>`;

      itemEl.innerHTML = `
        <div style="position: relative; width: 28px; height: 28px; flex-shrink: 0;">
          <img class="recent-thumbnail" src="${thumbUrl}" alt="Preview" onerror="this.src='icons/icon48.png';" style="width: 100%; height: 100%; display: block; border-radius: 5px; object-fit: cover;">
          ${mediaBadge}
        </div>
        <div class="recent-details">
          <span class="recent-filename" title="${item.filename}">${item.filename}</span>
          <span class="recent-time">${getRelativeTime(item.timestamp)}</span>
        </div>
        <div class="recent-check" title="Downloaded Successfully">
          ${successIconSvg}
        </div>
      `;

      recentListContainer.appendChild(itemEl);
    });
  }

  // Calculate relative time labels (e.g. Just now, 5m ago)
  function getRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  // Helper function to update status label
  function updateStatusUI(isEnabled, statusElement) {
    if (!statusElement) return;
    if (isEnabled) {
      statusElement.textContent = "Enabled";
      statusElement.style.color = "var(--accent-cyan)";
    } else {
      statusElement.textContent = "Disabled";
      statusElement.style.color = "var(--text-secondary)";
    }
  }

});
