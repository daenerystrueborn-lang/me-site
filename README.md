# Mockingbird

The profile is a static page. The recommendations inbox uses a same-origin Vercel Function (`api/recs.js`) backed by Redis.

## Enable owner unlock

1. Deploy the repository root to Vercel so it serves both `index.html` and `/api/recs`. Uploading only the HTML or using a static file server won't run the function.
2. In the project's **Settings → Environment Variables**, set `ADMIN_PASSWORD` and a Redis REST URL/token pair: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Use a read/write token. Keep these values server-side.
3. Apply the settings to the environment you're using (Preview or Production) and redeploy. Tap the profile picture three times, then enter your admin password to open the inbox.

For local development, run `vercel dev` with the same environment variables set and a development Redis database. A `401` from `/api/recs` without a password is expected; a `404` means the function isn't deployed, and a `503` with `server not configured` means a required setting is missing.
