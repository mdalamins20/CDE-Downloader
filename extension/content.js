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

(function () {
  // Protect against multiple injections
  if (window.hasPhotoDownloaderInjected) return;
  window.hasPhotoDownloaderInjected = true;

  let isEnabled = true;
  let isVideoEnabled = true;
  let minSize = 100;
  let downloadFormat = "original";

  let activeImage = null;
  let hoverTimeout = null;
  let downloadButton = null;

  let mouseX = 0;
  let mouseY = 0;

  // Icons markup
  const downloadIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  `;

  const successIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  `;

  const errorIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  `;

  // Read initial configuration from storage
  chrome.storage.local.get(["enabled", "videosEnabled", "minSize", "downloadFormat"], (result) => {
    isEnabled = result.enabled !== false;
    isVideoEnabled = result.videosEnabled !== false;
    minSize = result.minSize !== undefined ? result.minSize : 100;
    downloadFormat = result.downloadFormat || "original";
    createDownloadButton();
  });

  // Listen for storage changes in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.enabled !== undefined) {
        isEnabled = changes.enabled.newValue;
        if (!isEnabled) {
          hideButton();
        }
      }
      if (changes.videosEnabled !== undefined) {
        isVideoEnabled = changes.videosEnabled.newValue;
        if (!isVideoEnabled && activeImage && activeImage.tagName === "VIDEO") {
          hideButton();
        }
      }
      if (changes.minSize !== undefined) {
        minSize = changes.minSize.newValue;
      }
      if (changes.downloadFormat !== undefined) {
        downloadFormat = changes.downloadFormat.newValue;
      }
    }
  });

  // Create the floating photo download button and append it to body
  function createDownloadButton() {
    if (downloadButton) return;

    downloadButton = document.createElement("button");
    downloadButton.className = "photo-downloader-btn";
    downloadButton.innerHTML = downloadIconSvg;
    downloadButton.setAttribute("title", "Download Photo");
    document.body.appendChild(downloadButton);

    // Click handler to trigger download
    downloadButton.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!activeImage) return;

      const isVideo = activeImage.tagName === "VIDEO" || 
                      window.location.href.includes("tiktok.com") || 
                      window.location.href.includes("instagram.com/reel") ||
                      window.location.href.includes("facebook.com/reel");

      if (isVideo) {
        // IDM Style video download
        let urlToDownload = window.location.href; // Default to page URL which yt-dlp prefers
        
        // For major platforms, yt-dlp MUST use the page URL to extract correctly.
        // For random websites with direct video tags, we can use the src if it's not a blob.
        const isMajorPlatform = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com/.test(window.location.href);
        
        if (!isMajorPlatform && activeImage.src && activeImage.src.startsWith('http')) {
          urlToDownload = activeImage.src;
        }
        
        // Show loading state
        downloadButton.classList.add("loading");
        
        chrome.runtime.sendMessage(
          { action: "extractVideo", url: urlToDownload },
          (response) => {
            downloadButton.classList.remove("loading");
            if (response && response.success && response.formats && response.formats.length > 0) {
              remoteLog("info", "Content-Video", "Video info received, showing modal");
              showVideoModal(response.title, response.formats, urlToDownload);
            } else {
              const errMsg = response?.error || "Unknown extraction error";
              console.error("Failed to extract video info:", errMsg);
              remoteLog("error", "Content-Video", "Failed to extract video info", { error: errMsg });
              downloadButton.classList.add("error"); // Use classList directly
              setTimeout(() => downloadButton.classList.remove("error"), 2000);
              // Fallback for native html5 video tags
              if (response?.error && urlToDownload !== window.location.href && activeImage.src) {
                fallbackDownload(activeImage.src);
              }
            }
          }
        );
      } else {
        // It's an image
        const highQualityUrl = getHighQualityImageUrl(activeImage);
        if (!highQualityUrl) return;

        const triggerDownload = (urlToDownload) => {
          chrome.runtime.sendMessage(
            { action: "downloadImage", url: urlToDownload },
            (response) => {
              if (response && response.success) {
                setButtonState("success");
              } else {
                console.error("Failed to download image via service worker:", response?.error);
                fallbackDownload(urlToDownload);
              }
            }
          );
        };

        if (downloadFormat !== "original" && !highQualityUrl.startsWith("data:")) {
          downloadButton.style.opacity = "0.6";
          convertImageFormat(highQualityUrl, downloadFormat, (convertedUrl) => {
            downloadButton.style.opacity = "1";
            if (convertedUrl) {
              triggerDownload(convertedUrl);
            } else {
              triggerDownload(highQualityUrl);
            }
          });
        } else {
          triggerDownload(highQualityUrl);
        }
      }
    });

    downloadButton.addEventListener("mouseenter", () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
    });

    downloadButton.addEventListener("mouseleave", () => {
      startHideTimer();
    });
  }

  // Fallback download using client-side elements if background fails
  function fallbackDownload(url) {
    try {
      fetch(url)
        .then(response => response.blob())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = `photo_${Date.now()}.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
          setButtonState("success");
        })
        .catch(err => {
          console.error("Fallback download also failed:", err);
          setButtonState("error");
        });
    } catch (e) {
      setButtonState("error");
    }
  }

  // Resolve original highest quality image URL from responsive srcset or platform specific segments
  function getHighQualityImageUrl(img) {
    let url = img.src || img.currentSrc;
    if (!url) return null;

    const srcset = img.getAttribute("srcset");
    if (srcset) {
      try {
        const sources = srcset.split(",").map(src => {
          const parts = src.trim().split(/\s+/);
          const srcUrl = parts[0];
          let width = 0;
          if (parts[1]) {
            if (parts[1].endsWith("w")) {
              width = parseInt(parts[1].slice(0, -1), 10);
            } else if (parts[1].endsWith("x")) {
              width = parseFloat(parts[1].slice(0, -1)) * 100;
            }
          }
          return { url: srcUrl, width };
        });
        sources.sort((a, b) => b.width - a.width);
        if (sources.length > 0 && sources[0].width > 0) {
          url = sources[0].url;
        }
      } catch (err) {
        console.error("Error parsing srcset:", err);
      }
    }

    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.hostname.includes("twimg.com") || parsedUrl.hostname.includes("x.com") || parsedUrl.hostname.includes("twitter.com")) {
        if (parsedUrl.searchParams.has("name")) {
          parsedUrl.searchParams.set("name", "orig");
          url = parsedUrl.toString();
        }
      }
      
      if (parsedUrl.hostname.includes("pinimg.com")) {
        url = url.replace(/\/(236x|474x|564x|736x)\//, "/originals/");
      }

      if (parsedUrl.hostname.includes("googleusercontent.com") || parsedUrl.hostname.includes("ggpht.com") || parsedUrl.hostname.includes("blogger.com")) {
        url = url.replace(/=s\d+(-c)?$/, "=s0");
        url = url.replace(/=w\d+-h\d+(-[a-z])?$/, "=s0");
      }

      if (parsedUrl.hostname.includes("wp.com") || parsedUrl.hostname.includes("wordpress")) {
        if (parsedUrl.searchParams.has("w") || parsedUrl.searchParams.has("h") || parsedUrl.searchParams.has("resize")) {
          parsedUrl.searchParams.delete("w");
          parsedUrl.searchParams.delete("h");
          parsedUrl.searchParams.delete("resize");
          url = parsedUrl.toString();
        }
      }
    } catch (e) {
      // Ignored
    }

    return url;
  }

  // Draw image on canvas to convert its format
  function convertImageFormat(url, targetFormat, callback) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        
        const mimeType = targetFormat === "jpg" ? "image/jpeg" : "image/png";
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        callback(dataUrl);
      } catch (err) {
        console.error("Format conversion canvas failed due to CORS or security limits:", err);
        callback(null);
      }
    };
    
    img.onerror = () => {
      console.error("Format conversion failed to load image element:", url);
      callback(null);
    };
    
    img.src = url;
  }

  // Set the button state (success / error / normal) with animations
  function setButtonState(state) {
    if (!downloadButton) return;

    if (state === "success") {
      downloadButton.classList.remove("error", "loading");
      downloadButton.classList.add("success");
      downloadButton.innerHTML = successIconSvg;
      
      setTimeout(() => {
        downloadButton.classList.remove("success");
        downloadButton.innerHTML = downloadIconSvg;
      }, 1500);
    } else if (state === "error") {
      downloadButton.classList.remove("success", "loading");
      downloadButton.classList.add("error");
      downloadButton.innerHTML = errorIconSvg;
      
      setTimeout(() => {
        downloadButton.classList.remove("error");
        downloadButton.innerHTML = downloadIconSvg;
      }, 1500);
    }
  }

  // Simple Toast UI
  function showToast(message) {
    let toast = document.getElementById("hd-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "hd-toast";
      toast.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #111827; color: white; padding: 12px 20px; border-radius: 8px; font-family: sans-serif; font-size: 14px; z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: opacity 0.3s; opacity: 0;";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => toast.style.opacity = "0", 4000);
  }

  // IDM Style Progress Modal Logic
  function showDownloadProgressModal(taskId, title) {
    const existingOverlay = document.getElementById('hdp-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'hdp-overlay';
    overlay.className = 'hd-progress-modal-overlay';

    overlay.innerHTML = `
      <div class="hd-progress-modal">
        <div class="hdp-header">
          <h3 class="hdp-title">Downloading: ${title.substring(0, 30)}...</h3>
          <button class="hdp-close" id="hdp-close-btn">&times;</button>
        </div>
        <div class="hdp-bar-container">
          <div class="hdp-bar" id="hdp-bar"></div>
        </div>
        <div class="hdp-stats">
          <span id="hdp-percent">0%</span>
          <span id="hdp-speed">Calculating...</span>
          <span id="hdp-eta">ETA: -</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('visible');
    }, 10);

    const closeBtn = document.getElementById('hdp-close-btn');
    const bar = document.getElementById('hdp-bar');
    const percentEl = document.getElementById('hdp-percent');
    const speedEl = document.getElementById('hdp-speed');
    const etaEl = document.getElementById('hdp-eta');
    const titleEl = document.querySelector('.hdp-title');

    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
      if (pollInterval) clearInterval(pollInterval);
    };

    closeBtn.addEventListener('click', closeModal);

    let pollInterval = setInterval(() => {
      fetch(`http://127.0.0.1:8000/api/download-progress/${taskId}`, {
        headers: { "X-Extension-Key": "HD-SECURE-KEY-2026" }
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'error') {
          titleEl.textContent = "Download Failed!";
          bar.style.background = "#ef4444";
          clearInterval(pollInterval);
          setTimeout(closeModal, 3000);
          return;
        }

        if (data.status === 'merging') {
          titleEl.textContent = "Merging Video & Audio...";
          bar.style.width = "100%";
          percentEl.textContent = "100%";
          speedEl.textContent = "Processing...";
          etaEl.textContent = "";
        } else if (data.status === 'finished') {
          titleEl.textContent = "Download Complete!";
          bar.style.width = "100%";
          percentEl.textContent = "100%";
          speedEl.textContent = "Saved to Downloads";
          etaEl.textContent = "";
          clearInterval(pollInterval);
          setTimeout(closeModal, 4000);
        } else {
          bar.style.width = `${data.percent}%`;
          percentEl.textContent = `${data.percent}%`;
          speedEl.textContent = data.speed;
          etaEl.textContent = data.eta ? `ETA: ${data.eta}` : "ETA: -";
        }
      })
      .catch(err => {
        console.error("Progress poll error:", err);
      });
    }, 500);
  }

  // IDM Style Modal Logic
  function showVideoModal(title, formats, pageUrl) {
    // Remove existing modal if any
    const existingOverlay = document.getElementById('vdm-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vdm-overlay';
    overlay.className = 'video-downloader-modal-overlay';
    
    // Default folder name
    const defaultFolder = "PhotoDownloads";
    const safeTitle = title ? title.replace(/[^a-zA-Z0-9_\-\.\ ]/g, '_') : `video_${Date.now()}`;
    const defaultFilename = `${safeTitle}.mp4`;

    let optionsHtml = formats.map(f => `<option value="${f.format_id}">${f.label}</option>`).join('');

    overlay.innerHTML = `
      <div class="video-downloader-modal">
        <div class="vdm-header">
          <h3 class="vdm-title">Download Video</h3>
          <button class="vdm-close" id="vdm-close-btn">&times;</button>
        </div>
        <div class="vdm-body">
          <div class="vdm-form-group">
            <label class="vdm-label">Video Name</label>
            <input type="text" id="vdm-filename" class="vdm-input" value="${defaultFilename}">
          </div>
          <div class="vdm-form-group">
            <label class="vdm-label">Video Quality</label>
            <select id="vdm-quality" class="vdm-select">
              ${optionsHtml}
            </select>
          </div>
          <div class="vdm-form-group">
            <label class="vdm-label">Save to Folder</label>
            <input type="text" id="vdm-folder" class="vdm-input" value="${defaultFolder}">
          </div>
        </div>
        <div class="vdm-footer">
          <button class="vdm-btn vdm-btn-cancel" id="vdm-cancel-btn">Cancel</button>
          <button class="vdm-btn vdm-btn-download" id="vdm-download-btn">Start Download</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Trigger animation
    setTimeout(() => {
      overlay.classList.add('visible');
    }, 10);

    const closeBtn = document.getElementById('vdm-close-btn');
    const cancelBtn = document.getElementById('vdm-cancel-btn');
    const downloadModalBtn = document.getElementById('vdm-download-btn');
    const urlSelect = document.getElementById('vdm-quality');
    const filenameInput = document.getElementById('vdm-filename');
    const folderInput = document.getElementById('vdm-folder');

    const closeModal = () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    downloadModalBtn.addEventListener('click', () => {
      const formatId = urlSelect.value;
      let folderName = folderInput.value.trim() || defaultFolder;

      fetch("http://127.0.0.1:8000/api/download-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Extension-Key": "HD-SECURE-KEY-2026"
        },
        body: JSON.stringify({
          url: pageUrl,
          format_id: formatId,
          folder: folderName
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === "started" && data.task_id) {
          setButtonState("success");
          showDownloadProgressModal(data.task_id, title);
        } else {
          setButtonState("error");
        }
      })
      .catch(err => {
        console.error("Backend download error:", err);
        setButtonState("error");
      });

      closeModal();
    });
  }

  // Check if image or video dimensions meet our minimum size settings
  function isValidImage(img) {
    if (!img) return false;
    
    if (img.classList.contains("photo-downloader-btn") || img.closest(".photo-downloader-btn")) {
      return false;
    }

    // Support for video elements
    if (img.tagName === "VIDEO") {
      return isVideoEnabled;
    }

    const width = img.naturalWidth || img.clientWidth;
    const height = img.naturalHeight || img.clientHeight;

    return width >= minSize && height >= minSize;
  }

  // Smart helper to find an image or video even when covered by transparent overlays
  function findImageFromElement(el) {
    if (!el) return null;
    
    if (el.tagName === "VIDEO") return el;
    if (el.tagName === "IMG" && !el.closest('video')) {
      // Return image only if we can't find a video nearby later
      // But let's first check if there is a video in the same container.
    }
    
    const directMedia = el.querySelector("video");
    if (directMedia) return directMedia;

    const directImg = el.querySelector("img");
    
    // Traverse up to 10 levels of ancestors, checking bounding boxes of contained media
    // We prioritize videos over images
    let current = el;
    let foundImg = el.tagName === "IMG" ? el : (directImg || null);

    for (let i = 0; i < 10; i++) {
      if (!current || current === document.body || current === document.documentElement) break;
      
      const videos = current.querySelectorAll("video");
      for (const video of videos) {
        const rect = video.getBoundingClientRect();
        if (mouseX >= rect.left && mouseX <= rect.right &&
            mouseY >= rect.top && mouseY <= rect.bottom) {
          return video;
        }
      }

      if (!foundImg) {
        const images = current.querySelectorAll("img");
        for (const img of images) {
          const rect = img.getBoundingClientRect();
          if (mouseX >= rect.left && mouseX <= rect.right &&
              mouseY >= rect.top && mouseY <= rect.bottom) {
            foundImg = img;
          }
        }
      }
      current = current.parentElement;
    }
    
    return foundImg;
  }

  // Smart photo position calculations
  function positionButton(img) {
    if (!downloadButton || !img) return;

    const rect = img.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    const buttonSize = 40;
    const offset = 10;

    let top = rect.top + scrollTop + offset;
    let left = rect.right + scrollLeft - buttonSize - offset;

    if (left < rect.left + scrollLeft) {
      left = rect.left + scrollLeft + offset;
    }

    downloadButton.style.top = `${top}px`;
    downloadButton.style.left = `${left}px`;
  }

  // Mouse move and hover detection using passive coordinates scanning
  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    const isOverPhotoButton = downloadButton && (e.target === downloadButton || downloadButton.contains(e.target));

    if (isOverPhotoButton) {
      // Clear all hide timeouts if mouse is over the buttons
      if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; }
      return;
    }

    // Photo detection
    if (isEnabled) {
      const img = findImageFromElement(e.target);
      if (img && isValidImage(img)) {
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
          hoverTimeout = null;
        }

        activeImage = img;
        positionButton(img);
        
        if (downloadButton) {
          downloadButton.classList.add("visible");
        }
      } else if (activeImage) {
        // If an active image is locked, check if the mouse has moved far away
        const rect = activeImage.getBoundingClientRect();
        const exitZonePadding = 20; // 20px ease-out zone
        if (mouseX < rect.left - exitZonePadding || mouseX > rect.right + exitZonePadding ||
            mouseY < rect.top - exitZonePadding || mouseY > rect.bottom + exitZonePadding) {
          startHideTimer();
        }
      }
    }
  }, { passive: true });

  // Update button position on scroll
  window.addEventListener("scroll", () => {
    if (activeImage && downloadButton && downloadButton.classList.contains("visible")) {
      positionButton(activeImage);
    }
  }, { passive: true });

  function startHideTimer() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      hideButton();
    }, 250);
  }

  function hideButton() {
    if (downloadButton) {
      downloadButton.classList.remove("visible");
    }
    activeImage = null;
  }

  // Listener for Batch Media Download triggered from the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "downloadAllImagesFromPage") {
      const mediaElements = Array.from(document.querySelectorAll("img, video"));
      const uniqueUrls = new Set();
      
      mediaElements.forEach(el => {
        if (isValidImage(el)) {
          let highResUrl = null;
          if (el.tagName === "VIDEO") {
            highResUrl = el.src || (el.querySelector('source') ? el.querySelector('source').src : null);
          } else {
            highResUrl = getHighQualityImageUrl(el);
          }
          if (highResUrl && highResUrl.startsWith('http')) {
            uniqueUrls.add(highResUrl);
          }
        }
      });

      const urlsArray = Array.from(uniqueUrls);
      
      if (urlsArray.length > 0) {
        chrome.runtime.sendMessage({ action: "downloadAllImages", urls: urlsArray });
        sendResponse({ success: true, count: urlsArray.length });
      } else {
        sendResponse({ success: false, error: "No suitable media found on this page." });
      }
    }
    return true;
  });

})();
