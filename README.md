# DandDanny — TDODJ.com

Angular + Node/Express + PostgreSQL (Supabase) game application deployed on AWS.

---

## Architecture

```
Users → https://tdodj.com     → CloudFront → S3          (Angular frontend)
Users → https://api.tdodj.com → EC2        → Node/Express → Supabase (PostgreSQL)
```

---

## Local Development

**Start the frontend:**
```bash
ng serve
```
Open `http://localhost:4200/`. Hot-reloads on file changes.

**Start the backend:**
```bash
cd backend
npm run dev
```
Runs on `http://localhost:3000` via `ts-node-dev`.

**Local database:** PostgreSQL running locally. Connection string in `backend/.env`:
```
DATABASE_URL=postgres://postgres:...@localhost:5432/postgres
```

**Rebuild the local DB schema from scratch:**
```bash
cd backend
node scripts/run-sql-migration.cjs sql/clean_schema.sql
```

---

## Deploying

### Deploy Frontend (Angular → S3 + CloudFront)
```powershell
.\deploy-frontend.ps1
```
- Builds Angular with `ng build --configuration production`
- Syncs `dist/DandDanny/browser/` to S3 bucket `tdodj.com`
- HTML files get `no-cache` headers; hashed JS/CSS get 1-year immutable cache
- Invalidates CloudFront distribution so users get the new version immediately

**Skip the build step (just re-sync):**
```powershell
.\deploy-frontend.ps1 -SkipBuild
```

### Deploy Backend (Node/Express → EC2)
```powershell
.\deploy-backend.ps1
```
- Compiles TypeScript (`tsc`) to `backend/dist/`
- Uploads compiled JS, `package.json`, and `backend/.prod.env` (as `.env`) to EC2
- Installs production dependencies on the server
- Restarts the app under PM2

**Skip the build step:**
```powershell
.\deploy-backend.ps1 -SkipBuild
```

---

## AWS Infrastructure

| Resource | ID / Value |
|---|---|
| **S3 Bucket** | `tdodj.com` (us-east-1, private) |
| **CloudFront Distribution** | `E2FHMVKCK5QKSV` → `d3h7sbwh1h2x4v.cloudfront.net` |
| **ACM Certificate** | `tdodj.com` + `www.tdodj.com` (DNS validated) |
| **EC2 Instance** | `i-0daea5443c22edf8b` — `44.222.133.132` |
| **EC2 Spec** | t3.micro, Amazon Linux 2023, 20GB gp3 |
| **Security Group** | `sg-0b0eef386f41de597` (ports 22, 80, 443 open) |
| **Key Pair** | `tdodj-ec2` — saved at `~\.ssh\tdodj-ec2.pem` |
| **IAM User** | `Game.Master.TDODJ` (account `868373543042`) |

**Route 53 Records:**
| Record | Type | Points To |
|---|---|---|
| `tdodj.com` | A (Alias) | CloudFront distribution |
| `www.tdodj.com` | A (Alias) | CloudFront distribution |
| `api.tdodj.com` | A | `44.222.133.132` (EC2) |

**Database:** Supabase PostgreSQL 17.6 — 16 tables, connected via session pooler:
```
aws-1-us-east-2.pooler.supabase.com:5432
```

---

## Server Management

**SSH into EC2:**
```powershell
ssh -i $HOME\.ssh\tdodj-ec2.pem ec2-user@44.222.133.132
```

**Check backend status:**
```bash
pm2 list
pm2 logs tdodj-backend
pm2 monit                          # live CPU/memory dashboard
pm2 logs tdodj-backend --lines 50  # last 50 log lines
```

**Restart backend manually:**
```bash
pm2 restart tdodj-backend
```

**Check Caddy (HTTPS reverse proxy) status:**
```bash
sudo systemctl status caddy
sudo journalctl -u caddy -n 50
```

Both PM2 and Caddy are configured with systemd to **auto-start on reboot**.

---

## Important: EC2 Public IP

The public IP `44.222.133.132` is not static — it only changes if the instance is **stopped and started** (not on reboot). If that happens:

```powershell
# 1. Get the new IP
aws ec2 describe-instances --instance-ids i-0daea5443c22edf8b --query "Reservations[0].Instances[0].PublicIpAddress" --output text

# 2. Update deploy-backend.ps1 with the new IP ($EC2_HOST variable)
# 3. Update Route 53 api.tdodj.com A record to the new IP
```

To avoid this entirely, assign an **Elastic IP** in the AWS Console (free while the instance is running).

---

## Estimated Monthly Cost

| Service | ~Cost/mo |
|---|---|
| EC2 t3.micro (on-demand) | $7.59 |
| EBS 20GB gp3 | $1.60 |
| Route 53 | $0.70 |
| CloudFront + S3 | $0.60 |
| Supabase (free tier) | $0.00 |
| **Total** | **~$10–12** |

Supabase free tier: 500MB storage, 2GB bandwidth/month. Upgrade to Pro ($25/mo) if exceeded.
Savings: Switch EC2 to a 1-year Reserved Instance to cut compute cost to ~$4.38/mo.

---

## Files Reference

| File | Purpose |
|---|---|
| `deploy-frontend.ps1` | Build + deploy Angular to S3/CloudFront |
| `deploy-backend.ps1` | Build + deploy Node backend to EC2 |
| `ec2-setup.sh` | One-time EC2 server setup (Node 22, PM2, Caddy) — already run |
| `backend/.env` | Local development environment variables |
| `backend/.prod.env` | Production environment variables (Supabase URL) — deployed to EC2 as `.env` |
| `src/environments/environment.ts` | Dev Angular environment (API = localhost:3000) |
| `src/environments/environment.prod.ts` | Prod Angular environment (API = api.tdodj.com) |
| `backend/sql/clean_schema.sql` | Full DB schema — all 16 tables consolidated |
| `~\.ssh\tdodj-ec2.pem` | SSH private key for EC2 access |
