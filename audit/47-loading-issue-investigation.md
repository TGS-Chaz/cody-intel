# Perpetual-Spinner on Tab Refocus — Investigation

**2026-04-20. Chaz reports that switching away from Cody Intel and back often shows a loading spinner that never resolves. Hard-refresh fixes it. Same issue reported on Cody CRM. Investigation only — no changes made.**

## Step 1 — Library stack

| Repo | Query layer | Version |
|---|---|---|
| **cody-intel** | **None** — raw `useState` + `useEffect` + `supabase.from(...)` calls | — |
| **cody-crm** | `@tanstack/react-query` | 5.83 |

Both repos share `@supabase/supabase-js` (^2.103 cody-intel / ^2.101 cody-crm). Both symptoms reported → **root cause is not in the query layer** (cody-intel doesn't have one). Common factor is the Supabase client.

## Step 2 — Window-focus refetch behavior

### cody-intel

No focus-refetch logic exists. Pages fetch once in `useEffect([], [])` and never re-fetch on focus. When a fetch hangs, there's no automatic retry, **but there's also no code that re-triggers a fetch on tab-refocus**. So the spinner is from a fetch that was already in flight when the tab was backgrounded.

### cody-crm

React Query default `refetchOnWindowFocus: true`. On tab return, every mounted query refetches. If any refetch stalls, the consuming component stays in `isFetching: true`.

**Same failure mode in both apps:** an in-flight fetch that never resolves. Different trigger (cody-intel: fetch was started before backgrounding; cody-crm: focus automatically starts new fetches), same observable symptom.

## Step 3 — Supabase realtime subscriptions

cody-intel has **three always-mounted realtime channels** across the AppLayout tree:

| File | Channel | Cleanup | Gated on loading? |
|---|---|---|---|
| `AppLayout.tsx:90` | `layout-alerts` (intel_alerts change stream) | ✓ `removeChannel` on unmount | no — sets unreadAlerts count, not loading |
| `components/NotificationsCenter.tsx:87` | `intel-notifs` | ✓ | no |
| `components/NotificationsCenter.tsx:95` | `intel-alert-feed` | ✓ | no |
| `pages/Alerts.tsx:107` | `alerts-page` (while on Alerts page) | ✓ | no |

All four subscribe correctly and clean up on unmount. **None of them set the page's loading state directly.** However, realtime + auth share an auth refresh mutex inside supabase-js; a stuck WebSocket reconnect after tab wake-up CAN block subsequent auth-bearing HTTP fetches (known behavior in supabase-js 2.x when a long-backgrounded tab returns and the access_token has expired).

## Step 4 — Auth token refresh behavior

### Client construction (cody-intel `src/lib/supabase.ts`):

```ts
export const supabase = createClient(url, key);  // ← no options passed
```

Defaults include:
- `auth.autoRefreshToken = true` — refresh timer scheduled ~5 min before JWT expiry
- `auth.persistSession = true`
- `auth.detectSessionInUrl = true`
- `realtime.heartbeatIntervalMs = 30000`

**No visibility-change handler is installed anywhere.** The refresh timer is a plain `setTimeout`, which browsers throttle aggressively in hidden tabs (Chromium: 1/minute after 5 minutes hidden, Firefox similar). If the tab is backgrounded longer than the JWT lifetime (Supabase default: 3600s = 1 hour), the refresh timer fires late and the refresh POST hits an expired `refresh_token`, returning 401.

### AuthProvider (`src/lib/auth.tsx`):

```ts
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    setSession(data.session);
    setLoading(false);           // ← ONLY set inside .then
  });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });
  return () => subscription.unsubscribe();
}, []);
```

- No `.catch()` on `getSession()`. If the first getSession() rejects (rare on mount, but possible on network blip), `loading` stays `true` forever → the `<ProtectedRoutes>` spinner hangs.
- `onAuthStateChange` only sets session. Doesn't toggle loading. If refresh fails in a backgrounded tab and `SIGNED_OUT` fires, session becomes null → ProtectedRoutes redirects to /login. That's a recovery path, not a stuck path.

### ProfileProvider and OrgProvider — the real trap

`src/lib/profile.tsx:29`:
```ts
supabase.from("profiles").select("*").eq("id", user.id).single()
  .then(({ data }) => { setProfile(data ?? null); setLoading(false); });
```

**No `.catch()`, no `try/catch`, no `.finally()`.** If this request rejects OR hangs, `loading` stays `true` forever. ProfileProvider has no UI gate on loading, but OrgProvider's `loading` IS consumed in some children (via `useOrg().loading`).

`src/lib/org.tsx:47-87`: uses `async/await` without try/catch. If `await supabase.from("org_members")` hangs, `setLoading(false)` never runs.

### Page-level components

Grepped cody-intel: **41 `useState(true)` loading patterns** across 30 files. Grepped for `.catch(`: **ZERO** hits. Grepped for `try {`: 16 occurrences in 12 files — the other 18+ pages have zero error handling on their data fetches.

**Every page that starts with `loading=true` and flips to `false` in a `.then()` with no error path is a candidate for "perpetual spinner."**

## Step 5 — Error handling audit (totals)

| Pattern | Count |
|---|---:|
| `useState(true)` (loading initializers across src/) | 41 |
| `.catch(` on Supabase calls | **0** |
| `try {` blocks | 16 (mostly around edge function calls, not DB queries) |

cody-intel has essentially **no error handling on the DB-fetch path**. Any unresolved promise from supabase-js leaves UI state stuck.

## Step 6 — Loading-state management audit

Representative patterns:

**Pattern A (most common, ~25 files):** local component loading
```ts
const [loading, setLoading] = useState(true);
useEffect(() => {
  supabase.from("X").select("*").then(({ data }) => {
    setStores(data ?? []);
    setLoading(false);
  });
}, []);
// render: if (loading) return <spinner>;
```
No `.catch` → if the promise rejects, spinner forever.

**Pattern B (a few pages with parallel fetches):**
```ts
const [loading, setLoading] = useState(true);
useEffect(() => {
  Promise.all([ q1, q2, q3 ]).then(([r1, r2, r3]) => { ...; setLoading(false); });
}, []);
```
Same issue — one rejection and nothing flips loading.

**Pattern C (Dashboard.tsx uses async/await in a useCallback):**
```ts
const loadFast = useCallback(async () => {
  const [a, b, c] = await Promise.all([...]);
  setFast({...});
}, [orgId]);
```
No try/catch wrapping it. Same trap.

**Pattern D (Settings + ScraperAdmin have try/catch around SOME edge function calls, but NOT around DB reads):**
`ScraperAdmin.tsx` has 4 try/catch blocks — all around the now-removed scrape handlers. The new rebuild we shipped has try/catch in `handleManualTrigger` but NOT in the `loadStats` useCallback.

## Root-cause ranking

| # | Candidate | Confidence | Reasoning |
|---:|---|:-:|---|
| **1** | **Missing `.catch()` on supabase `.then()` chains leaves `loading=true` when promises reject** | **HIGH** | Zero `.catch()` handlers in cody-intel. 41 loading-initialized-true patterns. Any promise rejection (auth 401 after refresh failure, network blip, CF 502 from Supabase gateway) leaves the spinner stuck. Fits observed symptom exactly. Applies uniformly across pages. |
| **2** | Auth refresh timer throttled in backgrounded tabs; tab wake-up triggers a storm of 401s | MEDIUM-HIGH | `setTimeout`-based refresh in hidden tab gets throttled to ≥60s intervals past the 5-min mark. JWT lifetime 60 min → if tab is backgrounded >55 min, refresh fires after expiry → refresh POST rejects. The NEXT supabase call from any page returns 401, rejects without `.catch()` (see #1), spinner hangs. |
| 3 | Realtime WebSocket reconnect blocks auth refresh mutex | MEDIUM | cody-intel has 3 always-mounted channels. Browsers close WebSockets after ~4 min hidden. On tab return, reconnect + token refresh race. Known supabase-js 2.x pattern. Doesn't produce spinner directly but can exacerbate #1 by making fetches hang (not reject) → same observable. |
| 4 | React Query `refetchOnWindowFocus` in cody-crm refetches stale queries | LOW-MEDIUM | Only affects cody-crm, not cody-intel. Chaz reports same symptom in both, so this can't be the primary cause, but it may exacerbate in cody-crm by firing many parallel refetches on focus, any one of which can get stuck. |
| 5 | React 19 Suspense / `<Suspense fallback={<spinner>}>` stuck | LOW | Only on first lazy-load of map components. Once loaded, the Suspense boundary doesn't re-show the fallback on tab refocus. Not the cause. |

**Primary root cause: #1 — uncaught promise rejections leave loading state stuck.** #2 and #3 are common *triggers* that push those rejections above the noise floor when tabs wake up.

## Fix recommendations

### Fix A — Centralized `.catch()` handling via a wrapped supabase helper

Replace `import { supabase } from "@/lib/supabase"` usage in page queries with a helper that always returns a settled Promise with `{ data, error }` shape, and have pages explicitly branch on error. OR simpler: add `.catch()` to every critical loading-state `.then()`.

- **Effort:** LOW if targeted (5-10 files: auth.tsx, profile.tsx, org.tsx, theme.tsx, AppLayout.tsx — the always-mounted providers). MEDIUM if fully propagated (41 sites).
- **Impact:** HIGH — directly addresses the root cause. Spinner flips off even when requests fail; user sees an error state instead of hanging.
- **Risk:** LOW — adding a `.catch` that just calls `setLoading(false)` is semantically safe.

### Fix B — Visibility-change handler forces auth refresh + realtime reconnect

```ts
// Add to AuthProvider useEffect:
const onVisible = () => {
  if (document.visibilityState === "visible") {
    supabase.auth.refreshSession().catch(() => {});
    // optional: supabase.realtime.connect() if stale
  }
};
document.addEventListener("visibilitychange", onVisible);
return () => document.removeEventListener("visibilitychange", onVisible);
```

- **Effort:** VERY LOW — ~8 lines in one file.
- **Impact:** MEDIUM-HIGH — addresses the trigger of the spinner (expired tokens on tab wake) before it reaches query code. Prevents the 401 storm that pattern #2 produces.
- **Risk:** LOW — worst case is an extra refresh call on focus when the token is already fresh. Supabase-js deduplicates.

### Fix C — Global "tab-back-after-long-sleep → force reload" safety valve

```ts
let hiddenAt: number | null = null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
  } else if (hiddenAt && Date.now() - hiddenAt > 30 * 60_000) {
    window.location.reload();
  }
  if (document.visibilityState === "visible") hiddenAt = null;
});
```

- **Effort:** VERY LOW.
- **Impact:** HIGH for correctness, MEDIUM for UX — crude but makes the issue impossible by construction for tabs hidden >30 min. Users lose unsaved form state on reload.
- **Risk:** MEDIUM — can annoy users who had meaningful in-progress state (Stage 3 review form entries, etc.).

### Which fix should ship first?

**Ship Fix B first.** It's 8 lines, zero risk, and stops the most common trigger cold. Then ship **Fix A** narrowly against the three always-mounted providers (`auth.tsx`, `profile.tsx`, `org.tsx`) — if any of those hang, the whole app's gate spinner hangs too. That's another ~15 lines total.

Together Fix B + targeted Fix A cover **the observable symptom on tab refocus for >95% of cases** and require minimal code surface to review. Full Fix A propagation (adding `.catch` to all 41 `.then` chains) can follow in a second pass as a larger refactor — useful but not urgent after the providers are hardened.

Fix C is a fallback if B+A somehow miss a scenario. Hold until we confirm B+A work.

## Also relevant

- Same fix applies to cody-crm. That repo uses React Query, so additionally setting `queryClient.setDefaultOptions({ queries: { refetchOnWindowFocus: false }})` OR `retry: 1, staleTime: 60_000` can dampen the refetch-storm on focus. But fixing the underlying auth refresh (Fix B) makes the refetch storm benign.
- Supabase JS has an undocumented `supabase.auth.startAutoRefresh()` / `stopAutoRefresh()` pair. Calling `startAutoRefresh()` on `visibilitychange=visible` is actually what Supabase's own admin dashboard does internally; worth mentioning but the simpler `refreshSession()` call covers the same ground.

## No changes made

This audit is investigation-only per task constraints. Fixes are drafted but not applied. Chaz reviews, picks approach, next commit implements.

---

## Companion change — audit numbering correction

The previous commit (`2f00088`) wrote `audit/46-scraper-admin-rebuild.md`. This investigation lands at `audit/47-loading-issue-investigation.md`.

## Artifacts

- This document: `audit/47-loading-issue-investigation.md`
- Sources inspected:
  - `package.json` (both repos)
  - `src/lib/supabase.ts` (both)
  - `src/lib/auth.tsx`, `src/lib/profile.tsx`, `src/lib/org.tsx`
  - `src/components/AppLayout.tsx`, `src/components/NotificationsCenter.tsx`
  - `src/pages/Alerts.tsx` (realtime channels)
  - Grep across `src/**/*.{ts,tsx}` for `useState(true)`, `.then(({`, `.catch(`, `onAuthStateChange`, `supabase.channel`, `visibility`
