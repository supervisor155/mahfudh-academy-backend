# ⚡ Quick Start - Deploy in 15 Minutes

## Prerequisites
- GitHub account
- Supabase account (free)
- Render account (free/$7)
- Vercel account (free)

---

## Step 1: Supabase Setup (5 minutes)

### 1.1 Create Project
```
1. Visit https://supabase.com
2. Click "New Project"
3. Name: mahfudh-academy
4. Password: (generate strong password)
5. Region: Choose nearest to you
6. Click "Create new project"
7. Wait 2-3 minutes for provisioning
```

### 1.2 Import Database
```
1. Go to "SQL Editor" in left sidebar
2. Click "New query"
3. Copy entire contents of backend/schema.sql
4. Paste into editor
5. Click "Run" (or Ctrl+Enter)
6. Should see "Success. No rows returned"
```

### 1.3 Create Storage Bucket
```
1. Go to "Storage" in left sidebar
2. Click "Create bucket"
3. Name: mahfudh-uploads
4. Click "Public bucket" toggle ON
5. Click "Create bucket"
```

### 1.4 Get Credentials
```
1. Go to "Settings" → "Database"
2. Scroll to "Connection string" → "URI"
3. Copy the connection pooling string (contains .pooler.supabase.com)
4. Save as: DATABASE_URL

5. Go to "Settings" → "API"
6. Copy "Project URL" → Save as: SUPABASE_URL
7. Copy "service_role" key (secret) → Save as: SUPABASE_SERVICE_KEY
```

---

## Step 2: Backend Deploy (5 minutes)

### 2.1 Push Code to GitHub
```bash
cd "C:\Users\abdul\OneDrive\Desktop\mahfuth academy"
git add .
git commit -m "feat: production-ready with Supabase storage and WebRTC"
git push origin main
```

### 2.2 Deploy on Render
```
1. Visit https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Settings:
   - Name: mahfudh-academy-backend
   - Root Directory: backend
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
   - Instance Type: Free (or Starter $7/month for always-on)
```

### 2.3 Environment Variables
Click "Environment" tab and add (one by one):

```bash
PORT=4000
NODE_ENV=production
DATABASE_URL=[paste from Supabase step 1.4]
SUPABASE_URL=[paste from Supabase step 1.4]
SUPABASE_SERVICE_KEY=[paste from Supabase step 1.4]
SUPABASE_BUCKET=mahfudh-uploads
JWT_SECRET=[generate random 32+ character string]
JWT_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_DAYS=14
JWT_ISSUER=mahfudh-academy-api
JWT_AUDIENCE=mahfudh-academy-client
JWT_REFRESH_AUDIENCE=mahfudh-academy-refresh
CLIENT_ORIGIN=https://mahfudhacademy.vercel.app
BASE_URL=https://mahfudh-academy-backend.onrender.com
AUTH_MODE=bearer
LOG_LEVEL=info
```

**Generate JWT_SECRET:**
```bash
# Option 1: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Online
# Visit https://generate-random.org/api-key-generator
```

### 2.4 Deploy
```
1. Click "Create Web Service"
2. Wait 3-5 minutes for deployment
3. Check logs for: ✅ Supabase Storage initialized
4. Copy your backend URL: https://mahfudh-academy-backend.onrender.com
```

---

## Step 3: Frontend Deploy (5 minutes)

### 3.1 Deploy on Vercel
```
1. Visit https://vercel.com
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Settings:
   - Framework Preset: Vite
   - Root Directory: frontend
   - Build Command: npm run build
   - Output Directory: dist
```

### 3.2 Environment Variables
Click "Environment Variables" and add:

```bash
VITE_API_BASE_URL=https://mahfudh-academy-backend.onrender.com
```

Replace with your actual Render backend URL from step 2.4.

### 3.3 Deploy
```
1. Click "Deploy"
2. Wait 2-3 minutes for build
3. Copy your frontend URL: https://mahfudhacademy.vercel.app
```

### 3.4 Update Backend CORS
⚠️ **CRITICAL STEP**

```
1. Go back to Render dashboard
2. Select your backend service
3. Go to "Environment" tab
4. Update CLIENT_ORIGIN to your Vercel URL:
   CLIENT_ORIGIN=https://mahfudhacademy.vercel.app
5. Click "Save Changes"
6. Click "Manual Deploy" → "Deploy latest commit"
7. Wait for restart (~2 minutes)
```

---

## Step 4: Test (2 minutes)

### 4.1 Health Check
Visit: `https://mahfudh-academy-backend.onrender.com/health`

Should see:
```json
{
  "status": "ok",
  "db": "ok",
  "storage": "supabase",
  "version": "1.0.0"
}
```

### 4.2 Login Page
Visit: `https://mahfudhacademy.vercel.app`

Should see login page with no errors.

### 4.3 Test Accounts
Use these credentials to test:

**Teacher:**
- Email: teacher@mahfudhacademy.com
- Password: ChangeMe123!

**Owner:**
- Email: owner@mahfudhacademy.com
- Password: ChangeMe123!

If these don't exist, register a new account.

### 4.4 Test File Upload
```
1. Login as teacher
2. Go to any class
3. Click "Videos" tab
4. Click "Upload Video"
5. Upload a small video file
6. Should upload to Supabase successfully
7. Refresh page → Video still there ✅
```

---

## ✅ Success Checklist

- [ ] Backend deployed on Render
- [ ] Frontend deployed on Vercel  
- [ ] Database working (health check shows `"db": "ok"`)
- [ ] Storage working (health check shows `"storage": "supabase"`)
- [ ] Can login to frontend
- [ ] Can upload video → Video persists after refresh
- [ ] Can see videos list
- [ ] No CORS errors in browser console
- [ ] Socket.io connected (check console for `✅ Socket connected`)

---

## 🐛 Quick Troubleshooting

### "Upload failed"
- Check Supabase bucket is named `mahfudh-uploads`
- Check bucket is public
- Check `SUPABASE_SERVICE_KEY` is set (not anon key)

### "Socket disconnected" / CORS errors
- Check `CLIENT_ORIGIN` matches your Vercel URL exactly
- Restart backend after changing `CLIENT_ORIGIN`

### Videos not showing
- Files upload to Supabase but don't appear? Check browser network tab
- Look for failed API calls
- Check backend logs on Render

### Backend won't start
- Check all environment variables are set
- Check `DATABASE_URL` is the pooler URL (contains `.pooler.`)
- Check Render logs for specific error

---

## 📞 Need More Help?

See detailed troubleshooting in `PRODUCTION_SETUP.md`

---

**Total Time: 15 minutes** ⏱️  
**Total Cost: Free tier or $7/month** 💰  
**Ready to use!** 🎉
