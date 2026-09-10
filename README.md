# Zawaago AI Autoposter

AI-assisted social content generation and Facebook publishing for Zawaago and InnoTech.

## Current testing scope

- Generate branded social captions with Workers AI
- Select Zawaago or InnoTech
- Select content type and tone
- Preview/edit generated caption
- Publish text posts to Facebook using a Page access token via `/me/feed`
- Publish image posts via `/me/photos` using a publicly accessible image URL
- System health endpoint

## Stack

- React 19 + React Router 7
- Hono on Cloudflare Workers
- Cloudflare Workers AI
- TypeScript
- Wrangler

## Local development

```bash
npm install
npm run dev
```

## Build and deploy

```bash
npm run typecheck
npm run build
npm run deploy
```

## Cloudflare variables

Configure these as Worker secrets/variables; never commit real values:

- `FB_TOKEN` — Facebook Page access token used for testing
- `PAGE_ID_ZAWAAGO` — Zawaago Facebook Page ID
- `PAGE_ID_INNOTECH` — InnoTech Facebook Page ID

## Facebook test endpoints

### Text
`POST /api/autoposter/post-now`

```json
{
  "page": "Zawaago",
  "caption": "Test post from Zawaago Autoposter",
  "withImage": false
}
```

The current testing implementation posts to Graph API `v20.0/me/feed` using the configured Page access token.

### Image

```json
{
  "page": "Zawaago",
  "caption": "Test image post",
  "imageUrl": "https://example.com/public-image.jpg",
  "withImage": true
}
```

The current testing implementation posts to `v20.0/me/photos`. The image URL must be publicly fetchable by Facebook; browser-only/data URLs are not suitable for this test path.

## Production roadmap

1. Stabilize and verify Facebook publishing.
2. Remove remaining unused template files/dependencies.
3. Add authentication and authorization.
4. Add D1 for content, schedules, accounts, publish attempts and audit history.
5. Add R2 for generated media.
6. Add scheduled publishing with Cron + Queue.
7. Add retries, idempotency and failure recovery.
8. Add platform adapters for Instagram, LinkedIn and X.
9. Add content calendar, analytics and approval workflow.
10. Add monitoring, rate limits, tests and production security hardening.
