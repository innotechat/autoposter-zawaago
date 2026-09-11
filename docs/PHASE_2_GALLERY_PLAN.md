# Phase 2 — Persistent Image Gallery & Asset Management

## Objective
Turn generated images into durable, reusable content assets stored in Cloudflare R2, with a gallery-ready API contract and clean separation between generation, storage, review, and publishing.

## Current baseline
- Cloudflare Workers AI image generation is enabled.
- R2 bucket `zawaago-autoposter-assets` is configured as `ASSETS`.
- Generated images can be persisted to R2 and served through `/api/autoposter/assets/...`.
- Facebook publishing is page-specific and security-hardened.
- CI typecheck/build verification is green.

## Phase 2A implementation order
1. Asset metadata contract
2. R2 listing endpoint with safe pagination
3. Asset retrieval endpoint
4. Asset deletion endpoint with strict key validation
5. Gallery UI with page/brand filtering
6. Reuse selected asset in composer
7. Preserve generation metadata for future D1 migration

## Security invariants
- Never expose Facebook access tokens in asset APIs.
- R2 keys are server-generated; clients cannot write arbitrary object keys.
- Asset routes must reject path traversal and invalid keys.
- Delete must only operate inside the configured generated asset namespace.
- Gallery metadata must not trust arbitrary client-supplied brand/page values.
- Publishing continues to use the selected Page's dedicated token only.

## Metadata model (D1-ready)
```text
asset_id
brand
page_name
content_type
mime_type
storage_key
public_url
width
height
aspect_ratio
prompt_hash
created_at
status
source
```

`source` values should distinguish generated assets from future uploads/imports.

## Acceptance criteria
- Generated image remains available after a Worker restart/redeploy.
- Gallery can list persisted assets without downloading the binary files.
- Selecting an existing asset loads it into the composer.
- Deleting an asset removes the R2 object and removes it from gallery results.
- Invalid asset keys return a safe 4xx response.
- No access token is returned by any gallery/asset endpoint.
- Existing generation and Facebook publishing flows remain functional.
- CI typecheck and production build remain green.

## Next after 2A
Add D1 metadata persistence and Post History. The R2 layer should remain the binary source of truth while D1 becomes the searchable metadata and workflow source of truth.
