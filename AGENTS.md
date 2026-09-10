# Zawaago Autoposter — Agent Guide

This repository is the Zawaago AI Autoposter application. Do not reintroduce the original Cloudflare AI Brand Visibility template or its AEO/brand-mention testing concepts.

## Current scope
- AI social caption generation for Zawaago and InnoTech
- Facebook text publishing using a Page access token
- Facebook image publishing using a public image URL
- Cloudflare Workers + Hono + React Router
- Workers AI for caption/image generation

## Testing Facebook publishing
Text posts use `POST /api/autoposter/post-now` and the Facebook Graph API `/me/feed` with the configured Page access token. Image posts use `/me/photos` with a public image URL.

## Important
- Never commit Facebook access tokens or other secrets.
- Keep Facebook Graph API version centralized in `workers/api.ts` until production configuration is introduced.
- Do not call an image data URL as Facebook's `url` parameter; image publishing requires a publicly fetchable image URL in the current test implementation.
- Production work will add authentication, D1 persistence, R2 media storage, scheduling, queues, retries, idempotency, audit logs and multi-platform adapters.
