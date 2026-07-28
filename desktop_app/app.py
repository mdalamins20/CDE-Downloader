import os
import sys
import threading
import time
import webbrowser
from PIL import Image
import pystray
import customtkinter as ctk
import urllib.request
import json
from datetime import datetime

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# This forces PyInstaller to analyze and include main.py and ALL its dependencies
if False:
    from api import main

def run_fastapi_server():
    try:
        import uvicorn
        api_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'api')
        from api import main
        uvicorn.run(main.app, host="127.0.0.1", port=8000, log_level="warning")
    except Exception as e:
        import traceback
        error_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server_error.txt')
        with open(error_file, 'w') as f:
            f.write(traceback.format_exc())
        print(f"Server error: {e}")

class HDVideoDownloaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Chrome Downloader Extension (CDE)")
        self.geometry("850x550")
        self.resizable(False, False)
        
        try:
            self.icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons", "icon128.png")
            if os.path.exists(self.icon_path):
                from PIL import ImageTk
                tk_img = ImageTk.PhotoImage(Image.open(self.icon_path))
                self.iconphoto(True, tk_img)
                if os.name == 'nt':
                    self.iconbitmap(self.icon_path)
        except Exception as e:
            print("Icon load error:", e)
        
        self.protocol("WM_DELETE_WINDOW", self.hide_window)
        
        self.current_history_count = -1
        self.is_connected = False
        
        self.setup_ui()
        
        self.server_thread = threading.Thread(target=run_fastapi_server, daemon=True)
        self.server_thread.start()
        
        self.check_status_and_history()

    def setup_ui(self):
        # Sidebar
        self.sidebar = ctk.CTkFrame(self, width=200, corner_radius=0, fg_color="#1e1e1e")
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)
        
        # Logo Area
        logo_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        logo_frame.pack(pady=(30, 40), fill="x")
        
        self.logo_label = ctk.CTkLabel(logo_frame, text=" CDE", font=ctk.CTkFont(size=24, weight="bold"), text_color="#3498db")
        self.logo_label.pack()
        self.sub_logo = ctk.CTkLabel(logo_frame, text="Chrome Downloader", font=ctk.CTkFont(size=12), text_color="gray")
        self.sub_logo.pack()

        # Nav Buttons
        self.btn_dashboard = ctk.CTkButton(self.sidebar, text=" Dashboard", anchor="w", 
                                           fg_color="#3498db", text_color="white",
                                           font=ctk.CTkFont(size=15, weight="bold"), height=40, command=self.show_dashboard)
        self.btn_dashboard.pack(pady=5, padx=20, fill="x")
        
        self.btn_history = ctk.CTkButton(self.sidebar, text=" History", anchor="w", 
                                         fg_color="transparent", text_color="gray", hover_color="#2c2c2c",
                                         font=ctk.CTkFont(size=15, weight="bold"), height=40, command=self.show_history)
        self.btn_history.pack(pady=5, padx=20, fill="x")

        # Main Container
        self.main_container = ctk.CTkFrame(self, fg_color="#121212", corner_radius=0)
        self.main_container.pack(side="right", fill="both", expand=True)
        
        self.build_dashboard_frame()
        self.build_history_frame()
        
        self.show_dashboard()

    def build_dashboard_frame(self):
        self.dashboard_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")
        
        # Header
        header = ctk.CTkLabel(self.dashboard_frame, text="Overview", font=ctk.CTkFont(size=28, weight="bold"))
        header.pack(anchor="w", pady=(10, 20))
        
        # Status Card
        self.status_card = ctk.CTkFrame(self.dashboard_frame, fg_color="#1e1e1e", corner_radius=15)
        self.status_card.pack(fill="x", pady=10, ipady=20)
        
        self.status_label = ctk.CTkLabel(self.status_card, text="Checking connection...", font=ctk.CTkFont(size=20, weight="bold"))
        self.status_label.pack(pady=(10, 5))
        
        self.info_text = ctk.CTkLabel(self.status_card, text="", text_color="gray", font=ctk.CTkFont(size=14))
        self.info_text.pack(pady=5)
        
        self.install_ext_btn = ctk.CTkButton(self.status_card, text="Add Chrome Extension", font=ctk.CTkFont(size=14, weight="bold"),
                                             fg_color="#e74c3c", hover_color="#c0392b", height=40, command=self.install_extension)
        
        # Stats Card
        self.stats_card = ctk.CTkFrame(self.dashboard_frame, fg_color="transparent")
        self.stats_card.pack(fill="x", pady=20)
        
        self.stat_box1 = ctk.CTkFrame(self.stats_card, fg_color="#1e1e1e", corner_radius=15, width=280, height=100)
        self.stat_box1.pack(side="left", padx=(0, 10), expand=True, fill="both")
        self.stat_box1.pack_propagate(False)
        ctk.CTkLabel(self.stat_box1, text="Total Downloads", text_color="gray", font=ctk.CTkFont(size=14)).pack(pady=(15, 0))
        self.val_total = ctk.CTkLabel(self.stat_box1, text="0", font=ctk.CTkFont(size=32, weight="bold"), text_color="#3498db")
        self.val_total.pack(pady=5)
        
        self.stat_box2 = ctk.CTkFrame(self.stats_card, fg_color="#1e1e1e", corner_radius=15, width=280, height=100)
        self.stat_box2.pack(side="right", padx=(10, 0), expand=True, fill="both")
        self.stat_box2.pack_propagate(False)
        ctk.CTkLabel(self.stat_box2, text="Server Port", text_color="gray", font=ctk.CTkFont(size=14)).pack(pady=(15, 0))
        ctk.CTkLabel(self.stat_box2, text="8000", font=ctk.CTkFont(size=32, weight="bold"), text_color="#2ecc71").pack(pady=5)

    def build_history_frame(self):
        self.history_frame = ctk.CTkFrame(self.main_container, fg_color="transparent")
        
        header = ctk.CTkLabel(self.history_frame, text="Recent Downloads", font=ctk.CTkFont(size=28, weight="bold"))
        header.pack(anchor="w", pady=(10, 20))
        
        self.history_scroll = ctk.CTkScrollableFrame(self.history_frame, fg_color="transparent")
        self.history_scroll.pack(fill="both", expand=True)

    def show_dashboard(self):
        self.btn_dashboard.configure(fg_color="#3498db", text_color="white")
        self.btn_history.configure(fg_color="transparent", text_color="gray")
        self.history_frame.pack_forget()
        self.dashboard_frame.pack(fill="both", expand=True, padx=30, pady=20)

    def show_history(self):
        self.btn_history.configure(fg_color="#3498db", text_color="white")
        self.btn_dashboard.configure(fg_color="transparent", text_color="gray")
        self.dashboard_frame.pack_forget()
        self.history_frame.pack(fill="both", expand=True, padx=30, pady=20)

    def update_history_ui(self, history):
        # Clear current list
        for widget in self.history_scroll.winfo_children():
            widget.destroy()
            
        if not history:
            lbl = ctk.CTkLabel(self.history_scroll, text="No downloads yet.", text_color="gray", font=ctk.CTkFont(size=16))
            lbl.pack(pady=50)
            self.val_total.configure(text="0")
            return
            
        self.val_total.configure(text=str(len(history)))
            
        for item in history:
            card = ctk.CTkFrame(self.history_scroll, fg_color="#1e1e1e", corner_radius=10)
            card.pack(fill="x", pady=5, padx=5, ipady=5)
            
            # File Type Icon
            is_vid = item.get("type") == "video"
            icon_text = "🎥" if is_vid else "🖼️"
            icon_color = "#e74c3c" if is_vid else "#3498db"
            
            icon_lbl = ctk.CTkLabel(card, text=icon_text, font=ctk.CTkFont(size=24), text_color=icon_color)
            icon_lbl.pack(side="left", padx=15)
            
            # Details
            details_frame = ctk.CTkFrame(card, fg_color="transparent")
            details_frame.pack(side="left", fill="x", expand=True)
            
            fname = item.get("filename", "Unknown")
            if len(fname) > 45: fname = fname[:42] + "..."
            
            ctk.CTkLabel(details_frame, text=fname, font=ctk.CTkFont(size=14, weight="bold"), anchor="w").pack(fill="x")
            
            # Subtitle
            ts = item.get("timestamp", 0)
            date_str = datetime.fromtimestamp(ts/1000).strftime('%b %d, %Y - %I:%M %p') if ts else "Unknown Date"
            src = item.get("url", "")
            if src.startswith("http"):
                src_domain = src.split("/")[2] if len(src.split("/")) > 2 else src
            else:
                src_domain = src
                
            sub_text = f"{'Video' if is_vid else 'Image'} • {date_str} • {src_domain}"
            ctk.CTkLabel(details_frame, text=sub_text, font=ctk.CTkFont(size=11), text_color="gray", anchor="w").pack(fill="x")

    def check_status_and_history(self):
        try:
            # Check Status
            req = urllib.request.Request("http://127.0.0.1:8000/api/status")
            with urllib.request.urlopen(req, timeout=1) as response:
                data = json.loads(response.read().decode())
                self.is_connected = data.get("extension_connected", False)
                
            # Check History
            req2 = urllib.request.Request("http://127.0.0.1:8000/api/get-history")
            with urllib.request.urlopen(req2, timeout=1) as response2:
                data2 = json.loads(response2.read().decode())
                history = data2.get("history", [])
                
                if len(history) != self.current_history_count:
                    self.current_history_count = len(history)
                    self.update_history_ui(history)
                    
        except Exception:
            self.is_connected = False

        if self.is_connected:
            self.status_label.configure(text="Extension Status: 🟢 Connected", text_color="#2ecc71")
            self.info_text.configure(text="Your browser extension is fully paired and ready.", text_color="gray")
            if self.install_ext_btn.winfo_ismapped():
                self.install_ext_btn.pack_forget()
        else:
            self.status_label.configure(text="Extension Status: 🔴 Disconnected", text_color="#e74c3c")
            self.info_text.configure(text="⚠️ Please add the Chrome extension to continue.\nWithout it, the downloader will not work.", text_color="#e74c3c")
            if not self.install_ext_btn.winfo_ismapped():
                self.install_ext_btn.pack(pady=15)
                
        self.after(3000, self.check_status_and_history)

    def install_extension(self):
        if getattr(sys, 'frozen', False):
            ext_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "extension")
        else:
            ext_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "extension")

        dialog = ctk.CTkToplevel(self)
        dialog.title("Install CDE Extension")
        dialog.geometry("550x350")
        dialog.resizable(False, False)
        dialog.transient(self)
        
        title_lbl = ctk.CTkLabel(dialog, text="🚀 Almost Done! Just 3 Easy Steps:", font=ctk.CTkFont(size=18, weight="bold"))
        title_lbl.pack(pady=(20, 15))

        steps_frame = ctk.CTkFrame(dialog, fg_color="transparent")
        steps_frame.pack(fill="x", padx=40, pady=5)

        step1 = ctk.CTkLabel(steps_frame, text="1️⃣ Open Chrome and type: chrome://extensions", font=ctk.CTkFont(size=14), justify="left")
        step1.pack(anchor="w", pady=3)
        
        step2 = ctk.CTkLabel(steps_frame, text="2️⃣ Turn on 'Developer mode' (top right) & click 'Load unpacked'.", font=ctk.CTkFont(size=14), justify="left")
        step2.pack(anchor="w", pady=3)
        
        step3 = ctk.CTkLabel(steps_frame, text="3️⃣ Paste the path (we've already copied it for you!)", font=ctk.CTkFont(size=14), justify="left")
        step3.pack(anchor="w", pady=3)
        
        path_lbl = ctk.CTkEntry(dialog, width=450, font=ctk.CTkFont(size=12))
        path_lbl.insert(0, ext_path)
        path_lbl.configure(state="readonly")
        path_lbl.pack(pady=(20, 10))
        
        btn = ctk.CTkButton(dialog, text="Copy Path & Open Chrome", 
                            font=ctk.CTkFont(size=15, weight="bold"), height=45,
                            command=lambda: self.copy_and_open(ext_path, dialog, btn))
        btn.pack(pady=10)

    def copy_and_open(self, path, dialog, btn):
        self.clipboard_clear()
        self.clipboard_append(path)
        btn.configure(text="Copied! Opening...", fg_color="#2ecc71")
        self.update()
        try:
            import subprocess
            if os.name == 'nt': subprocess.Popen(['start', 'chrome', 'chrome://extensions'], shell=True)
            else: subprocess.Popen(['google-chrome', 'chrome://extensions'])
        except: webbrowser.open("https://google.com")
        self.after(2000, dialog.destroy)

    def hide_window(self):
        self.withdraw()
        try:
            image = Image.open(self.icon_path)
        except:
            image = Image.new('RGB', (64, 64), color=(0, 122, 255))
        menu = pystray.Menu(pystray.MenuItem('Open Dashboard', self.show_window), pystray.MenuItem('Exit', self.quit_app))
        self.tray_icon = pystray.Icon("name", image, "Chrome Downloader Extension", menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def show_window(self, icon, item):
        icon.stop()
        self.after(0, self.deiconify)

    def quit_app(self, icon, item):
        icon.stop()
        self.quit()
        os._exit(0)

if __name__ == "__main__":
    app = HDVideoDownloaderApp()
    app.mainloop()
