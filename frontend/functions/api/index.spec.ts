import { describe, it, expect } from "vitest";
import { handleRequest, type Env } from "./[[path]]";

class MemoryKV {
	private store = new Map<string, string>();
	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}
	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value);
	}
	async delete(key: string): Promise<void> {
		this.store.delete(key);
	}
}

function makeEnv(adminEmail?: string): Env {
	return { MEALPLAN_KV: new MemoryKV(), ADMIN_EMAIL: adminEmail };
}

describe("mealplan pages function API", () => {
	it("GET /api/dishes returns an empty list when nothing is seeded", async () => {
		const env = makeEnv();
		const res = await handleRequest(new Request("http://example.com/api/dishes"), env);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	it("POST /api/dishes adds a dish and generates a slug id", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/dishes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Pasta al pesto", type: "pranzo", weekendOnly: true }),
			}),
			env,
		);
		expect(res.status).toBe(201);
		const dish = (await res.json()) as { id: string; name: string };
		expect(dish.id).toBe("pasta-al-pesto");
		expect(dish.name).toBe("Pasta al pesto");
	});

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
		const plan = (await res.json()) as { days: { isWeekend: boolean; pranzo: string | null }[] };
		for (const day of plan.days) {
			if (!day.isWeekend) {
				expect(day.pranzo).toBe("weekday-lunch");
			}
		}
	});

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

	it("responds 404 for unknown routes", async () => {
		const env = makeEnv();
		const res = await handleRequest(new Request("http://example.com/nope"), env);
		expect(res.status).toBe(404);
	});

	it("PUT /api/dishes/:id updates name and type without changing the id", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "pasta-al-pesto", name: "Pasta al pesto", type: "pranzo", weekendOnly: false }]),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/dishes/pasta-al-pesto", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Pasta al pesto genovese", type: "cena" }),
			}),
			env,
		);
		expect(res.status).toBe(200);
		const dish = (await res.json()) as { id: string; name: string; type: string };
		expect(dish.id).toBe("pasta-al-pesto");
		expect(dish.name).toBe("Pasta al pesto genovese");
		expect(dish.type).toBe("cena");
	});

	it("PUT /api/dishes/:id returns 404 for an unknown dish", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/dishes/does-not-exist", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Nome", type: "pranzo" }),
			}),
			env,
		);
		expect(res.status).toBe(404);
	});

	it("DELETE /api/dishes/:id is rejected without the authorized admin email", async () => {
		const env = makeEnv("admin@example.com");
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "pasta-al-pesto", name: "Pasta al pesto", type: "pranzo", weekendOnly: false }]),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/dishes/pasta-al-pesto", { method: "DELETE" }),
			env,
		);
		expect(res.status).toBe(403);
		expect(await env.MEALPLAN_KV.get("dishes")).toContain("pasta-al-pesto");
	});

	it("DELETE /api/dishes/:id succeeds for the authorized admin email", async () => {
		const env = makeEnv("admin@example.com");
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "pasta-al-pesto", name: "Pasta al pesto", type: "pranzo", weekendOnly: false }]),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/dishes/pasta-al-pesto", {
				method: "DELETE",
				headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" },
			}),
			env,
		);
		expect(res.status).toBe(200);
		expect(await env.MEALPLAN_KV.get("dishes")).toBe("[]");
	});

	it("GET /api/me reports canDelete based on the Access header", async () => {
		const env = makeEnv("admin@example.com");
		const res = await handleRequest(
			new Request("http://example.com/api/me", {
				headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" },
			}),
			env,
		);
		expect(await res.json()).toEqual({ email: "admin@example.com", canDelete: true });
	});

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

	it("POST /api/shares normalizes a mixed-case granteeEmail so it's visible via GET /api/shared-with-me queried in lowercase", async () => {
		const env = makeEnv();
		const shareRes = await handleRequest(
			new Request("http://example.com/api/shares", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ granteeEmail: "Friend@Example.com", permission: "view" }),
			}),
			env,
		);
		expect(shareRes.status).toBe(201);

		const granteeIncoming = await handleRequest(
			new Request("http://example.com/api/shared-with-me", {
				headers: { "Cf-Access-Authenticated-User-Email": "friend@example.com" },
			}),
			env,
		);
		expect(await granteeIncoming.json()).toEqual([{ ownerEmail: "owner@example.com", permission: "view" }]);
	});

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

	it("a requester with 'view' permission can read the owner's plan", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false }]),
		);
		await handleRequest(
			new Request("http://example.com/api/plan/generate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ weekStart: "2026-09-28" }),
			}),
			env,
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
			new Request("http://example.com/api/plan?ownerEmail=owner@example.com&weekStart=2026-09-28", {
				headers: { "Cf-Access-Authenticated-User-Email": "viewer@example.com" },
			}),
			env,
		);
		expect(res.status).toBe(200);
		expect((await res.json()) as { weekStart: string }).toMatchObject({ weekStart: "2026-09-28" });
	});

	it("a requester with 'edit' permission can generate a plan with mismatched-case ownerEmail and read it via lowercase", async () => {
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
				body: JSON.stringify({ ownerEmail: "Owner@Example.com", weekStart: "2026-09-28" }),
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
});
