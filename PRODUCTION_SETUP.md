# 🚀 Mahfudh Academy - Production Deployment Guide

## 📋 Overview

This guide covers deploying Mahfudh Academy to production with:
- **Frontend**: Vercel
- **Backend**: Render
- **Database**: Supabase PostgreSQL
- **File Storage**: Supabase Storage

---

## 🔧 Backend Setup (Render)

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Wait for database to be provisioned
4. Go to **Settings → Database** and copy the connection string
5. Go to **Storage** and create a new bucket named: `mahfudh-uploads`
6. Make the bucket **public** (Settings → Make public)
7. Go to **Settings → API** and copy:
   - Project URL: `https://your-project.supabase.co`
   - Service Role Key (secret): `eyJhbGc...`

### 2. Import Database Schema

1. In Supabase, go to **SQL Editor**
2. Open `backend/schema.sql` from your local project
3. Copy and paste the entire schema
4. Click **Run** to create all tables

### 3. Deploy Backend to Render

1. Go to [https://render.com](https://render.com)
2. Create new **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

### 4. Set Environment Variables on Render

Go to **Environment** tab and add these variables:

```bash
# Server
PORT=4000
NODE_ENV=production

# Database (from Supabase)
DATABASE_URL=postgresql://postgres.xxxxx:your-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...your-service-role-key
SUPABASE_BUCKET=mahfudh-uploads

# JWT Secrets (generate secure random strings)
JWT_SECRET=your_super_secret_jwt_key_here_at_least_32_chars
JWT_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_DAYS=14
JWT_ISSUER=mahfudh-academy-api
JWT_AUDIENCE=mahfudh-academy-client
JWT_REFRESH_AUDIENCE=mahfudh-academy-refresh

# CORS - CRITICAL! Set to your Vercel frontend URL
CLIENT_ORIGIN=https://mahfudhacademy.vercel.app

# Base URL (your Render backend URL)
BASE_URL=https://mahfudh-academy-backend.onrender.com

# Auth
AUTH_MODE=bearer

# Logging
LOG_LEVEL=info

# Rate Limiting
LOGIN_MAX_FAILURES=6
LOGIN_LOCK_MINUTES=15

# OTP Settings (optional - for future SMS/email verification)
OTP_EXPIRES_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_MIN_INTERVAL_SECONDS=60
REGISTRATION_VERIFICATION_EXPIRES_MINUTES=15
OTP_DEV_LOG_CODE=0

# Email (optional - configure for production email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Mahfudh Academy <noreply@mahfudhacademy.com>

# Security
SOCKET_BAN_MINUTES=15
CHAT_RESTRICT_THRESHOLD=3
CHAT_RESTRICT_MINUTES=1440
SECURITY_LOCKOUT_RETENTION_DAYS=30
SECURITY_AUDIT_RETENTION_DAYS=90
SECURITY_BAN_RETENTION_DAYS=30
SECURITY_RESTRICTION_RETENTION_DAYS=30
SECURITY_CLEANUP_INTERVAL_MS=21600000
```

### 5. Deploy Backend

1. Click **Create Web Service**
2. Wait for deployment (takes ~5 minutes first time)
3. Your backend will be available at: `https://mahfudh-academy-backend.onrender.com`

### 6. Test Backend

Visit: `https://mahfudh-academy-backend.onrender.com/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": "2026-06-10T12:00:00.000Z"
}
```

---

## 🎨 Frontend Setup (Vercel)

### 1. Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Click **Import Project**
3. Connect your GitHub repository
4. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 2. Set Environment Variables on Vercel

Go to **Settings → Environment Variables** and add:

```bash
VITE_API_BASE_URL=https://mahfudh-academy-backend.onrender.com
```

### 3. Deploy Frontend

1. Click **Deploy**
2. Wait for build (takes ~2 minutes)
3. Your frontend will be available at: `https://mahfudhacademy.vercel.app`

### 4. Update Backend CORS

⚠️ **CRITICAL STEP** - Go back to Render and update the `CLIENT_ORIGIN` variable:

```bash
CLIENT_ORIGIN=https://mahfudhacademy.vercel.app
```

Then **manually restart** the backend service.

---

## ✅ Verification Checklist

### Backend Health Checks

- [ ] Visit `https://your-backend.onrender.com/health` → Returns `{"status":"ok"}`
- [ ] Check Render logs for: `✅ Supabase Storage initialized`
- [ ] Check Render logs for: `🌐 Allowed CORS origins: https://mahfudhacademy.vercel.app`
- [ ] No database connection errors in logs

### Frontend Health Checks

- [ ] Visit `https://mahfudhacademy.vercel.app` → Login page loads
- [ ] Open browser DevTools → Console → No CORS errors
- [ ] Open browser DevTools → Network → API calls go to correct backend URL
- [ ] Register a new user → Success
- [ ] Login with test account → Redirects to dashboard

### File Upload Tests

- [ ] Login as teacher
- [ ] Go to a class
- [ ] Upload a video → Success
- [ ] Video appears in list
- [ ] Click video → Plays correctly
- [ ] Upload a reel → Success
- [ ] Reel appears and plays
- [ ] Upload a file attachment → Success

### Real-Time Features

- [ ] Open browser DevTools → Console → Look for: `✅ Socket connected`
- [ ] No Socket.io connection errors
- [ ] Open class chat → Send message → Appears for other users
- [ ] Create announcement → All students receive notification

### Live Session (WebRTC)

- [ ] Teacher starts live session
- [ ] Student joins session
- [ ] Video/audio works between participants
- [ ] Screen sharing works
- [ ] Session ends gracefully

---

## 🐛 Troubleshooting

### Issue: Videos/Reels Not Showing

**Symptoms**: Uploaded files disappear after page refresh

**Cause**: Supabase Storage not configured

**Fix**:
1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set correctly
2. Check bucket exists and is named `mahfudh-uploads`
3. Check bucket is public
4. Check Render logs for: `✅ Supabase Storage initialized`
5. If not, restart Render service

### Issue: File Upload Fails

**Symptoms**: "Upload failed" error when uploading files

**Causes & Fixes**:

1. **Supabase bucket not public**
   - Go to Supabase Storage → `mahfudh-uploads` → Settings → Make public

2. **Wrong bucket name**
   - Verify `SUPABASE_BUCKET=mahfudh-uploads` in Render env vars

3. **Invalid service key**
   - Use **Service Role Key** (not anon key)
   - Go to Supabase → Settings → API → Copy service_role key

### Issue: Socket.io Not Connecting

**Symptoms**: `❌ Socket disconnected` or `⚠️ Rejected CORS origin` in console

**Causes & Fixes**:

1. **CORS not configured**
   - Verify `CLIENT_ORIGIN=https://mahfudhacademy.vercel.app` in Render
   - Restart Render service after changing

2. **Wrong backend URL**
   - Verify `VITE_API_BASE_URL=https://your-backend.onrender.com` in Vercel
   - Redeploy frontend after changing

3. **Backend sleeping (Render free tier)**
   - Render free tier sleeps after 15 minutes of inactivity
   - First request takes ~30 seconds to wake up
   - Upgrade to paid tier to prevent sleeping

### Issue: WebRTC Not Working

**Symptoms**: Can't see/hear other participants in live session

**Causes & Fixes**:

1. **Camera/microphone permissions denied**
   - Allow permissions in browser
   - HTTPS required for camera access (production ✅, localhost ✅)

2. **Firewall blocking WebRTC**
   - Check corporate/school firewall settings
   - WebRTC uses UDP ports (may be blocked)

3. **No TURN server**
   - Current setup uses free Google STUN servers
   - For better reliability, add paid TURN server:
     - [Twilio STUN/TURN](https://www.twilio.com/docs/stun-turn)
     - [Xirsys](https://xirsys.com/)
     - Self-hosted [coturn](https://github.com/coturn/coturn)

### Issue: Database Connection Fails

**Symptoms**: `ECONNREFUSED` or `connection timeout` in Render logs

**Causes & Fixes**:

1. **Wrong connection string**
   - Use **connection pooling** URL from Supabase
   - Format: `postgresql://postgres.xxxxx:pass@...pooler.supabase.com:5432/postgres`
   - NOT the direct connection string

2. **Supabase project paused**
   - Free tier pauses after 1 week of inactivity
   - Login to Supabase to resume

### Issue: CORS Errors in Browser

**Symptoms**: `Access to XMLHttpRequest blocked by CORS policy`

**Fix**:
1. Check `CLIENT_ORIGIN` in Render includes your Vercel URL
2. Restart Render service
3. Hard refresh frontend (Ctrl+Shift+R)

---

## 📊 Monitoring & Maintenance

### Backend Logs (Render)

View at: https://dashboard.render.com → Your Service → Logs

**What to watch for**:
- `❌ Supabase upload error` → Storage misconfigured
- `⚠️ Rejected CORS origin` → CORS issue
- `Database connection error` → Database down
- `500 Internal Server Error` → Application bug

### Frontend Logs (Vercel)

View at: https://vercel.com/your-project → Deployments → Logs

### Database Monitoring (Supabase)

View at: https://supabase.com/dashboard → Your Project → Reports

**What to watch for**:
- Storage usage approaching limits
- Database size approaching limits
- API requests per second

### Render Free Tier Limits

- ⚠️ Spins down after 15 minutes of inactivity
- ⚠️ 750 hours/month (sleeps after quota)
- ✅ Upgrade to $7/month for always-on

### Vercel Free Tier Limits

- ✅ 100 GB bandwidth/month
- ✅ Unlimited deployments
- ✅ Always-on (no sleeping)

### Supabase Free Tier Limits

- ✅ 500 MB database storage
- ✅ 1 GB file storage
- ✅ 50,000 monthly active users
- ✅ Unlimited API requests

---

## 🔐 Security Checklist

- [ ] JWT_SECRET is long and random (32+ characters)
- [ ] DATABASE_URL uses connection pooling (`.pooler.supabase.com`)
- [ ] SUPABASE_SERVICE_KEY is secret (never commit to git)
- [ ] CLIENT_ORIGIN only includes your production frontend URL
- [ ] Supabase bucket policies reviewed
- [ ] Rate limiting configured (default: 600 req/5min)
- [ ] Helmet security headers enabled (automatic)
- [ ] HTTPS enforced (automatic on Vercel/Render)

---

## 💰 Cost Estimation (Production)

| Service | Tier | Cost | Notes |
|---------|------|------|-------|
| **Render Backend** | Starter | $7/month | Always-on, no sleeping |
| **Vercel Frontend** | Free | $0/month | Hobby plan, sufficient for small apps |
| **Supabase Database** | Free | $0/month | Upgrade at 500MB or 50K users |
| **Supabase Storage** | Free → Pro | $0-$25/month | Free 1GB, then $0.021/GB |
| **TURN Server** (optional) | Twilio | ~$0.10/GB | Only needed for poor networks |

**Total**: ~$7-10/month for small-medium usage

---

## 📝 Post-Deployment Tasks

### 1. Create Admin Accounts

```bash
# SSH into Render or use Render shell
npm run seed:admin
```

Or manually register on the frontend and promote to owner via SQL:

```sql
UPDATE users SET role = 'owner' WHERE email = 'admin@mahfudhacademy.com';
```

### 2. Test All Features

- [ ] User registration
- [ ] User login
- [ ] Create class
- [ ] Join class with invite code
- [ ] Upload video
- [ ] Upload reel
- [ ] Upload file attachment
- [ ] Create assignment
- [ ] Submit assignment
- [ ] Post announcement
- [ ] Send chat message
- [ ] Start live session
- [ ] Join live session
- [ ] Use Muṣḥaf with notes

### 3. Configure Email (Optional)

For production email notifications:

1. Create Gmail App Password or use SendGrid/Mailgun
2. Update `SMTP_*` environment variables in Render
3. Test email by requesting password reset

### 4. Setup Monitoring

Consider adding:
- [Sentry](https://sentry.io) for error tracking
- [LogRocket](https://logrocket.com) for session replay
- [UptimeRobot](https://uptimerobot.com) for uptime monitoring

---

## 🎉 Success!

If all checklist items are ✅, your Mahfudh Academy is live!

**Share with your team**:
- Frontend: https://mahfudhacademy.vercel.app
- Teacher Login: teacher@mahfudhacademy.com / ChangeMe123!
- Owner Login: owner@mahfudhacademy.com / ChangeMe123!

---

## 📞 Support

If you encounter issues not covered here:

1. Check Render logs first
2. Check browser DevTools console
3. Check Supabase logs
4. Review error messages carefully
5. Google the specific error message

Common error patterns are documented in the Troubleshooting section above.
