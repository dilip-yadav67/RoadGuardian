# SadakSaathi – Road Damage Reporting Portal
React (Vite) + Express + MongoDB. Features: login (JWT), photo upload, GPS + map pin (OpenStreetMap), Hindi/English toggle, staff status updates.

## Local run
1. `cd server && cp .env.example .env` (fill values) → `npm install` → `npm run dev`
2. `cd client && cp .env.example .env` → `npm install` → `npm run dev`  (opens on http://localhost:5173)

## Deploy (free tiers)
1. **MongoDB Atlas**: create a free cluster, add a database user, Network Access → allow `0.0.0.0/0`, copy the connection string.
2. **GitHub**: push this folder as one repo.
3. **Backend on Render**: New → Web Service → pick the repo.
   Root Directory `server`, Build `npm install`, Start `npm start`.
   Env vars: `MONGO_URI`, `JWT_SECRET` (long random text), `ADMIN_EMAIL` (your email), `CLIENT_URL` (add after step 4).
   Check `https://YOUR-API.onrender.com/api/health`.
4. **Frontend on Vercel**: New Project → same repo, Root Directory `client`, Framework Vite.
   Env var: `VITE_API_URL=https://YOUR-API.onrender.com` → Deploy.
5. Go back to Render and set `CLIENT_URL` to your Vercel URL, then redeploy.
6. Register on the live site with the `ADMIN_EMAIL` address – that account gets staff (admin) powers.

Note: Render's free plan sleeps after inactivity, so the first request can take ~30–50 seconds.
