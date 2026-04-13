<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/dabb6d3d-3ba6-4abc-b436-4a0c3001fc01

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set your variables (see [Deploy to Vercel](#deploy-to-vercel) for required env vars).
3. Run the app: `npm run dev`

## Deploy to Vercel

1. Push your repo to GitHub and import the project in [Vercel](https://vercel.com).
2. Vercel will detect Vite; build command `npm run build` and output `dist` are set in `vercel.json`.
3. In the Vercel project **Settings → Environment Variables**, add:

   | Name | Value | Notes |
   |------|--------|--------|
   | `VITE_API_BASE_URL` | Your backend URL (e.g. `https://your-api.vercel.app` or devtunnels URL) | Required for customers & products API |
   | `VITE_API_BASE_PATH` | `/api` or leave empty | Optional; used for products path |
   | `GEMINI_API_KEY` | Your Gemini API key | Required for AI assistant |

   Optional overrides if your backend uses different paths:
   - `VITE_ADD_CUSTOMER_PATH` — e.g. `/customers/add/customer`
   - `VITE_PRODUCTS_PATH` — e.g. `/api/get/products`

4. Redeploy. The app is a static SPA; all routes rewrite to `index.html` for client-side routing.

### AI assistant not working on Vercel?

The Gemini API key is **baked in at build time**. If the AI chat fails or does nothing on Vercel:

1. Open your project on [Vercel Dashboard](https://vercel.com) → **Settings** → **Environment Variables**.
2. Add a variable:
   - **Name:** `GEMINI_API_KEY` (exactly, no `VITE_` prefix)
   - **Value:** your [Google AI Studio](https://aistudio.google.com/apikey) API key
   - **Environment:** check Production (and Preview if you use preview deployments).
3. **Redeploy:** go to **Deployments** → ⋮ on the latest deployment → **Redeploy**.  
   Do not “Use existing Build Cache”; the new build must run so the key is inlined.
4. Wait for the deploy to finish and open the app again. The AI should respond.

If it still fails, open the browser console (F12) on the Vercel URL and check for errors mentioning “API key” or “403”.

### GitHub push note

If `git push` shows `Everything up-to-date`, there are no new committed file changes yet. Run `git status` first, then commit your edits before pushing.
