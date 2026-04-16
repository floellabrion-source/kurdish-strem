# Deploy Guide (Hetzner + PM2 + Nginx)

ئەم ڕێنماییە بۆ ئەوەیە پرۆژەکە بە شێوەی production لەسەر Hetzner ڕابکەیت و دواتریش بە ئاسانی update بکەیت.

## 1) یەکجاری سەرەتا لە سێرڤەر

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2) هێنانی پرۆژەکە

```bash
cd /var/www
sudo mkdir -p kurdish-stream
sudo chown -R $USER:$USER /var/www/kurdish-stream
cd /var/www/kurdish-stream
git clone <YOUR_REPO_URL> .
```

## 3) Backend setup

```bash
cd /var/www/kurdish-stream/server
npm ci --omit=dev
cp .env.example .env
nano .env
```

`.env` پڕ بکە (گرنگ):

- `OPENROUTER_API_KEY=...`
- `OPENROUTER_MODEL=openai/gpt-4o-mini`
- `R2_BUCKET=...`
- `R2_ACCESS_KEY_ID=...`
- `R2_SECRET_ACCESS_KEY=...`
- `R2_ENDPOINT=...`
- `R2_PUBLIC_URL=...`

پاشان backend ڕابکە:

```bash
cd /var/www/kurdish-stream/server
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 4) Frontend build

```bash
cd /var/www/kurdish-stream/client
npm ci
npm run build
```

## 5) Nginx setup

```bash
sudo cp /var/www/kurdish-stream/deploy/nginx-kurdish-stream.conf /etc/nginx/sites-available/kurdish-stream
sudo ln -s /etc/nginx/sites-available/kurdish-stream /etc/nginx/sites-enabled/kurdish-stream
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 6) Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

## 7) پشکنین (Post-Deploy)

- `http://116.203.204.171` کار بکات
- لە browser network: `/api/ai/generate` status 200/4xx (نەک 404)
- `pm2 logs kurdish-stream-api` بۆ پشکنینی هەڵەکان

## 8) Update (هەر جار)

```bash
cd /var/www/kurdish-stream
git pull

cd /var/www/kurdish-stream/server
npm ci --omit=dev
pm2 restart kurdish-stream-api

cd /var/www/kurdish-stream/client
npm ci
npm run build

sudo systemctl reload nginx
```

## 9) تێبینی گرنگ بۆ API Key

- API key تەنها لە `server/.env` بێت.
- API key مەخە ناو frontend.
- ئەگەر key ئاشکرا بوو، `rotate/revoke` بکە و key نوێ دابنێ لە `.env`، پاشان:

```bash
pm2 restart kurdish-stream-api
```
