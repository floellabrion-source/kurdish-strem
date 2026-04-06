# Kurdish Stream - Setup Script
# Run this script in PowerShell to set up the project

Write-Host "=== Kurdish Stream Setup ===" -ForegroundColor Cyan

# 1. Install server dependencies  
Write-Host "`n[1/3] Installing server dependencies..." -ForegroundColor Yellow
Set-Location "C:\Users\BSMA CO\Downloads\kurdish-stream\server"
npm install

# 2. Create client with Vite
Write-Host "`n[2/3] Creating React client..." -ForegroundColor Yellow
Set-Location "C:\Users\BSMA CO\Downloads\kurdish-stream"
npx create-vite@latest client --template react-ts

# 3. Install client dependencies
Write-Host "`n[3/3] Installing client dependencies..." -ForegroundColor Yellow
Set-Location "C:\Users\BSMA CO\Downloads\kurdish-stream\client"
npm install
npm install react-router-dom lucide-react axios

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Now run: cd 'C:\Users\BSMA CO\Downloads\kurdish-stream' then start both server and client" -ForegroundColor Cyan
