@echo off
title Kurdish Stream - Smart HLS GPU Converter & Cloud Auto-Sync
cd /d "%~dp0scripts"
"C:\Users\BSMA CO\AppData\Local\Programs\Python\Python313\python.exe" "%~dp0scripts\hls_converter.py" %*
if errorlevel 1 (
    echo.
    echo Error occurred. Press any key to close...
    pause
)
