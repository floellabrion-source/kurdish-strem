#!/usr/bin/env bash
set -e

echo "=========================================="
echo "🚀 Kurdish Stream Automated Deployment"
echo "=========================================="

# 1. Update and install base packages
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx ffmpeg build-essential ufw

# 2. Install Node.js 20 & PM2
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
npm install -g pm2

# 3. Clone / Update Project Repository
mkdir -p /var/www
if [ -d "/var/www/kurdish-stream" ]; then
    echo "Updating existing repository..."
    cd /var/www/kurdish-stream
    git fetch origin master
    git reset --hard origin/master
else
    echo "Cloning repository..."
    git clone https://github.com/floellabrion-source/kurdish-strem.git /var/www/kurdish-stream
    cd /var/www/kurdish-stream
fi

# 4. Write Server .env
echo "T1BFTlJPVVRFUl9BUElfS0VZPXNrLW9yLXYxLTI5NWUyYjhhNGQxNGZjOTRlZGEyYTI4ZGE0YjNhNjFjYjY4Nzc2MTVlNzdjNGRmMzk2YTViMzg2YzhiMTJjOWMNCk9QRU5ST1VURVJfTU9ERUw9Z29vZ2xlL2dlbWluaS0yLjUtZmxhc2gtbGl0ZQ0KDQojIFByZXZpb3VzIFZlcnRleCBBSSBDb25maWd1cmF0aW9uIChEaXNhYmxlZCkNCiMgR09PR0xFX0NMT1VEX1BST0pFQ1RfSUQ9bXktYWktcHJvamVjdC00OTQ5MjANCiMgR09PR0xFX0NMT1VEX0xPQ0FUSU9OPSJ1cy1lYXN0NCINCiMgR09PR0xFX0FQUExJQ0FUSU9OX0NSRURFTlRJQUxTPSJ2ZXJ0ZXgta2V5Lmpzb24iDQoNClIyX0JVQ0tFVD1rdXJkaXNoc3RyZWFtDQpSMl9BQ0NFU1NfS0VZX0lEPTdkMTcxY2Y1YzY4MDBmZTc4YzRhZjllZmFjNTJiNTg4DQpSMl9TRUNSRVRfQUNDRVNTX0tFWT00ZjE0MmIyYzUyNjg0MjIzOTY2ZTFiODgzZTNmYWFmOGYyYzQ2MDA4YTIwNmE4OWQ3OTRmYzZkMDU1Y2ZhMGU1DQpSMl9FTkRQT0lOVD1odHRwczovL2U0MTFmMzFiNDVhZTFjOWQzOWY5YzQyODcxNDBhNzlhLnIyLmNsb3VkZmxhcmVzdG9yYWdlLmNvbQ0KUjJfUFVCTElDX1VSTD1odHRwczovL3B1Yi1iMGQ0NDlkOGU5MWE0OTM1Yjk4M2Y0NzljMjJkODc5Ni5yMi5kZXYNCg0KUE9SVD0zMDAxDQpPTURCX0FQSV9LRVk9ZTAyNzIwOGMNCiMgR0VNSU5JX1JFR0lPTj1ldXJvcGUtd2VzdDENCg0KIyBUZWxlZ3JhbSBBdXRvLUJhY2t1cCBOb3RpZmljYXRpb24gQm90DQpURUxFR1JBTV9CT1RfVE9LRU49ODg4ODgzNjA5MTpBQUczRXFkaVZudU1BcGlrN1FFbzhXSmw2VGVhdkJGY3ByWQ0KVEVMRUdSQU1fQ0hBVF9JRD0xODM4MDMwNTQ0DQoNCiMgR29vZ2xlIFNNVFAgRW1haWwgU2VydmljZQ0KU01UUF9IT1NUPXNtdHAuZ21haWwuY29tDQpTTVRQX1BPUlQ9NDY1DQpTTVRQX1NFQ1VSRT10cnVlDQpTTVRQX1VTRVI9ZmxvZWxsYWJyaW9uQGdtYWlsLmNvbQ0KU01UUF9QQVNTPXZmYWJvZXplZXpsYWt2dHQNCiMgR29vZ2xlIE9BdXRoIDIuMCBDcmVkZW50aWFscw0KR09PR0xFX0NMSUVOVF9JRD04ODExOTI1MjEwMDgtajZ0MTRhZGM0NDYxcHI1ZDhpMmxvMGE1dGJpMG9pNTEuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20NCkdPT0dMRV9DTElFTlRfU0VDUkVUPUdPQ1NQWC1uZEpETjVMdjVsMG1hSHlVM0ZPaF81enVLdGF3DQoNCiMgPT09PT09PSBTdXBhYmFzZSBEYXRhYmFzZSA9PT09PT09DQpTVVBBQkFTRV9VUkw9aHR0cHM6Ly9teWRzeXJpdGVna3h0d2xjdmt4dy5zdXBhYmFzZS5jbw0KU1VQQUJBU0VfQU5PTl9LRVk9c2JfcHVibGlzaGFibGVfMEVxYUtYRmJLdXpDSEdkV3V6MWI4Z182Q0xWb0NLVQ0KU1VQQUJBU0VfU0VSVklDRV9ST0xFX0tFWT1zYl9zZWNyZXRfalNMZzlHakhYcDlhV0wwaGYtdzRDZ19jbFB4MGhwbA0KDQo=" | base64 -d > /var/www/kurdish-stream/server/.env

# 5. Build and Start Server
echo "Installing server dependencies..."
cd /var/www/kurdish-stream/server
npm install --production
pm2 delete kurdish-stream-api 2>/dev/null || true
pm2 start index.js --name kurdish-stream-api
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# 6. Build Frontend
echo "Building frontend..."
cd /var/www/kurdish-stream/client
npm install
npm run build

# 7. Configure Nginx
cat << 'EOF' > /etc/nginx/sites-available/default
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    root /var/www/kurdish-stream/client/dist;
    index index.html;

    client_max_body_size 5000M;
    proxy_read_timeout 1800s;
    proxy_connect_timeout 1800s;
    proxy_send_timeout 1800s;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

nginx -t
systemctl restart nginx

# 8. Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=========================================="
echo "🎉 ALL DONE! Kurdish Stream is LIVE on:"
echo "👉 http://77.42.22.139"
echo "=========================================="
