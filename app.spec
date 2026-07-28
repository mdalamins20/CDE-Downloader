# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['desktop_app/app.py'],
    pathex=[],
    binaries=[],
    datas=[('desktop_app/api', 'api'), ('desktop_app/icons', 'icons'), ('extension/manifest.json', 'extension'), ('extension/background.js', 'extension'), ('extension/content.js', 'extension'), ('extension/content.css', 'extension'), ('extension/popup.js', 'extension'), ('extension/popup.css', 'extension'), ('extension/popup.html', 'extension'), ('extension/icons', 'extension/icons')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='app',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='app',
)
