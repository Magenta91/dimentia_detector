# Deployment Guide - Dementia Detection Tool

## Architecture Overview

The application consists of three main components:

1. **Frontend**: React + Vite application
2. **Backend**: Express.js + Node.js with optional Python support for audio processing
3. **Database**: MongoDB Atlas (cloud-hosted)

**Deployment Targets:**
- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas (already configured)

---

## Prerequisites

### Required Software Versions

- **Node.js**: v18.x or higher (v20.x recommended)
- **Python**: 3.10+ (only required for audio transcription features)
- **npm**: v9.x or higher

### Required Accounts

- MongoDB Atlas account with cluster configured
- Vercel account
- Render account
- GitHub account

---

## Local Development Setup (Windows)

### 1. Clone the Repository

```powershell
git clone https://github.com/Magenta91/dimentia_detector.git
cd dimentia_detector
```

### 2. Backend Setup

```powershell
cd Backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your actual values:
# - MONGODB_URI: Your MongoDB Atlas connection string
# - JWT_SECRET: Generate a secure random string (32+ characters)
# - CORS_ORIGIN: http://localhost:5173,http://127.0.0.1:5173
```

**Generate JWT Secret (Windows PowerShell):**
```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### 3. MongoDB Atlas Setup

1. Log in to MongoDB Atlas
2. Select your cluster
3. Click "Connect" → "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your actual password
6. Add to `Backend/.env` as `MONGODB_URI`

**Initialize Database:**
```powershell
npm run database:init
npm run database:test
```

### 4. Frontend Setup

```powershell
cd ..\Frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Edit .env.local:
# VITE_API_URL=http://localhost:3001
```

### 5. Start Development Servers

**Terminal 1 - Backend:**
```powershell
cd Backend
npm start
```

**Terminal 2 - Frontend:**
```powershell
cd Frontend
npm run dev
```

Access the application:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/api/health

---

## Production Deployment

### Step 1: MongoDB Atlas Configuration

1. **Ensure database is initialized** with required collections and indexes
2. **Configure Network Access:**
   - Go to Network Access in MongoDB Atlas
   - Add `0.0.0.0/0` for development (allows all IPs)
   - For production, restrict to Render's IP ranges if possible
3. **Get connection string** for production

### Step 2: Deploy Backend to Render

#### Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository: `Magenta91/dimentia_detector`

#### Configure Service

**Basic Settings:**
- **Name**: `dimentia-detector-backend` (or your preferred name)
- **Region**: Choose closest to your users
- **Branch**: `main`
- **Root Directory**: `Backend`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Environment Variables** (Add in Render dashboard):

```
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
JWT_SECRET=your_generated_secure_secret_min_32_chars
CORS_ORIGIN=https://your-frontend-name.vercel.app
MINDSCAN_DEMO_MODE=false
PYTHON_EXECUTABLE=python3
```

**Important Notes:**
- Replace `MONGODB_URI` with your actual connection string
- Generate a new, secure `JWT_SECRET` for production
- Update `CORS_ORIGIN` with your actual Vercel domain (you'll get this after deploying frontend)
- The `PORT` value is provided by Render automatically

**Instance Type:**
- **Free tier**: Suitable for testing (spins down after inactivity)
- **Starter ($7/month)**: Recommended for production (always-on)

#### Python Support for Audio Features (Optional)

The core application works without Python. Audio transcription requires Python.

**Option A: Use Docker (Recommended for audio features)**

Create `Backend/Dockerfile`:

```dockerfile
FROM node:20-slim

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create Python virtual environment and install dependencies
RUN python3 -m venv .venv-audio && \
    .venv-audio/bin/pip install --no-cache-dir -r ml/requirements-audio.txt

ENV PYTHON_EXECUTABLE=/app/.venv-audio/bin/python

EXPOSE 10000

CMD ["npm", "start"]
```

Update Render settings:
- **Docker Command**: Leave empty (uses CMD from Dockerfile)

**Option B: Without audio features**

Audio upload endpoint will return error if Python is not available. Core cognitive assessment features work fine.

### Step 3: Deploy Frontend to Vercel

#### Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import `Magenta91/dimentia_detector`

#### Configure Project

**Framework Preset**: Vite

**Build Settings:**
- **Root Directory**: `Frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

**Environment Variables:**

```
VITE_API_URL=https://your-backend-name.onrender.com
```

**Important**: Replace with your actual Render backend URL (e.g., `https://dimentia-detector-backend.onrender.com`)

#### Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Note your Vercel URL (e.g., `https://your-app.vercel.app`)

### Step 4: Update CORS in Backend

1. Go back to Render dashboard
2. Navigate to your backend service
3. Update Environment Variable:
   ```
   CORS_ORIGIN=https://your-actual-frontend.vercel.app
   ```
4. Save changes (service will redeploy automatically)

---

## Post-Deployment Verification

### 1. Check Backend Health

```bash
curl https://your-backend-name.onrender.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "databaseName": "test"
}
```

### 2. Test Frontend

1. Open your Vercel URL in browser
2. Click "Register" and create a test account
3. Complete login
4. Start an assessment
5. Complete cognitive tasks
6. View results

### 3. Verify CORS

- Frontend should communicate with backend without CORS errors
- Check browser console (F12) for any errors

---

## Environment Variables Reference

### Backend (.env)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `development` or `production` |
| `PORT` | No | Server port | `3001` (local), Render sets automatically |
| `MONGODB_URI` | Yes | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `JWT_SECRET` | Yes (prod) | JWT signing secret (32+ chars) | `your_secure_random_string` |
| `CORS_ORIGIN` | Yes (prod) | Allowed frontend origins | `https://your-app.vercel.app` |
| `PYTHON_EXECUTABLE` | No | Python path for audio features | `python3` or `/path/to/python` |
| `MINDSCAN_DEMO_MODE` | No | Enable demo mode | `false` |
| `MINDSCAN_MODEL_DIR` | No | AI model directory | (leave empty if no model) |
| `MINDSCAN_MODEL_VERSION` | No | AI model version | (leave empty if no model) |
| `MINDSCAN_AUDIO_MODEL_DIR` | No | Audio model directory | (leave empty if no model) |

### Frontend (.env.local / Vercel)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | Yes | Backend API base URL | `http://localhost:3001` (local)<br>`https://backend.onrender.com` (prod) |

---

## Known Limitations

### AI Model Predictions

**Status**: ❌ Unavailable

The application is designed to work with AI models but currently **no trained model artifacts are included**. The application:

- ✅ Collects cognitive assessment data
- ✅ Calculates task scores
- ✅ Returns descriptive statistics
- ❌ Does NOT provide AI risk predictions

When model endpoints are called, the API returns:
```json
{
  "status": "unavailable",
  "code": "cognitive_model_unavailable",
  "reason": "No cognitive research model version is configured."
}
```

**This is correct and intentional.** Do not deploy fake predictions or unauthorized models.

### Audio Transcription

**Status**: ⚠️ Infrastructure present, not production-tested

The backend includes code for audio transcription using Whisper, but:
- Requires Python 3.10+ environment
- Downloads ~140MB model on first use
- Not tested in production deployment
- May timeout on slow networks
- Requires adequate memory (1GB+ recommended)

**Recommendation**: Test audio functionality in staging before enabling in production.

---

## Troubleshooting

### Frontend Build Fails

**Error**: `VITE_API_URL is required`

**Solution**: Ensure `VITE_API_URL` is set in Vercel environment variables

---

### Backend Won't Start

**Error**: `MONGODB_URI is required`

**Solution**: 
1. Verify MongoDB connection string is correct
2. Check MongoDB Atlas network access allows Render IPs
3. Verify database user has correct permissions

---

### CORS Errors in Browser

**Error**: `Access to fetch at ... has been blocked by CORS policy`

**Solution**:
1. Verify `CORS_ORIGIN` in Render exactly matches Vercel URL
2. Include protocol (`https://`) and do NOT include trailing slash
3. Redeploy backend after changing CORS settings

---

### Database Connection Timeout

**Error**: `Failed to connect to MongoDB`

**Solution**:
1. Check MongoDB Atlas network access settings
2. Verify connection string format
3. Ensure database user exists and has permissions
4. Check MongoDB Atlas cluster is running (not paused)

---

### Python Subprocess Errors

**Error**: `Python executable not found` or `Module not found`

**Solution**:
- If using Docker: Ensure Dockerfile installs Python and dependencies
- If not using Docker: Audio features won't work (core app still functions)
- Set `PYTHON_EXECUTABLE=python3` environment variable

---

## Monitoring and Logs

### Render Logs

1. Go to Render dashboard
2. Select your service
3. Click "Logs" tab
4. View real-time server logs

### Vercel Logs

1. Go to Vercel dashboard
2. Select your project
3. Click "Deployments" → Select deployment
4. View build and function logs

### MongoDB Atlas Monitoring

1. Go to MongoDB Atlas
2. Select cluster
3. Click "Metrics" tab
4. Monitor connections, operations, and performance

---

## Security Checklist

- [ ] Generated new JWT_SECRET for production (never reuse development secrets)
- [ ] MongoDB connection string uses strong password
- [ ] MongoDB network access configured (not wide open to 0.0.0.0/0 if possible)
- [ ] CORS_ORIGIN set to exact frontend domain
- [ ] No `.env` files committed to Git
- [ ] Environment variables set in hosting platforms (not in code)
- [ ] Reviewed .gitignore to exclude sensitive files

---

## Cost Estimates

### Free Tier (Testing)

- **MongoDB Atlas**: Free tier (512MB)
- **Vercel**: Free hobby plan
- **Render**: Free tier (spins down after inactivity)

**Total**: $0/month (suitable for development/testing only)

### Production Tier

- **MongoDB Atlas**: Shared M2 ($9/month) or M5 ($25/month)
- **Vercel**: Free hobby plan or Pro ($20/month)
- **Render**: Starter ($7/month) or Standard ($25/month)

**Minimum Production**: ~$16/month  
**Recommended Production**: ~$50-70/month

---

## Additional Resources

- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Vite Documentation](https://vitejs.dev/)
- [Express.js Documentation](https://expressjs.com/)

---

## Support

For issues specific to this application:
- Review the verification report: `docs/AI_WORKFLOW_VERIFICATION.md`
- Check GitHub issues
- Review application logs in Render/Vercel dashboards

For platform-specific issues:
- MongoDB Atlas: https://support.mongodb.com/
- Render: https://render.com/docs/support
- Vercel: https://vercel.com/support
