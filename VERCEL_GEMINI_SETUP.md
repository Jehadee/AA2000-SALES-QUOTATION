# Make AI (Gemini) work on Vercel

The AI assistant uses your **Gemini API key** at **build time**. Follow these steps so it works after deploy.

## 1. Do not put the key in code or in `.env` in the repo

- **Never** commit your API key. `.env` is gitignored.
- Add the key **only** in the Vercel project (see below).

## 2. Add the key in Vercel

1. Open [Vercel Dashboard](https://vercel.com) → your **AA2000-SALES-QUOTATION** project.
2. Go to **Settings** → **Environment Variables**.
3. Click **Add**:
   - **Key:** `GEMINI_API_KEY` (exactly this name).
   - **Value:** paste your Gemini API key (from [Google AI Studio](https://aistudio.google.com/apikey)).
   - **Environments:** enable **Production** (and **Preview** if you use it).
4. Save.

## 3. Redeploy so the key is baked in

1. Go to **Deployments**.
2. Open the **⋮** menu on the latest deployment → **Redeploy**.
3. If you see **“Use existing Build Cache”**, turn it **off** so a full build runs with the new env.
4. Wait for the build to finish.

## 4. Test

Open your Vercel URL and use the AI chat. It should respond. If you still see the “AI assistant is not configured” message, the key was not available during the last build—repeat step 2 and 3 and ensure the variable name is exactly `GEMINI_API_KEY`.
