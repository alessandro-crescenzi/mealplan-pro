# Meal Plan Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each person own a meal plan and share it with other people at `view` or `edit` permission, replacing the app's current single-shared-plan model.

**Architecture:** Plans move from a single global KV slot to one slot per `(ownerEmail, weekStart)` pair. A new pair of KV indexes (`shares:{owner}` / `shared-with:{grantee}`) records who has access to whose plan and at what permission; every plan-mutating or plan-reading endpoint resolves the caller's identity from the Cloudflare Access header already present on every request and checks it against these indexes before acting. The frontend adds an owner switcher (whose plan am I looking at) and a share-management modal (who can see mine), and renders read-only when the caller only has `view`.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Cloudflare KV, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-meal-plan-sharing-design.md`

## Global Constraints

- The `dishes` recipe catalog stays a single global KV key shared by everyone — it does not become per-owner.
- Only a plan's owner manages its share list. A grantee with `edit` permission may modify the plan's contents but cannot add, change, or remove shares.
- Sharing targets are entered as free-text email addresses — no user directory, no picker backed by a list of known accounts.
- `Cf-Access-Authenticated-User-Email` is already reliably present on every request in production (Cloudflare Access is enforced site-wide) — a missing header is only handled as a 401, never worked around with a fallback identity.
- KV is eventually consistent with no transactions; `shares:{owner}` and `shared-with:{grantee}` are updated as two sequential writes in the same handler with no reconciliation job — acceptable at this app's family/friends scale per the spec.
- `ownerEmail` is optional on every plan request; when omitted the backend defaults it to the requester's own email, so existing "my own plan" behavior needs no explicit `ownerEmail` on the frontend.

## Review Focus

- Missing `Cf-Access-Authenticated-User-Email` header on any plan or sharing endpoint returns 401, not a crash or a silently-anonymous write.
- A requester with only `view` permission calling `POST /api/plan/generate` or `POST /api/plan/swap` gets 403 — the read/write permission split is the entire point of the feature and easy to get half-wired.
- Sharing with the same `granteeEmail` twice updates the existing entry in place (in both `shares:{owner}` and `shared-with:{grantee}`) instead of appending a duplicate.
- Revoking a share removes the entry from both `shares:{owner}` and `shared-with:{grantee}` — a handler that only updates one index leaves the reverse lookup stale.
- Two different owners generating a plan for the same `weekStart` never collide — each is stored under its own `plan:{ownerEmail}:{weekStart}` key.

---

### Task 1: Backend — sharing data model and endpoints

**Files:**
- Modify: `frontend/functions/api/[[path]].ts`
- Test: `frontend/functions/api/index.spec.ts`

**Interfaces:**
- Produces: `type Permission = "view" | "edit"`, `interface ShareEntry { granteeEmail: string; permission: Permission }`, `interface IncomingShare { ownerEmail: string; permission: Permission }`, `function unauthorized(): Response`, `async function getShares(env: Env, ownerEmail: string): Promise<ShareEntry[]>`, `async function saveShares(env: Env, ownerEmail: string, shares: ShareEntry[]): Promise<void>`, `async function getSharedWith(env: Env, granteeEmail: string): Promise<IncomingShare[]>`, `async function saveSharedWith(env: Env, granteeEmail: string, incoming: IncomingShare[]): Promise<void>`, `async function resolveAccess(env: Env, requesterEmail: string, ownerEmail: string, required: Permission): Promise<boolean>` — all consumed by Task 2 and by the routes added here.

- [ ] **Step 1: Write the failing tests for the four new sharing endpoints**

Add to `frontend/functions/api/index.spec.ts`, right before the final `});` that closes the `describe` block:

```ts
	it("POST /api/shares requires authentication", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ granteeEmail: "friend@example.com", permission: "view" }),
			}),
			env,
		);
		expect(res.status).toBe(401);
	});

	it("POST /api/shares rejects sharing with yourself", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ granteeEmail: "owner@example.com", permission: "view" }),
			}),
			env,
		);
		expect(res.status).toBe(400);
	});

	it("POST /api/shares adds a share visible via GET /api/shares and GET /api/shared-with-me", async () => {
		const env = makeEnv();
		const shareRes = await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ granteeEmail: "friend@example.com", permission: "view" }),
			}),
			env,
		);
		expect(shareRes.status).toBe(201);

		const ownerShares = await handleRequest(
			new Request("http://example.com/api/shares", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect(await ownerShares.json()).toEqual([{ granteeEmail: "friend@example.com", permission: "view" }]);

		const granteeIncoming = await handleRequest(
			new Request("http://example.com/api/shared-with-me", {
				headers: { "Cf-Access-Authenticated-User-Email": "friend@example.com" },
			}),
			env,
		);
		expect(await granteeIncoming.json()).toEqual([{ ownerEmail: "owner@example.com", permission: "view" }]);
	});

	it("POST /api/shares called twice for the same grantee updates the permission instead of duplicating it", async () => {
		const env = makeEnv();
		const headers = {
			"Content-Type": "application/json",
			"Cf-Access-Authenticated-User-Email": "owner@example.com",
		};
		await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers,
				body: JSON.stringify({ granteeEmail: "friend@example.com", permission: "view" }),
			}),
			env,
		);
		await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers,
				body: JSON.stringify({ granteeEmail: "friend@example.com", permission: "edit" }),
			}),
			env,
		);

		const ownerShares = await handleRequest(
			new Request("http://example.com/api/shares", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect(await ownerShares.json()).toEqual([{ granteeEmail: "friend@example.com", permission: "edit" }]);

		const granteeIncoming = await handleRequest(
			new Request("http://example.com/api/shared-with-me", {
				headers: { "Cf-Access-Authenticated-User-Email": "friend@example.com" },
			}),
			env,
		);
		expect(await granteeIncoming.json()).toEqual([{ ownerEmail: "owner@example.com", permission: "edit" }]);
	});

	it("DELETE /api/shares/:granteeEmail revokes access from both the owner's and grantee's indexes", async () => {
		const env = makeEnv();
		const headers = {
			"Content-Type": "application/json",
			"Cf-Access-Authenticated-User-Email": "owner@example.com",
		};
		await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers,
				body: JSON.stringify({ granteeEmail: "friend@example.com", permission: "edit" }),
			}),
			env,
		);

		const deleteRes = await handleRequest(
			new Request("http://example.com/api/shares/friend%40example.com", {
				method: "DELETE",
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect(deleteRes.status).toBe(200);

		const ownerShares = await handleRequest(
			new Request("http://example.com/api/shares", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect(await ownerShares.json()).toEqual([]);

		const granteeIncoming = await handleRequest(
			new Request("http://example.com/api/shared-with-me", {
				headers: { "Cf-Access-Authenticated-User-Email": "friend@example.com" },
			}),
			env,
		);
		expect(await granteeIncoming.json()).toEqual([]);
	});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd frontend && npx vitest run` (from repo root; all remaining commands in this plan assume `frontend/` as the working directory unless stated otherwise)
Expected: FAIL — `/api/shares`, `/api/shared-with-me` return 404 (routes don't exist yet).

- [ ] **Step 3: Add the sharing types and KV key helpers**

In `frontend/functions/api/[[path]].ts`, change:

```ts
type MealSlot = "pranzo" | "cena";

interface PlanDay {
```

to:

```ts
type MealSlot = "pranzo" | "cena";
type Permission = "view" | "edit";

interface PlanDay {
```

Then, right after the `interface Plan { weekStart: string; days: PlanDay[]; }` block, add:

```ts
interface ShareEntry {
	granteeEmail: string;
	permission: Permission;
}

interface IncomingShare {
	ownerEmail: string;
	permission: Permission;
}
```

Then change:

```ts
const DISHES_KEY = "dishes";
const PLAN_KEY_PREFIX = "plan:";

function planKey(weekStart: string): string {
	return `${PLAN_KEY_PREFIX}${weekStart}`;
}
```

to:

```ts
const DISHES_KEY = "dishes";

function planKey(ownerEmail: string, weekStart: string): string {
	return `plan:${ownerEmail}:${weekStart}`;
}

function sharesKey(ownerEmail: string): string {
	return `shares:${ownerEmail}`;
}

function sharedWithKey(granteeEmail: string): string {
	return `shared-with:${granteeEmail}`;
}
```

(Task 2 updates `getPlan`/`savePlan` to match the new two-argument `planKey` — this step only changes the key helpers and types.)

- [ ] **Step 4: Add the `unauthorized` helper and the sharing storage/authorization functions**

In `frontend/functions/api/[[path]].ts`, change:

```ts
function getAuthenticatedEmail(request: Request): string | null {
	return request.headers.get("Cf-Access-Authenticated-User-Email");
}

function canDeleteDishes(request: Request, env: Env): boolean {
```

to:

```ts
function getAuthenticatedEmail(request: Request): string | null {
	return request.headers.get("Cf-Access-Authenticated-User-Email");
}

function unauthorized(): Response {
	return json({ error: "Autenticazione mancante." }, { status: 401 });
}

function canDeleteDishes(request: Request, env: Env): boolean {
```

Then, right after the existing `savePlan` function (it will be updated to take `ownerEmail` in Task 2 — leave it alone here), add:

```ts
async function getShares(env: Env, ownerEmail: string): Promise<ShareEntry[]> {
	const raw = await env.MEALPLAN_KV.get(sharesKey(ownerEmail));
	return raw ? JSON.parse(raw) : [];
}

async function saveShares(env: Env, ownerEmail: string, shares: ShareEntry[]): Promise<void> {
	await env.MEALPLAN_KV.put(sharesKey(ownerEmail), JSON.stringify(shares));
}

async function getSharedWith(env: Env, granteeEmail: string): Promise<IncomingShare[]> {
	const raw = await env.MEALPLAN_KV.get(sharedWithKey(granteeEmail));
	return raw ? JSON.parse(raw) : [];
}

async function saveSharedWith(env: Env, granteeEmail: string, incoming: IncomingShare[]): Promise<void> {
	await env.MEALPLAN_KV.put(sharedWithKey(granteeEmail), JSON.stringify(incoming));
}

function permissionCovers(granted: Permission, required: Permission): boolean {
	if (granted === "edit") return true;
	return required === "view";
}

async function resolveAccess(
	env: Env,
	requesterEmail: string,
	ownerEmail: string,
	required: Permission,
): Promise<boolean> {
	if (requesterEmail === ownerEmail) return true;
	const incoming = await getSharedWith(env, requesterEmail);
	const entry = incoming.find((s) => s.ownerEmail === ownerEmail);
	if (!entry) return false;
	return permissionCovers(entry.permission, required);
}
```

- [ ] **Step 5: Add the four sharing HTTP handlers**

In `frontend/functions/api/[[path]].ts`, right after `handleSwapDish` and before `export async function handleRequest`, add:

```ts
async function handleGetShares(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const shares = await getShares(env, requesterEmail);
	return json(shares);
}

async function handlePostShare(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const body = (await request.json().catch(() => null)) as { granteeEmail?: string; permission?: string } | null;
	if (!body || !body.granteeEmail || (body.permission !== "view" && body.permission !== "edit")) {
		return json({ error: "Servono 'granteeEmail' e 'permission' ('view' o 'edit')." }, { status: 400 });
	}
	if (body.granteeEmail === requesterEmail) {
		return json({ error: "Non puoi condividere il piano con te stesso." }, { status: 400 });
	}
	const granteeEmail = body.granteeEmail;
	const permission = body.permission;

	const shares = await getShares(env, requesterEmail);
	const shareIndex = shares.findIndex((s) => s.granteeEmail === granteeEmail);
	if (shareIndex === -1) {
		shares.push({ granteeEmail, permission });
	} else {
		shares[shareIndex] = { granteeEmail, permission };
	}
	await saveShares(env, requesterEmail, shares);

	const incoming = await getSharedWith(env, granteeEmail);
	const incomingIndex = incoming.findIndex((s) => s.ownerEmail === requesterEmail);
	if (incomingIndex === -1) {
		incoming.push({ ownerEmail: requesterEmail, permission });
	} else {
		incoming[incomingIndex] = { ownerEmail: requesterEmail, permission };
	}
	await saveSharedWith(env, granteeEmail, incoming);

	return json(shares, { status: 201 });
}

async function handleDeleteShare(request: Request, env: Env, granteeEmail: string): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();

	const shares = await getShares(env, requesterEmail);
	await saveShares(
		env,
		requesterEmail,
		shares.filter((s) => s.granteeEmail !== granteeEmail),
	);

	const incoming = await getSharedWith(env, granteeEmail);
	await saveSharedWith(
		env,
		granteeEmail,
		incoming.filter((s) => s.ownerEmail !== requesterEmail),
	);

	return json({ ok: true });
}

async function handleGetSharedWithMe(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const incoming = await getSharedWith(env, requesterEmail);
	return json(incoming);
}
```

- [ ] **Step 6: Wire the four new routes**

In `frontend/functions/api/[[path]].ts`, change:

```ts
		if (pathname === "/api/plan/swap" && method === "POST") {
			return await handleSwapDish(request, env);
		}
		return json({ error: "Not found" }, { status: 404 });
```

to:

```ts
		if (pathname === "/api/plan/swap" && method === "POST") {
			return await handleSwapDish(request, env);
		}
		if (pathname === "/api/shares" && method === "GET") {
			return await handleGetShares(request, env);
		}
		if (pathname === "/api/shares" && method === "POST") {
			return await handlePostShare(request, env);
		}
		const shareMatch = pathname.match(/^\/api\/shares\/([^/]+)$/);
		if (shareMatch && method === "DELETE") {
			return await handleDeleteShare(request, env, decodeURIComponent(shareMatch[1]));
		}
		if (pathname === "/api/shared-with-me" && method === "GET") {
			return await handleGetSharedWithMe(request, env);
		}
		return json({ error: "Not found" }, { status: 404 });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests including the 5 added in Step 1. (Existing plan-related tests will still fail until Task 2 — that's expected at this point; if you see failures outside the 5 new tests, confirm they're the pre-existing `plan`/`swap`/`generate` tests, not a regression in the sharing tests.)

- [ ] **Step 8: Commit**

```bash
git add frontend/functions/api/\[\[path\]\].ts frontend/functions/api/index.spec.ts
git commit -m "$(cat <<'EOF'
Add plan sharing endpoints (shares, shared-with-me)

Introduces the KV-backed sharing model from the design doc: an
owner's outgoing shares/{owner} list and a grantee's reverse
shared-with/{grantee} index, kept in sync on every share/revoke.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend — scope plans by owner and enforce permissions

**Files:**
- Modify: `frontend/functions/api/[[path]].ts`
- Test: `frontend/functions/api/index.spec.ts`

**Interfaces:**
- Consumes: `resolveAccess`, `unauthorized`, `Permission`, `ShareEntry`, `IncomingShare` from Task 1.
- Produces: `getPlan(env, ownerEmail, weekStart)`, `savePlan(env, ownerEmail, plan)` — both now take an explicit owner, consumed only within this file (no other task calls them directly).

- [ ] **Step 1: Update `getPlan`/`savePlan` to take an owner**

In `frontend/functions/api/[[path]].ts`, change:

```ts
async function getPlan(env: Env, weekStart: string): Promise<Plan | null> {
	const raw = await env.MEALPLAN_KV.get(planKey(weekStart));
	return raw ? JSON.parse(raw) : null;
}

async function savePlan(env: Env, plan: Plan): Promise<void> {
	await env.MEALPLAN_KV.put(planKey(plan.weekStart), JSON.stringify(plan));
}
```

to:

```ts
async function getPlan(env: Env, ownerEmail: string, weekStart: string): Promise<Plan | null> {
	const raw = await env.MEALPLAN_KV.get(planKey(ownerEmail, weekStart));
	return raw ? JSON.parse(raw) : null;
}

async function savePlan(env: Env, ownerEmail: string, plan: Plan): Promise<void> {
	await env.MEALPLAN_KV.put(planKey(ownerEmail, plan.weekStart), JSON.stringify(plan));
}
```

- [ ] **Step 2: Update `handleGetPlan` to resolve the requester, default the owner, and check `view` access**

Change:

```ts
async function handleGetPlan(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const weekStartParam = url.searchParams.get("weekStart");
	const weekStart = formatDate(weekStartParam ? mondayOf(new Date(weekStartParam)) : mondayOf(new Date()));
	const plan = await getPlan(env, weekStart);
	return json(plan);
}
```

to:

```ts
async function handleGetPlan(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const url = new URL(request.url);
	const ownerEmail = url.searchParams.get("ownerEmail") || requesterEmail;
	if (!(await resolveAccess(env, requesterEmail, ownerEmail, "view"))) {
		return json({ error: "Non hai accesso a questo piano." }, { status: 403 });
	}
	const weekStartParam = url.searchParams.get("weekStart");
	const weekStart = formatDate(weekStartParam ? mondayOf(new Date(weekStartParam)) : mondayOf(new Date()));
	const plan = await getPlan(env, ownerEmail, weekStart);
	return json(plan);
}
```

- [ ] **Step 3: Update `handleGeneratePlan` to resolve the requester, default the owner, and check `edit` access**

Change:

```ts
async function handleGeneratePlan(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as { weekStart?: string };
	const dishes = await getDishes(env);
	const weekStart = body.weekStart ? mondayOf(new Date(body.weekStart)) : mondayOf(new Date());
	const plan = buildRandomPlan(dishes, weekStart);
	await savePlan(env, plan);
	return json(plan);
}
```

to:

```ts
async function handleGeneratePlan(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const body = (await request.json().catch(() => ({}))) as { ownerEmail?: string; weekStart?: string };
	const ownerEmail = body.ownerEmail || requesterEmail;
	if (!(await resolveAccess(env, requesterEmail, ownerEmail, "edit"))) {
		return json({ error: "Non hai i permessi per modificare questo piano." }, { status: 403 });
	}
	const dishes = await getDishes(env);
	const weekStart = body.weekStart ? mondayOf(new Date(body.weekStart)) : mondayOf(new Date());
	const plan = buildRandomPlan(dishes, weekStart);
	await savePlan(env, ownerEmail, plan);
	return json(plan);
}
```

- [ ] **Step 4: Update `handleSwapDish` to resolve the requester, default the owner, and check `edit` access**

Change:

```ts
async function handleSwapDish(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => null)) as {
		weekStart?: string;
		date?: string;
		slot?: MealSlot;
		dishId?: string;
	} | null;
	if (!body || !body.weekStart || !body.date || !body.slot || !body.dishId) {
		return json({ error: "Servono 'weekStart', 'date', 'slot' e 'dishId'." }, { status: 400 });
	}
	if (body.slot !== "pranzo" && body.slot !== "cena") {
		return json({ error: "'slot' deve essere 'pranzo' o 'cena'." }, { status: 400 });
	}

	const plan = await getPlan(env, body.weekStart);
```

to:

```ts
async function handleSwapDish(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const body = (await request.json().catch(() => null)) as {
		ownerEmail?: string;
		weekStart?: string;
		date?: string;
		slot?: MealSlot;
		dishId?: string;
	} | null;
	if (!body || !body.weekStart || !body.date || !body.slot || !body.dishId) {
		return json({ error: "Servono 'weekStart', 'date', 'slot' e 'dishId'." }, { status: 400 });
	}
	if (body.slot !== "pranzo" && body.slot !== "cena") {
		return json({ error: "'slot' deve essere 'pranzo' o 'cena'." }, { status: 400 });
	}
	const ownerEmail = body.ownerEmail || requesterEmail;
	if (!(await resolveAccess(env, requesterEmail, ownerEmail, "edit"))) {
		return json({ error: "Non hai i permessi per modificare questo piano." }, { status: 403 });
	}

	const plan = await getPlan(env, ownerEmail, body.weekStart);
```

Further down in the same function, change the final two lines from:

```ts
	day[body.slot] = dish.id;
	await savePlan(env, plan);
	return json(plan);
```

to:

```ts
	day[body.slot] = dish.id;
	await savePlan(env, ownerEmail, plan);
	return json(plan);
```

- [ ] **Step 5: Update the 4 existing plan tests to authenticate as the plan owner**

These four tests in `frontend/functions/api/index.spec.ts` currently call plan endpoints with no `Cf-Access-Authenticated-User-Email` header and (for the swap test) seed the plan under the old two-segment key. With the owner check in place, an unauthenticated request now gets 401 before it can do anything else, so each needs the header added; the swap test's seed key also needs the owner segment.

Change:

```ts
	it("POST /api/plan/generate only assigns weekendOnly dishes to Sat/Sun", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([
				{ id: "weekday-lunch", name: "Weekday Lunch", type: "pranzo", weekendOnly: false },
				{ id: "weekend-lunch", name: "Weekend Lunch", type: "pranzo", weekendOnly: true },
				{ id: "dinner", name: "Dinner", type: "cena", weekendOnly: false },
			]),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ weekStart: "2026-09-28" }), // a Monday
			}),
			env,
		);
```

to:

```ts
	it("POST /api/plan/generate only assigns weekendOnly dishes to Sat/Sun", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([
				{ id: "weekday-lunch", name: "Weekday Lunch", type: "pranzo", weekendOnly: false },
				{ id: "weekend-lunch", name: "Weekend Lunch", type: "pranzo", weekendOnly: true },
				{ id: "dinner", name: "Dinner", type: "cena", weekendOnly: false },
			]),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ weekStart: "2026-09-28" }), // a Monday
			}),
			env,
		);
```

Change:

```ts
	it("POST /api/plan/swap rejects a weekend-only dish on a weekday", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "weekend-lunch", name: "Weekend Lunch", type: "pranzo", weekendOnly: true }]),
		);
		await env.MEALPLAN_KV.put(
			"plan:2026-09-28",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [{ date: "2026-09-28", dayName: "Lunedì", isWeekend: false, pranzo: null, cena: null }],
			}),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ weekStart: "2026-09-28", date: "2026-09-28", slot: "pranzo", dishId: "weekend-lunch" }),
			}),
			env,
		);
		expect(res.status).toBe(400);
	});
```

to:

```ts
	it("POST /api/plan/swap rejects a weekend-only dish on a weekday", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "weekend-lunch", name: "Weekend Lunch", type: "pranzo", weekendOnly: true }]),
		);
		await env.MEALPLAN_KV.put(
			"plan:owner@example.com:2026-09-28",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [{ date: "2026-09-28", dayName: "Lunedì", isWeekend: false, pranzo: null, cena: null }],
			}),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ weekStart: "2026-09-28", date: "2026-09-28", slot: "pranzo", dishId: "weekend-lunch" }),
			}),
			env,
		);
		expect(res.status).toBe(400);
	});
```

Change:

```ts
	it("GET /api/plan?weekStart=... returns null when no plan exists for that week", async () => {
		const env = makeEnv();
		const res = await handleRequest(new Request("http://example.com/api/plan?weekStart=2026-09-28"), env);
		expect(await res.json()).toBeNull();
	});
```

to:

```ts
	it("GET /api/plan?weekStart=... returns null when no plan exists for that week", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/plan?weekStart=2026-09-28", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect(await res.json()).toBeNull();
	});
```

Change:

```ts
	it("generating a plan for one week does not overwrite another week's plan", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false }]),
		);
		await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ weekStart: "2026-09-28" }),
			}),
			env,
		);
		await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ weekStart: "2026-10-05" }),
			}),
			env,
		);

		const currentWeekRes = await handleRequest(
			new Request("http://example.com/api/plan?weekStart=2026-09-28"),
			env,
		);
		const nextWeekRes = await handleRequest(new Request("http://example.com/api/plan?weekStart=2026-10-05"), env);
		expect((await currentWeekRes.json()) as { weekStart: string }).toMatchObject({ weekStart: "2026-09-28" });
		expect((await nextWeekRes.json()) as { weekStart: string }).toMatchObject({ weekStart: "2026-10-05" });
	});
```

to:

```ts
	it("generating a plan for one week does not overwrite another week's plan", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false }]),
		);
		const headers = {
			"Content-Type": "application/json",
			"Cf-Access-Authenticated-User-Email": "owner@example.com",
		};
		await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers,
				body: JSON.stringify({ weekStart: "2026-09-28" }),
			}),
			env,
		);
		await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers,
				body: JSON.stringify({ weekStart: "2026-10-05" }),
			}),
			env,
		);

		const currentWeekRes = await handleRequest(
			new Request("http://example.com/api/plan?weekStart=2026-09-28", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		const nextWeekRes = await handleRequest(
			new Request("http://example.com/api/plan?weekStart=2026-10-05", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect((await currentWeekRes.json()) as { weekStart: string }).toMatchObject({ weekStart: "2026-09-28" });
		expect((await nextWeekRes.json()) as { weekStart: string }).toMatchObject({ weekStart: "2026-10-05" });
	});
```

- [ ] **Step 6: Write the new permission-enforcement tests (Review Focus items)**

Add to `frontend/functions/api/index.spec.ts`, next to the tests just updated in Step 5:

```ts
	it("GET /api/plan returns 401 when the Access header is missing", async () => {
		const env = makeEnv();
		const res = await handleRequest(new Request("http://example.com/api/plan?weekStart=2026-09-28"), env);
		expect(res.status).toBe(401);
	});

	it("GET /api/plan returns 403 for a requester with no relationship to the owner", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/plan?ownerEmail=owner@example.com&weekStart=2026-09-28", {
				headers: { "Cf-Access-Authenticated-User-Email": "stranger@example.com" },
			}),
			env,
		);
		expect(res.status).toBe(403);
	});

	it("a requester with only 'view' permission cannot generate a plan for the owner", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false }]),
		);
		await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ granteeEmail: "viewer@example.com", permission: "view" }),
			}),
			env,
		);

		const res = await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "viewer@example.com",
				},
				body: JSON.stringify({ ownerEmail: "owner@example.com", weekStart: "2026-09-28" }),
			}),
			env,
		);
		expect(res.status).toBe(403);
	});

	it("a requester with only 'view' permission cannot swap a dish in the owner's plan", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false }]),
		);
		await env.MEALPLAN_KV.put(
			"plan:owner@example.com:2026-09-28",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [{ date: "2026-09-28", dayName: "Lunedì", isWeekend: false, pranzo: null, cena: null }],
			}),
		);
		await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ granteeEmail: "viewer@example.com", permission: "view" }),
			}),
			env,
		);

		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "viewer@example.com",
				},
				body: JSON.stringify({
					ownerEmail: "owner@example.com",
					weekStart: "2026-09-28",
					date: "2026-09-28",
					slot: "pranzo",
					dishId: "dish",
				}),
			}),
			env,
		);
		expect(res.status).toBe(403);
	});

	it("a requester with 'edit' permission can generate and read the owner's plan", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false }]),
		);
		await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ granteeEmail: "editor@example.com", permission: "edit" }),
			}),
			env,
		);

		const generateRes = await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "editor@example.com",
				},
				body: JSON.stringify({ ownerEmail: "owner@example.com", weekStart: "2026-09-28" }),
			}),
			env,
		);
		expect(generateRes.status).toBe(200);

		const readRes = await handleRequest(
			new Request("http://example.com/api/plan?ownerEmail=owner@example.com&weekStart=2026-09-28", {
				headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
			}),
			env,
		);
		expect((await readRes.json()) as { weekStart: string }).toMatchObject({ weekStart: "2026-09-28" });
	});
```

- [ ] **Step 7: Run the full test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests, including the 4 updated in Step 5 and the 5 added in Step 6.

- [ ] **Step 8: Typecheck and build**

Run: `cd frontend && npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/functions/api/\[\[path\]\].ts frontend/functions/api/index.spec.ts
git commit -m "$(cat <<'EOF'
Scope meal plans by owner and enforce sharing permissions

Plans move from a single global KV slot to plan:{owner}:{weekStart}.
Reading a plan now requires 'view' access and generating/swapping
requires 'edit' access, resolved against the sharing indexes added
in the previous commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Frontend — types and API client for ownership and sharing

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: nothing new (matches the backend contracts from Tasks 1–2).
- Produces: `type Permission = "view" | "edit"`, `interface ShareEntry { granteeEmail: string; permission: Permission }`, `interface IncomingShare { ownerEmail: string; permission: Permission }` (all from `./types`); `getPlan(weekStart: string, ownerEmail?: string): Promise<Plan | null>`, `generatePlan(weekStart: string, ownerEmail?: string): Promise<Plan>`, `swapDish(input: { weekStart: string; date: string; slot: MealSlot; dishId: string; ownerEmail?: string }): Promise<Plan>`, `getShares(): Promise<ShareEntry[]>`, `addShare(input: { granteeEmail: string; permission: Permission }): Promise<ShareEntry[]>`, `removeShare(granteeEmail: string): Promise<void>`, `getSharedWithMe(): Promise<IncomingShare[]>` (all from `./api`) — consumed by Task 4.

This task has no independent test of its own (there's no existing frontend unit-test setup — component behavior is exercised by the app itself in Task 4); it's verified by the typecheck/build in Step 3 and exercised end-to-end once Task 4 wires it into the UI.

- [ ] **Step 1: Add the sharing types**

In `frontend/src/lib/types.ts`, change:

```ts
export interface Plan {
	weekStart: string;
	days: PlanDay[];
}
```

to:

```ts
export interface Plan {
	weekStart: string;
	days: PlanDay[];
}

export type Permission = "view" | "edit";

export interface ShareEntry {
	granteeEmail: string;
	permission: Permission;
}

export interface IncomingShare {
	ownerEmail: string;
	permission: Permission;
}
```

- [ ] **Step 2: Add `ownerEmail` to the plan API client functions and add the sharing client functions**

In `frontend/src/lib/api.ts`, change:

```ts
import type { Dish, DishType, MealSlot, Plan } from "./types";
```

to:

```ts
import type { Dish, DishType, IncomingShare, MealSlot, Permission, Plan, ShareEntry } from "./types";
```

Change:

```ts
export function getPlan(weekStart: string): Promise<Plan | null> {
	return request<Plan | null>(`/api/plan?weekStart=${encodeURIComponent(weekStart)}`);
}

export function generatePlan(weekStart: string): Promise<Plan> {
	return request<Plan>("/api/plan/generate", {
		method: "POST",
		body: JSON.stringify({ weekStart }),
	});
}
```

to:

```ts
export function getPlan(weekStart: string, ownerEmail?: string): Promise<Plan | null> {
	const params = new URLSearchParams({ weekStart });
	if (ownerEmail) params.set("ownerEmail", ownerEmail);
	return request<Plan | null>(`/api/plan?${params.toString()}`);
}

export function generatePlan(weekStart: string, ownerEmail?: string): Promise<Plan> {
	return request<Plan>("/api/plan/generate", {
		method: "POST",
		body: JSON.stringify({ weekStart, ownerEmail }),
	});
}
```

Change:

```ts
export function swapDish(input: { weekStart: string; date: string; slot: MealSlot; dishId: string }): Promise<Plan> {
	return request<Plan>("/api/plan/swap", {
		method: "POST",
		body: JSON.stringify(input),
	});
}
```

to:

```ts
export function swapDish(input: {
	weekStart: string;
	date: string;
	slot: MealSlot;
	dishId: string;
	ownerEmail?: string;
}): Promise<Plan> {
	return request<Plan>("/api/plan/swap", {
		method: "POST",
		body: JSON.stringify(input),
	});
}
```

Then, at the end of the file, after `getMe`, add:

```ts

export function getShares(): Promise<ShareEntry[]> {
	return request<ShareEntry[]>("/api/shares");
}

export function addShare(input: { granteeEmail: string; permission: Permission }): Promise<ShareEntry[]> {
	return request<ShareEntry[]>("/api/shares", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export function removeShare(granteeEmail: string): Promise<void> {
	return request<void>(`/api/shares/${encodeURIComponent(granteeEmail)}`, {
		method: "DELETE",
	});
}

export function getSharedWithMe(): Promise<IncomingShare[]> {
	return request<IncomingShare[]>("/api/shared-with-me");
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: no errors. (`App.tsx` still calls `getPlan(viewedWeekStart)`, `generatePlan(viewedWeekStart)`, and `swapDish({ weekStart, date, slot, dishId })` with no `ownerEmail` — all still valid since it's optional. This will change in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
Add frontend types and API client for plan ownership and sharing

Adds Permission/ShareEntry/IncomingShare and an optional ownerEmail
parameter on the plan endpoints, plus client functions for the new
/api/shares and /api/shared-with-me endpoints.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Frontend — owner switcher and read-only rendering for shared plans

**Files:**
- Create: `frontend/src/components/OwnerSwitcher.tsx`
- Modify: `frontend/src/components/DayCard.tsx`
- Modify: `frontend/src/components/WeekView.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `getPlan`, `generatePlan`, `swapDish`, `getSharedWithMe` from `./lib/api` (Task 3); `IncomingShare` from `./lib/types` (Task 3).
- Produces: `<OwnerSwitcher viewedOwnerEmail={string | null} sharedWithMe={IncomingShare[]} onChange={(ownerEmail: string | null) => void} />`, `<WeekView readOnly?: boolean />`, `<DayCard readOnly?: boolean />`, and on `App`: `viewedOwnerEmail: string | null` and `isOwnPlan: boolean` state — consumed by Task 5.

This task is deliberately kept together as one unit: switching owners and enforcing what a non-owner can do are two halves of the same behavior, and splitting them would leave an intermediate state where the switcher exists but doesn't yet gate editing.

- [ ] **Step 1: Create the `OwnerSwitcher` component**

Create `frontend/src/components/OwnerSwitcher.tsx`:

```tsx
import type { IncomingShare } from "../lib/types";

const SELF_OPTION = "__self__";

interface OwnerSwitcherProps {
	viewedOwnerEmail: string | null;
	sharedWithMe: IncomingShare[];
	onChange: (ownerEmail: string | null) => void;
}

export function OwnerSwitcher({ viewedOwnerEmail, sharedWithMe, onChange }: OwnerSwitcherProps) {
	if (sharedWithMe.length === 0) return null;

	return (
		<select
			className="owner-switcher"
			value={viewedOwnerEmail ?? SELF_OPTION}
			onChange={(e) => onChange(e.target.value === SELF_OPTION ? null : e.target.value)}
		>
			<option value={SELF_OPTION}>Il mio piano</option>
			{sharedWithMe.map((share) => (
				<option key={share.ownerEmail} value={share.ownerEmail}>
					{share.ownerEmail} ({share.permission === "edit" ? "modifica" : "sola lettura"})
				</option>
			))}
		</select>
	);
}
```

- [ ] **Step 2: Add the `.owner-switcher` style**

In `frontend/src/App.css`, change:

```css
.app__week-nav {
	display: flex;
	gap: 8px;
}
```

to:

```css
.app__week-nav {
	display: flex;
	gap: 8px;
}

.owner-switcher {
	font: inherit;
	font-size: 14px;
	padding: 8px 10px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--surface);
	color: var(--text-h);
}
```

- [ ] **Step 3: Add `readOnly` to `DayCard` and its internal `MealSlotRow`**

In `frontend/src/components/DayCard.tsx`, change:

```tsx
interface DayCardProps {
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
}
```

to:

```tsx
interface DayCardProps {
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
	readOnly?: boolean;
}
```

Change:

```tsx
function MealSlotRow({
	label,
	slot,
	day,
	dishes,
	dishesById,
	onSwap,
}: {
	label: string;
	slot: MealSlot;
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
}) {
	const currentId = day[slot];
	const current = currentId ? dishesById[currentId] : null;
	const options = dishesForSlot(dishes, slot, day.isWeekend);
	const optionsWithCurrent =
		current && !options.some((d) => d.id === current.id) ? [...options, current] : options;

	return (
```

to:

```tsx
function MealSlotRow({
	label,
	slot,
	day,
	dishes,
	dishesById,
	onSwap,
	readOnly,
}: {
	label: string;
	slot: MealSlot;
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
	readOnly?: boolean;
}) {
	const currentId = day[slot];
	const current = currentId ? dishesById[currentId] : null;

	if (readOnly) {
		return (
			<div className="day-card__meal">
				<span className="day-card__label">{label}</span>
				<p className="day-card__dish">{current?.name ?? "—"}</p>
			</div>
		);
	}

	const options = dishesForSlot(dishes, slot, day.isWeekend);
	const optionsWithCurrent =
		current && !options.some((d) => d.id === current.id) ? [...options, current] : options;

	return (
```

Change:

```tsx
export function DayCard({ day, dishes, dishesById, onSwap }: DayCardProps) {
	return (
		<article className={`day-card${day.isWeekend ? " day-card--weekend" : ""}`}>
			<header className="day-card__header">
				<h3>{day.dayName}</h3>
				<span className="day-card__date">{formatDate(day.date)}</span>
			</header>

			<MealSlotRow
				label="Pranzo"
				slot="pranzo"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
			/>
			<MealSlotRow
				label="Cena"
				slot="cena"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
			/>
		</article>
	);
}
```

to:

```tsx
export function DayCard({ day, dishes, dishesById, onSwap, readOnly }: DayCardProps) {
	return (
		<article className={`day-card${day.isWeekend ? " day-card--weekend" : ""}`}>
			<header className="day-card__header">
				<h3>{day.dayName}</h3>
				<span className="day-card__date">{formatDate(day.date)}</span>
			</header>

			<MealSlotRow
				label="Pranzo"
				slot="pranzo"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
				readOnly={readOnly}
			/>
			<MealSlotRow
				label="Cena"
				slot="cena"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
				readOnly={readOnly}
			/>
		</article>
	);
}
```

- [ ] **Step 4: Add `readOnly` to `WeekView`**

In `frontend/src/components/WeekView.tsx`, change:

```tsx
interface WeekViewProps {
	plan: Plan;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
}

export function WeekView({ plan, dishes, dishesById, onSwap }: WeekViewProps) {
	return (
		<div className="week-grid">
			{plan.days.map((day) => (
				<DayCard key={day.date} day={day} dishes={dishes} dishesById={dishesById} onSwap={onSwap} />
			))}
		</div>
	);
}
```

to:

```tsx
interface WeekViewProps {
	plan: Plan;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
	readOnly?: boolean;
}

export function WeekView({ plan, dishes, dishesById, onSwap, readOnly }: WeekViewProps) {
	return (
		<div className="week-grid">
			{plan.days.map((day) => (
				<DayCard
					key={day.date}
					day={day}
					dishes={dishes}
					dishesById={dishesById}
					onSwap={onSwap}
					readOnly={readOnly}
				/>
			))}
		</div>
	);
}
```

- [ ] **Step 5: Wire owner-switching state and `canEditViewedPlan` into `App.tsx`**

In `frontend/src/App.tsx`, change:

```tsx
import { addDish, deleteDish, generatePlan, getDishes, getMe, getPlan, swapDish, updateDish } from "./lib/api";
import { addDays, mondayOf } from "./lib/week";
import type { Dish, DishType, MealSlot, Plan } from "./lib/types";
```

to:

```tsx
import { OwnerSwitcher } from "./components/OwnerSwitcher";
import {
	addDish,
	deleteDish,
	generatePlan,
	getDishes,
	getMe,
	getPlan,
	getSharedWithMe,
	swapDish,
	updateDish,
} from "./lib/api";
import { addDays, mondayOf } from "./lib/week";
import type { Dish, DishType, IncomingShare, MealSlot, Plan } from "./lib/types";
```

Change:

```tsx
	const currentWeekStart = useMemo(() => mondayOf(new Date()), []);
	const nextWeekStart = useMemo(() => addDays(currentWeekStart, 7), [currentWeekStart]);
	const [viewedWeekStart, setViewedWeekStart] = useState(currentWeekStart);
	const isFirstLoad = useRef(true);

	useEffect(() => {
		if (isFirstLoad.current) {
			isFirstLoad.current = false;
			Promise.all([getDishes(), getPlan(viewedWeekStart)])
				.then(([dishesResult, planResult]) => {
					setDishes(dishesResult);
					setPlan(planResult);
				})
				.catch((err: Error) => setError(err.message))
				.finally(() => setLoading(false));
			getMe()
				.then((me) => setCanDelete(me.canDelete))
				.catch(() => setCanDelete(false));
			return;
		}
		setPlanLoading(true);
		getPlan(viewedWeekStart)
			.then(setPlan)
			.catch((err: Error) => setError(err.message))
			.finally(() => setPlanLoading(false));
	}, [viewedWeekStart]);
```

to:

```tsx
	const currentWeekStart = useMemo(() => mondayOf(new Date()), []);
	const nextWeekStart = useMemo(() => addDays(currentWeekStart, 7), [currentWeekStart]);
	const [viewedWeekStart, setViewedWeekStart] = useState(currentWeekStart);
	const [viewedOwnerEmail, setViewedOwnerEmail] = useState<string | null>(null);
	const [sharedWithMe, setSharedWithMe] = useState<IncomingShare[]>([]);
	const isFirstLoad = useRef(true);
	const isOwnPlan = viewedOwnerEmail === null;
	const canEditViewedPlan =
		isOwnPlan || sharedWithMe.some((s) => s.ownerEmail === viewedOwnerEmail && s.permission === "edit");

	useEffect(() => {
		if (isFirstLoad.current) {
			isFirstLoad.current = false;
			Promise.all([getDishes(), getPlan(viewedWeekStart, viewedOwnerEmail ?? undefined)])
				.then(([dishesResult, planResult]) => {
					setDishes(dishesResult);
					setPlan(planResult);
				})
				.catch((err: Error) => setError(err.message))
				.finally(() => setLoading(false));
			getMe()
				.then((me) => setCanDelete(me.canDelete))
				.catch(() => setCanDelete(false));
			getSharedWithMe()
				.then(setSharedWithMe)
				.catch(() => setSharedWithMe([]));
			return;
		}
		setPlanLoading(true);
		getPlan(viewedWeekStart, viewedOwnerEmail ?? undefined)
			.then(setPlan)
			.catch((err: Error) => setError(err.message))
			.finally(() => setPlanLoading(false));
	}, [viewedWeekStart, viewedOwnerEmail]);
```

Change:

```tsx
	async function handleConfirmRegenerate() {
		setRegenerating(true);
		setRegenerateError(null);
		try {
			const newPlan = await generatePlan(viewedWeekStart);
			setPlan(newPlan);
			setRegenerateModalOpen(false);
		} catch (err) {
			setRegenerateError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setRegenerating(false);
		}
	}

	async function handleSwap(date: string, slot: MealSlot, dishId: string) {
		if (!dishId) return;
		setSwapError(null);
		try {
			const newPlan = await swapDish({ weekStart: viewedWeekStart, date, slot, dishId });
			setPlan(newPlan);
		} catch (err) {
			setSwapError(err instanceof Error ? err.message : "Errore imprevisto.");
		}
	}
```

to:

```tsx
	async function handleConfirmRegenerate() {
		setRegenerating(true);
		setRegenerateError(null);
		try {
			const newPlan = await generatePlan(viewedWeekStart, viewedOwnerEmail ?? undefined);
			setPlan(newPlan);
			setRegenerateModalOpen(false);
		} catch (err) {
			setRegenerateError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setRegenerating(false);
		}
	}

	async function handleSwap(date: string, slot: MealSlot, dishId: string) {
		if (!dishId) return;
		setSwapError(null);
		try {
			const newPlan = await swapDish({
				weekStart: viewedWeekStart,
				date,
				slot,
				dishId,
				ownerEmail: viewedOwnerEmail ?? undefined,
			});
			setPlan(newPlan);
		} catch (err) {
			setSwapError(err instanceof Error ? err.message : "Errore imprevisto.");
		}
	}
```

- [ ] **Step 6: Render the `OwnerSwitcher`, gate "Rigenera piano", pass `readOnly` to `WeekView`, and adjust the empty-plan message**

Change:

```tsx
						{view === "plan" && (
							<div className="app__week-nav">
								<button
									type="button"
									className="btn btn--ghost"
									disabled={viewedWeekStart === currentWeekStart}
									onClick={() => setViewedWeekStart(currentWeekStart)}
								>
									‹ Settimana attuale
								</button>
								<button
									type="button"
									className="btn btn--ghost"
									disabled={viewedWeekStart === nextWeekStart}
									onClick={() => setViewedWeekStart(nextWeekStart)}
								>
									Settimana successiva ›
								</button>
							</div>
						)}
```

to:

```tsx
						{view === "plan" && (
							<div className="app__week-nav">
								<button
									type="button"
									className="btn btn--ghost"
									disabled={viewedWeekStart === currentWeekStart}
									onClick={() => setViewedWeekStart(currentWeekStart)}
								>
									‹ Settimana attuale
								</button>
								<button
									type="button"
									className="btn btn--ghost"
									disabled={viewedWeekStart === nextWeekStart}
									onClick={() => setViewedWeekStart(nextWeekStart)}
								>
									Settimana successiva ›
								</button>
							</div>
						)}
						{view === "plan" && (
							<OwnerSwitcher
								viewedOwnerEmail={viewedOwnerEmail}
								sharedWithMe={sharedWithMe}
								onChange={setViewedOwnerEmail}
							/>
						)}
```

Change:

```tsx
						{view === "plan" && (
							<>
								<button type="button" className="btn btn--ghost" onClick={() => setAddModalOpen(true)}>
									Aggiungi piatto
								</button>
								<button
									type="button"
									className="btn btn--primary"
									onClick={() => setRegenerateModalOpen(true)}
								>
									Rigenera piano
								</button>
							</>
						)}
```

to:

```tsx
						{view === "plan" && (
							<>
								<button type="button" className="btn btn--ghost" onClick={() => setAddModalOpen(true)}>
									Aggiungi piatto
								</button>
								{canEditViewedPlan && (
									<button
										type="button"
										className="btn btn--primary"
										onClick={() => setRegenerateModalOpen(true)}
									>
										Rigenera piano
									</button>
								)}
							</>
						)}
```

Change:

```tsx
				{!loading && !error && view === "plan" && !plan && (
						<p className="app__status">Nessun piano per questa settimana. Genera il primo piano.</p>
					)}
					{!loading && !error && view === "plan" && plan && (
						<WeekView plan={plan} dishes={dishes} dishesById={dishesById} onSwap={handleSwap} />
					)}
```

to:

```tsx
				{!loading && !error && view === "plan" && !plan && (
						<p className="app__status">
							{canEditViewedPlan
								? "Nessun piano per questa settimana. Genera il primo piano."
								: "Nessun piano per questa settimana."}
						</p>
					)}
					{!loading && !error && view === "plan" && plan && (
						<WeekView
							plan={plan}
							dishes={dishes}
							dishesById={dishesById}
							onSwap={handleSwap}
							readOnly={!canEditViewedPlan}
						/>
					)}
```

`isOwnPlan` is declared but not yet read by any JSX in this task — Task 5 consumes it for the "Condividi piano" button. Confirm in the next step that it's the *only* unused-variable error before moving on.

- [ ] **Step 7: Typecheck and build**

Run: `cd frontend && npm run build`
Expected: FAILS with `'isOwnPlan' is declared but its value is never read.` and no other error. This is expected — Task 5 consumes `isOwnPlan` in its first step. If any *other* error appears, fix it now before proceeding; do not carry an unrelated error into Task 5.

- [ ] **Step 8: Manual verification of what's testable so far**

Run: `cd frontend && npm run seed:local && npx vite build --mode development 2>/dev/null; true` — the build in Step 7 is expected to fail on the lint-level unused-variable check, which `tsc -b` enforces but a plain `vite build` does not, so use `npx vite build` here to produce a working `dist/` for this manual check despite Step 7's expected failure. Then:

```bash
npx wrangler pages dev dist --port 8788 &
sleep 3
BASE=http://127.0.0.1:8788
curl -s -X POST "$BASE/api/plan/generate" -H 'Content-Type: application/json' -H 'Cf-Access-Authenticated-User-Email: owner@example.com' -d '{"weekStart":"2026-09-28"}' | head -c 100
echo
curl -s -X POST "$BASE/api/shares" -H 'Content-Type: application/json' -H 'Cf-Access-Authenticated-User-Email: owner@example.com' -d '{"granteeEmail":"viewer@example.com","permission":"view"}'
echo
```

Open `http://127.0.0.1:8788` in a browser twice — once with a browser extension or proxy that sets `Cf-Access-Authenticated-User-Email: viewer@example.com` on requests (local `wrangler pages dev` has no real Access in front of it, so the header must be injected manually for this check) — and confirm the viewer sees the owner's plan in the switcher, selects it, and sees disabled/read-only meal cards with no "Rigenera piano" button. Stop the server afterward: `pkill -f "wrangler pages dev"`.

- [ ] **Step 9: Proceed to Task 5**

Do not commit yet — Task 5's typecheck/build step is what turns this task's expected `isOwnPlan` failure into a clean pass, and Task 5's commit covers both tasks' file changes together.

---

### Task 5: Frontend — share management modal

**Files:**
- Create: `frontend/src/components/ShareModal.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `getShares`, `addShare`, `removeShare` from `./lib/api` (Task 3); `Permission`, `ShareEntry` from `./lib/types` (Task 3); `isOwnPlan` from Task 4's `App.tsx` state; the `Modal` component from `./Modal` (existing).
- Produces: `<ShareModal shares={ShareEntry[]} onClose={() => void} onAdd={(granteeEmail: string, permission: Permission) => Promise<void>} onRemove={(granteeEmail: string) => Promise<void>} />` — this is the final task, nothing downstream consumes it.

- [ ] **Step 1: Create the `ShareModal` component**

Create `frontend/src/components/ShareModal.tsx`:

```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "./Modal";
import type { Permission, ShareEntry } from "../lib/types";

interface ShareModalProps {
	shares: ShareEntry[];
	onClose: () => void;
	onAdd: (granteeEmail: string, permission: Permission) => Promise<void>;
	onRemove: (granteeEmail: string) => Promise<void>;
}

export function ShareModal({ shares, onClose, onAdd, onRemove }: ShareModalProps) {
	const [email, setEmail] = useState("");
	const [permission, setPermission] = useState<Permission>("view");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!email.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			await onAdd(email.trim(), permission);
			setEmail("");
			setPermission("view");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Modal title="Condividi piano" onClose={onClose}>
			{shares.length === 0 ? (
				<p className="app__status">Non hai ancora condiviso il piano con nessuno.</p>
			) : (
				<ul className="share-list">
					{shares.map((share) => (
						<li key={share.granteeEmail} className="share-list__row">
							<span>{share.granteeEmail}</span>
							<span className="recipe-list__badge">
								{share.permission === "edit" ? "Modifica" : "Sola lettura"}
							</span>
							<button
								type="button"
								className="btn btn--danger"
								onClick={() => onRemove(share.granteeEmail)}
							>
								Rimuovi
							</button>
						</li>
					))}
				</ul>
			)}

			<form className="dish-form" onSubmit={handleSubmit}>
				<label className="dish-form__field">
					<span>Email</span>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="persona@esempio.com"
						autoFocus
					/>
				</label>
				<label className="dish-form__field">
					<span>Permesso</span>
					<select value={permission} onChange={(e) => setPermission(e.target.value as Permission)}>
						<option value="view">Sola lettura</option>
						<option value="edit">Modifica</option>
					</select>
				</label>
				{error && <p className="app__status app__status--error">{error}</p>}
				<div className="modal__actions">
					<button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
						Chiudi
					</button>
					<button type="submit" className="btn btn--primary" disabled={submitting}>
						{submitting ? "Condivisione…" : "Condividi"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
```

- [ ] **Step 2: Add the `.share-list` styles**

In `frontend/src/App.css`, change:

```css
.owner-switcher {
	font: inherit;
	font-size: 14px;
	padding: 8px 10px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--surface);
	color: var(--text-h);
}
```

to:

```css
.owner-switcher {
	font: inherit;
	font-size: 14px;
	padding: 8px 10px;
	border-radius: 8px;
	border: 1px solid var(--border);
	background: var(--surface);
	color: var(--text-h);
}

.share-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
	list-style: none;
	padding: 0;
	margin: 0 0 16px;
}

.share-list__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
	background: var(--bg);
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: 12px 16px;
}
```

- [ ] **Step 3: Wire `ShareModal` into `App.tsx`**

Change:

```tsx
import { OwnerSwitcher } from "./components/OwnerSwitcher";
import {
	addDish,
	deleteDish,
	generatePlan,
	getDishes,
	getMe,
	getPlan,
	getSharedWithMe,
	swapDish,
	updateDish,
} from "./lib/api";
import { addDays, mondayOf } from "./lib/week";
import type { Dish, DishType, IncomingShare, MealSlot, Plan } from "./lib/types";
```

to:

```tsx
import { OwnerSwitcher } from "./components/OwnerSwitcher";
import { ShareModal } from "./components/ShareModal";
import {
	addDish,
	addShare,
	deleteDish,
	generatePlan,
	getDishes,
	getMe,
	getPlan,
	getShares,
	getSharedWithMe,
	removeShare,
	swapDish,
	updateDish,
} from "./lib/api";
import { addDays, mondayOf } from "./lib/week";
import type { Dish, DishType, IncomingShare, MealSlot, Permission, Plan, ShareEntry } from "./lib/types";
```

Change:

```tsx
	const [isAddModalOpen, setAddModalOpen] = useState(false);
	const [isRegenerateModalOpen, setRegenerateModalOpen] = useState(false);
	const [regenerating, setRegenerating] = useState(false);
	const [regenerateError, setRegenerateError] = useState<string | null>(null);
	const [swapError, setSwapError] = useState<string | null>(null);
```

to:

```tsx
	const [isAddModalOpen, setAddModalOpen] = useState(false);
	const [isRegenerateModalOpen, setRegenerateModalOpen] = useState(false);
	const [isShareModalOpen, setShareModalOpen] = useState(false);
	const [regenerating, setRegenerating] = useState(false);
	const [regenerateError, setRegenerateError] = useState<string | null>(null);
	const [swapError, setSwapError] = useState<string | null>(null);
	const [shares, setShares] = useState<ShareEntry[]>([]);
```

Change the mount effect's fetch block:

```tsx
			getMe()
				.then((me) => setCanDelete(me.canDelete))
				.catch(() => setCanDelete(false));
			getSharedWithMe()
				.then(setSharedWithMe)
				.catch(() => setSharedWithMe([]));
			return;
```

to:

```tsx
			getMe()
				.then((me) => setCanDelete(me.canDelete))
				.catch(() => setCanDelete(false));
			getSharedWithMe()
				.then(setSharedWithMe)
				.catch(() => setSharedWithMe([]));
			getShares()
				.then(setShares)
				.catch(() => setShares([]));
			return;
```

Add two new handler functions right after `handleSwap`:

```tsx
	async function handleAddShare(granteeEmail: string, permission: Permission): Promise<void> {
		const updated = await addShare({ granteeEmail, permission });
		setShares(updated);
	}

	async function handleRemoveShare(granteeEmail: string): Promise<void> {
		await removeShare(granteeEmail);
		setShares((prev) => prev.filter((s) => s.granteeEmail !== granteeEmail));
	}
```

Change the "Aggiungi piatto" / "Rigenera piano" button group to add the share button between them:

```tsx
						{view === "plan" && (
							<>
								<button type="button" className="btn btn--ghost" onClick={() => setAddModalOpen(true)}>
									Aggiungi piatto
								</button>
								{canEditViewedPlan && (
									<button
										type="button"
										className="btn btn--primary"
										onClick={() => setRegenerateModalOpen(true)}
									>
										Rigenera piano
									</button>
								)}
							</>
						)}
```

to:

```tsx
						{view === "plan" && (
							<>
								<button type="button" className="btn btn--ghost" onClick={() => setAddModalOpen(true)}>
									Aggiungi piatto
								</button>
								{isOwnPlan && (
									<button type="button" className="btn btn--ghost" onClick={() => setShareModalOpen(true)}>
										Condividi piano
									</button>
								)}
								{canEditViewedPlan && (
									<button
										type="button"
										className="btn btn--primary"
										onClick={() => setRegenerateModalOpen(true)}
									>
										Rigenera piano
									</button>
								)}
							</>
						)}
```

Add the modal render, right after the existing `isRegenerateModalOpen && (...)` block, before the closing `</div>` of the root `app` div:

```tsx
				{isShareModalOpen && (
					<ShareModal
						shares={shares}
						onClose={() => setShareModalOpen(false)}
						onAdd={handleAddShare}
						onRemove={handleRemoveShare}
					/>
				)}
```

- [ ] **Step 4: Typecheck and build**

Run: `cd frontend && npm run build`
Expected: succeeds with no TypeScript errors — `isOwnPlan` is now consumed here, clearing Task 4's expected failure.

- [ ] **Step 5: Run the full backend test suite one more time (regression check)**

Run: `cd frontend && npx vitest run`
Expected: PASS — this task only touches frontend files, so this confirms nothing here broke the API.

- [ ] **Step 6: Manual verification**

With the same `wrangler pages dev` setup as Task 4's Step 8 (owner + viewer identities via header injection): as the owner, open "Condividi piano", add a new share for a third email at `edit` permission, confirm it appears in the list; remove the original `view` share and confirm it disappears; switch identity to the removed viewer and confirm their access to the owner's plan is now gone (403 on the API, and the plan no longer appears in their switcher).

- [ ] **Step 7: Commit (covers Task 4 and Task 5 together)**

```bash
git add frontend/src/App.tsx frontend/src/App.css frontend/src/components/OwnerSwitcher.tsx frontend/src/components/DayCard.tsx frontend/src/components/WeekView.tsx frontend/src/components/ShareModal.tsx
git commit -m "$(cat <<'EOF'
Add owner switching, read-only shared plans, and share management

Lets a user switch between their own plan and any plan shared with
them, rendering read-only when their permission is 'view'. Owners
manage who has access from a new "Condividi piano" modal backed by
the /api/shares endpoints.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
