<div align="center">
  
# 🚀 Universal CDE Extension

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-FF0000?style=for-the-badge&logo=youtube)](https://github.com/yt-dlp/yt-dlp)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)

A powerful, high-speed, and secure browser extension combined with a Python backend to download videos from YouTube, TikTok, and Instagram at maximum quality (up to 4K) using an IDM-style real-time progress interface.

</div>

---

## ✨ Features

- **🔥 High-Speed Downloads:** Powered by `yt-dlp` backend with concurrent fragment downloading (up to 5 fragments simultaneously) for blazing-fast speeds.
- **🎬 Maximum Quality:** Automatically downloads the best video and audio streams separately and merges them flawlessly using `ffmpeg` (supports 1080p, 4K).
- **📊 IDM-Style Live Progress:** Get a beautiful, real-time progress UI directly on your webpage showing Download Percentage, Speed (MB/s), and ETA.
- **🔒 Secure API:** Backend connection is protected with a custom API key header (`HD-SECURE-KEY-2026`) preventing unauthorized access.
- **🎨 Minimalist UI:** A clean, monochrome, glassmorphism-inspired design for the extension popup and on-page modals.
- **📝 Detailed Logging:** Automatically saves categorized daily logs for debugging and monitoring in your Temp directory.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript, HTML, CSS (Chrome Extension V3)
- **Backend:** Python, FastAPI, Uvicorn
- **Core Engine:** `yt-dlp`, `ffmpeg`

---

## 🚀 Getting Started

### Prerequisites

1.  **Python 3.8+** installed on your system.
2.  **FFmpeg** installed and added to your system's PATH.

### 1. Backend Setup

The backend requires Python and `ffmpeg`. We have created seamless startup scripts for all operating systems!

**For Windows:**
Double-click `start_windows.bat` or run it in your terminal. It will automatically create a virtual environment, install dependencies, and start the server.

**For Mac / Linux:**
Run the following in your terminal:
```bash
./start_unix.sh
```
*(If permission denied, run `chmod +x start_unix.sh` first)*

*The server will start on `http://127.0.0.1:8000`*

### 2. Extension Setup

1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  Turn on **Developer mode** in the top right corner.
3.  Click **Load unpacked**.
4.  Select the root folder of this project (`Photo Download extention`).
5.  Pin the extension to your browser bar.

---

## 🎯 How to Use

1.  Go to any supported video page (YouTube, TikTok, Instagram).
2.  Click the **CDE** extension icon in your browser toolbar.
3.  Select your desired video quality (e.g., 1080p, 720p, or Best Quality).
4.  Choose your destination folder name (default is `PhotoDownloads`).
5.  Click **Start Download**.
6.  A real-time progress dialog will appear on the page showing the download speed, percentage, and ETA.
7.  Once downloaded and merged, the video will be saved in your system's `Downloads/PhotoDownloads` folder!

---

## ⚠️ Disclaimer
This tool is for personal and educational use only. Please respect the copyright of content creators and abide by the terms of service of the respective platforms.

---

<div align="center">
  <i>Developed with ❤️ for high-quality content lovers.</i>
</div>
