# Nesting at scale: timeouts, proxies, and large part counts

This document applies to **Keystone PMS** + **NestNow** server mode.

## HTTP timeouts and routing

| Path | What limits duration |
|------|----------------------|
| **Direct NestNow** (browser → `http://127.0.0.1:3001`) | NestNow only: per-request cap from the JSON body `requestTimeoutMs` (and NestNow env defaults). No Next.js hop. **Prefer this for long runs on your own machine.** |
| **`/api/nest` proxy** | Next.js route [`app/api/nest/route.ts`](../app/api/nest/route.ts) uses `maxDuration = 3600` where the host honors it, **and** whatever sits in front (CDN, load balancer, PaaS) may still enforce a **shorter read timeout** (often ~60s). |

If failures cluster around **~60 seconds** while NestNow logs show the job was still running, raise the **reverse-proxy read timeout** for the upstream that serves `/api/nest`, or use **Direct NestNow** for heavy jobs.

`NESTNOW_URL` in `.env.local` is only used by the **server** when Keystone calls NestNow from `/api/nest`; it does not change the browser’s direct URL.

## NestNow response extras (integrations)

- **`candidates`**: Up to **K** distinct layouts from one genetic search, sorted by fitness (lower is better). **K** defaults to **5**, max **20**, via NestNow env **`NESTNOW_TOP_K`**.
- **`GET /progress`**: While `POST /nest` runs, includes genetic search fields under `ga` and, when the search improves, **`bestSoFar`** (same shape as the placement portion of a successful `/nest` body). Keystone polls this for live preview.

Other NestNow env vars: see **SERVER.md** and **BENCHMARK.md** in the NestNow repository (same machine as this project or your fork).

## Very large jobs (e.g. hundreds of parts)

- **Work grows quickly** with part count and outline complexity (NFP-style preparation is much heavier than “one rectangle per part”).
- **JSON body size**: Extremely detailed outlines × hundreds of parts can produce **multi-megabyte** requests. Some serverless platforms cap request body size; if you hit limits, simplify geometry, compress at the transport layer, or split jobs.
- **Practical mitigations**: Use **Preview**-style settings first; enable **simplify** and tune **curve tolerance**; reduce **rotations** and genetic **population / generations**; split into **multiple nests** by material or batch.

To **estimate** JSON size for a synthetic job, run from the Keystone repo:

```bash
node scripts/estimate-nest-payload-size.mjs
node scripts/estimate-nest-payload-size.mjs 400 8
```

Arguments: `partCount` (default 400), `verticesPerOutline` (default 8). The script prints approximate UTF-8 byte size for a minimal valid nest payload.
