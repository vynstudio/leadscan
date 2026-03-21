# LeadScan — Deploy to Digital Ocean

## Option A: Digital Ocean App Platform (Easiest — recommended)
No server management needed. DO builds and runs the container automatically.

### Step 1 — Push to GitHub
```bash
cd leadscan
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/leadscan.git
git push -u origin main
```

### Step 2 — Create App on Digital Ocean
1. Go to https://cloud.digitalocean.com/apps
2. Click **Create App**
3. Choose **GitHub** → select your `leadscan` repo → branch: `main`
4. DO will detect the Dockerfile automatically
5. Set these **Environment Variables**:
   - `PORT` = `8080`
   - `DB_PATH` = `/data/leads.db`
   - `DEFAULT_CITY` = your city (e.g. `miami`)
   - `SCAN_INTERVAL_MINUTES` = `5`
6. Under **Resources**, choose the **$5/month Basic** plan
7. Click **Deploy**

### Step 3 — Add Persistent Storage (Important!)
Without this, your database resets on every deploy.
1. In your App settings → go to **Components**
2. Click your app component → **Edit**
3. Scroll to **Storage** → click **Attach Volume**
4. Create a new volume: name it `leadscan-data`, mount path `/data`
5. Save and redeploy

Your app will be live at: `https://leadscan-xxxxx.ondigitalocean.app`

---

## Option B: Digital Ocean Droplet (Full control)
Use this if you want SSH access and more control.

### Step 1 — Create a Droplet
1. Create a new Droplet: **Ubuntu 22.04**, **Basic $6/month** (1GB RAM)
2. Add your SSH key
3. SSH into it: `ssh root@YOUR_DROPLET_IP`

### Step 2 — Install Docker
```bash
curl -fsSL https://get.docker.com | sh
```

### Step 3 — Clone your repo and run
```bash
git clone https://github.com/YOUR_USERNAME/leadscan.git
cd leadscan
mkdir -p /data
cp .env.example .env
# Edit .env with your settings
nano .env

docker build -t leadscan .
docker run -d \
  --name leadscan \
  --restart always \
  -p 80:8080 \
  -v /data:/data \
  --env-file .env \
  leadscan
```

Your app will be live at: `http://YOUR_DROPLET_IP`

### Step 4 — Auto-update on git push (optional)
Add a GitHub Action to auto-deploy on every push to main.
Ask your assistant to set this up for you.

---

## Updating the app later
Whenever you make changes:
```bash
git add .
git commit -m "Your update"
git push
```
Digital Ocean App Platform will automatically rebuild and redeploy.
