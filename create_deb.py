import os
import shutil
import subprocess

def create_deb():
    app_name = "cde-downloader"
    version = "1.0"
    arch = "amd64"
    deb_dir = f"{app_name}_{version}_{arch}"

    # Create directory structure
    dirs = [
        f"{deb_dir}/DEBIAN",
        f"{deb_dir}/opt/{app_name}",
        f"{deb_dir}/usr/share/applications",
        f"{deb_dir}/usr/share/icons/hicolor/256x256/apps",
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)

    # 1. Create control file
    control_content = f"""Package: {app_name}
Version: {version}
Architecture: {arch}
Maintainer: Unknown <admin@example.com>
Description: CDE (IDM Style)
  Universal CDE Desktop application and Chrome Extension.
"""
    with open(f"{deb_dir}/DEBIAN/control", "w") as f:
        f.write(control_content)

    # 2. Create postinst script (to ensure executable permissions)
    postinst_content = f"""#!/bin/sh
chmod +x /opt/{app_name}/app
"""
    postinst_path = f"{deb_dir}/DEBIAN/postinst"
    with open(postinst_path, "w") as f:
        f.write(postinst_content)
    os.chmod(postinst_path, 0o755)

    # 3. Create .desktop shortcut
    desktop_content = f"""[Desktop Entry]
Name=CDE
Comment=IDM Style Downloader for Chrome
Exec=/opt/{app_name}/app
Icon=/opt/{app_name}/_internal/desktop_app/icons/icon128.png
Terminal=false
Type=Application
Categories=Utility;Network;
"""
    with open(f"{deb_dir}/usr/share/applications/{app_name}.desktop", "w") as f:
        f.write(desktop_content)

    # 4. Copy the PyInstaller build (dist/app) to /opt/cde/
    # We use shutil.copytree to copy the entire one-dir output
    dist_app_dir = "dist/app"
    if not os.path.exists(dist_app_dir):
        print(f"Error: {dist_app_dir} not found. Build the app first.")
        return

    # Remove existing opt folder contents if running multiple times
    if os.path.exists(f"{deb_dir}/opt/{app_name}"):
        shutil.rmtree(f"{deb_dir}/opt/{app_name}")
    shutil.copytree(dist_app_dir, f"{deb_dir}/opt/{app_name}")

    # 5. Create a simple icon or copy one if exists
    # For now, we'll just skip icon if not found, or create a dummy one
    icon_dest = f"{deb_dir}/usr/share/icons/hicolor/256x256/apps/{app_name}.png"
    if os.path.exists("icons/icon128.png"):
        shutil.copy("icons/icon128.png", icon_dest)
    else:
        # Create a dummy image
        try:
            from PIL import Image
            img = Image.new('RGB', (256, 256), color = (0, 122, 255))
            img.save(icon_dest)
        except:
            pass

    # 6. Build the .deb file
    print(f"Building Debian package: {deb_dir}.deb")
    subprocess.check_call(["dpkg-deb", "--build", deb_dir])
    print(f"Success! You can now install it using: sudo dpkg -i {deb_dir}.deb")

if __name__ == "__main__":
    create_deb()
