from fastapi import FastAPI, HTTPException, Request, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import os
import datetime
import json
import uuid
from typing import Optional, Any

import time

# Global dictionary to track download progress
DOWNLOAD_PROGRESS = {}
LAST_PING_TIME = 0
DOWNLOAD_HISTORY = []

app = FastAPI(title="Video Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = "HD-SECURE-KEY-2026"

def verify_api_key(x_extension_key: str):
    if x_extension_key != API_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized request. Invalid API Key.")

# --- Logging Setup ---
def write_log(level: str, source: str, message: str, data: Any = None):
    try:
        # Get current date for folder and timestamp for log
        now = datetime.datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")
        
        # Create logs directory at the system temp folder to bypass OneDrive/Ransomware protection
        import tempfile
        temp_dir = tempfile.gettempdir()
        log_dir = os.path.join(temp_dir, "PhotoDownloaderLogs", date_str)
        os.makedirs(log_dir, exist_ok=True)
        
        log_file = os.path.join(log_dir, "extension.log")
        
        # Format log entry
        log_entry = f"[{time_str}] [{level.upper()}] [{source}] {message}"
        if data:
            if isinstance(data, dict):
                log_entry += f" | Data: {json.dumps(data)}"
            else:
                log_entry += f" | Data: {str(data)}"
                
        # Append to log file
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
            
        print(log_entry) # Also print to console
    except Exception as e:
        print(f"Failed to write log: {e}")

class LogRequest(BaseModel):
    level: str
    source: str
    message: str
    data: Optional[Any] = None

@app.post("/api/log")
def receive_log(req: LogRequest, x_extension_key: str = Header(None)):
    verify_api_key(x_extension_key)
    write_log(req.level, req.source, req.message, req.data)
    return {"status": "logged"}

# --- Video Extraction ---
class VideoRequest(BaseModel):
    url: str

@app.post("/api/extract-video")
def extract_video(request: VideoRequest, x_extension_key: str = Header(None)):
    verify_api_key(x_extension_key)
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True, # Prevents downloading entire YouTube playlists
    }
    
    write_log("info", "Backend", f"Starting extraction for URL: {request.url}")
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info_dict = ydl.extract_info(request.url, download=False)
            except Exception as extract_err:
                write_log("error", "Backend-yt_dlp", f"Extraction failed", str(extract_err))
                raise HTTPException(status_code=400, detail=f"Could not extract video info: {str(extract_err)}")

            title = info_dict.get('title', 'video')
            formats = info_dict.get('formats', [])
            available_formats = []

            # Add formats that have video (even without audio, since we will merge them on backend)
            for f in formats:
                if f.get('vcodec') != 'none':
                    height = f.get('height') or 0
                    ext = f.get('ext', 'mp4')
                    url = f.get('url')
                    if url and height > 0:
                        label = f"{height}p" if height > 0 else "Normal Quality"
                        available_formats.append({
                            "format_id": f.get("format_id", ""),
                            "label": label,
                            "url": url,
                            "height": height
                        })
            
            # Sort by height descending
            available_formats = sorted(available_formats, key=lambda x: x["height"], reverse=True)
            
            # Deduplicate by height/label
            unique_formats = []
            seen_labels = set()
            for f in available_formats:
                if f["label"] not in seen_labels:
                    seen_labels.add(f["label"])
                    unique_formats.append(f)
            
            # Fallback if no combined formats found
            if not unique_formats:
                video_url = info_dict.get('url', None)
                if not video_url and 'requested_downloads' in info_dict and len(info_dict['requested_downloads']) > 0:
                    video_url = info_dict['requested_downloads'][0].get('url')
                
                if video_url:
                    unique_formats.append({
                        "format_id": "best",
                        "label": "Best Quality",
                        "url": video_url,
                        "height": 0
                    })
                else:
                    write_log("warning", "Backend", "No suitable formats found for URL", {"title": title})
                    raise HTTPException(status_code=404, detail="Could not find any suitable video formats with audio.")

            # Add Audio Only format
            unique_formats.insert(0, {
                "format_id": "bestaudio",
                "label": "Audio Only (MP3)",
                "url": "",
                "height": -1
            })

            write_log("info", "Backend", "Extraction successful", {"title": title, "formats_found": len(unique_formats)})
            return {"title": title, "formats": unique_formats}
            
    except HTTPException as he:
        raise he
    except Exception as e:
        write_log("error", "Backend-Critical", f"Internal Server Error", str(e))
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

# --- High Speed Background Downloader ---
class DownloadRequest(BaseModel):
    url: str
    format_id: str
    folder: str = "PhotoDownloads"

def process_download(url: str, format_id: str, folder: str, task_id: str):
    download_dir = os.path.join(os.path.expanduser('~'), 'Downloads', folder)
    os.makedirs(download_dir, exist_ok=True)
    
    # Initialize progress state
    DOWNLOAD_PROGRESS[task_id] = {
        "status": "starting",
        "percent": 0.0,
        "speed": "Calculating...",
        "eta": "Calculating...",
        "downloaded_bytes": 0,
        "total_bytes": 0,
        "filename": ""
    }

    def my_hook(d):
        if d['status'] == 'finished':
            DOWNLOAD_PROGRESS[task_id]['status'] = 'merging'
            DOWNLOAD_PROGRESS[task_id]['percent'] = 100.0
            DOWNLOAD_PROGRESS[task_id]['filename'] = d.get('filename', '')
        elif d['status'] == 'downloading':
            DOWNLOAD_PROGRESS[task_id]['status'] = 'downloading'
            DOWNLOAD_PROGRESS[task_id]['filename'] = d.get('filename', '')
            
            # Safely handle missing keys
            total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes', 0)
            
            if total_bytes > 0:
                percent = (downloaded / total_bytes) * 100
                DOWNLOAD_PROGRESS[task_id]['percent'] = round(percent, 2)
            
            speed = d.get('speed')
            if speed:
                DOWNLOAD_PROGRESS[task_id]['speed'] = f"{(speed / 1024 / 1024):.2f} MB/s"
            
            eta = d.get('eta')
            if eta is not None:
                DOWNLOAD_PROGRESS[task_id]['eta'] = str(datetime.timedelta(seconds=int(eta)))

    # Merge selected video + best audio
    if format_id == "best":
        dl_format = "bestvideo+bestaudio/best"
    elif format_id == "bestaudio":
        dl_format = "bestaudio/best"
    else:
        dl_format = f"{format_id}+bestaudio/best"
        
    ydl_opts = {
        'quiet': True, 
        'no_warnings': True,
        'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
        'format': dl_format,
        'concurrent_fragment_downloads': 5,
        'noplaylist': True,
        'writesubtitles': True,
        'subtitleslangs': ['en', 'bn', 'all'],
        'writethumbnail': True,
        'progress_hooks': [my_hook],
    }

    if format_id == "bestaudio":
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        ydl_opts['merge_output_format'] = 'mp4'
    
    write_log("info", "Backend-Download", f"Starting background download", {"url": url, "format_id": format_id, "task_id": task_id})
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        DOWNLOAD_PROGRESS[task_id]['status'] = 'finished'
        write_log("info", "Backend-Download", f"Background download finished successfully", {"url": url})
    except Exception as e:
        DOWNLOAD_PROGRESS[task_id]['status'] = 'error'
        DOWNLOAD_PROGRESS[task_id]['error'] = str(e)
        write_log("error", "Backend-Download", f"Background download failed", str(e))

@app.post("/api/download-video")
def download_video(request: DownloadRequest, background_tasks: BackgroundTasks, x_extension_key: str = Header(None)):
    verify_api_key(x_extension_key)
    task_id = str(uuid.uuid4())
    background_tasks.add_task(process_download, request.url, request.format_id, request.folder, task_id)
    return {"status": "started", "task_id": task_id, "message": "Download started on server"}

@app.get("/api/download-progress/{task_id}")
def get_progress(task_id: str, x_extension_key: str = Header(None)):
    verify_api_key(x_extension_key)
    if task_id not in DOWNLOAD_PROGRESS:
        raise HTTPException(status_code=404, detail="Task not found")
    return DOWNLOAD_PROGRESS[task_id]

@app.get("/api/ping")
def ping_from_extension(x_extension_key: str = Header(None)):
    verify_api_key(x_extension_key)
    global LAST_PING_TIME
    LAST_PING_TIME = time.time()
    return {"status": "ok"}

@app.get("/api/status")
def get_server_status():
    global LAST_PING_TIME
    # Consider connected if last ping was within 10 seconds
    connected = (time.time() - LAST_PING_TIME) < 10
    return {"server": "running", "extension_connected": connected}

class HistorySyncRequest(BaseModel):
    history: list

@app.post("/api/sync-history")
def sync_history(req: HistorySyncRequest, x_extension_key: str = Header(None)):
    verify_api_key(x_extension_key)
    global DOWNLOAD_HISTORY
    DOWNLOAD_HISTORY = req.history
    return {"status": "synced", "count": len(DOWNLOAD_HISTORY)}

@app.get("/api/get-history")
def get_history():
    # No auth needed for local fetch by desktop app
    return {"history": DOWNLOAD_HISTORY}

@app.get("/")
def health_check():
    return {"status": "running"}
