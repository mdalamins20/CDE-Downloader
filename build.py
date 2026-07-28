import os
import subprocess
import sys

def build_app():
    print("Installing requirements...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", r"desktop_app\api\requirements.txt"])
    print("Installing PyInstaller...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    print("Building Standalone Application...")
    
    # Define separator based on OS
    sep = ";" if os.name == "nt" else ":"
    
    command = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed", # No console window
        "--hidden-import=fastapi",
        "--hidden-import=uvicorn",
        "--hidden-import=yt_dlp",
        "--hidden-import=pydantic",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=uvicorn.lifespan.off",
        f"--add-data=desktop_app/api{sep}api",
        f"--add-data=desktop_app/icons{sep}icons",
        f"--add-data=extension/manifest.json{sep}extension",
        f"--add-data=extension/background.js{sep}extension",
        f"--add-data=extension/content.js{sep}extension",
        f"--add-data=extension/content.css{sep}extension",
        f"--add-data=extension/popup.js{sep}extension",
        f"--add-data=extension/popup.css{sep}extension",
        f"--add-data=extension/popup.html{sep}extension",
        f"--add-data=extension/icons{sep}extension/icons",
        "desktop_app/app.py"
    ]
    
    subprocess.check_call(command)
    print("Build complete! Check the 'dist' folder.")

if __name__ == "__main__":
    build_app()
