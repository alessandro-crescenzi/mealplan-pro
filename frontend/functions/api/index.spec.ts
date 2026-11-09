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

function makeEnv(adminEmail?: string, devUserEmail?: string): Env {
	return { MEALPLAN_KV: new MemoryKV(), ADMIN_EMAIL: adminEmail, DEV_USER_EMAIL: devUserEmail };
}

function shareRequest(body: unknown, email?: string): Request {
	return new Request("http://example.com/api/shopping-list/share", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(email ? { "Cf-Access-Authenticated-User-Email": email } : {}),
		},
		body: JSON.stringify(body),
	});
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

	it("POST /api/dishes with category 'contorno' ignores 'type' and stores 'entrambi'", async () => {
		const env = makeEnv();
		const res = await handleRequest(
			new Request("http://example.com/api/dishes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Insalata mista", category: "contorno" }),
			}),
			env,
		);
		expect(res.status).toBe(201);
		const dish = (await res.json()) as { category: string; type: string };
		expect(dish.category).toBe("contorno");
		expect(dish.type).toBe("entrambi");
	});

	it("POST /api/plan/generate never assigns a contorno automatically", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([
				{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false, category: "piatto" },
				{ id: "insalata", name: "Insalata", type: "entrambi", weekendOnly: false, category: "contorno" },
			]),
		);
		const res = await handleRequest(
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
		const plan = (await res.json()) as { days: { pranzoContorno: string | null; cenaContorno: string | null }[] };
		for (const day of plan.days) {
			expect(day.pranzoContorno).toBeNull();
			expect(day.cenaContorno).toBeNull();
		}
	});

	it("POST /api/plan/swap-contorno assigns a contorno to a slot", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "insalata", name: "Insalata", type: "entrambi", weekendOnly: false, category: "contorno" }]),
		);
		await env.MEALPLAN_KV.put(
			"plan:owner@example.com:2026-09-28",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [
					{
						date: "2026-09-28",
						dayName: "Lunedì",
						isWeekend: false,
						pranzo: null,
						cena: null,
						pranzoContorno: null,
						cenaContorno: null,
					},
				],
			}),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap-contorno", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ weekStart: "2026-09-28", date: "2026-09-28", slot: "pranzo", dishId: "insalata" }),
			}),
			env,
		);
		expect(res.status).toBe(200);
		const plan = (await res.json()) as { days: { pranzoContorno: string | null }[] };
		expect(plan.days[0].pranzoContorno).toBe("insalata");
	});

	it("POST /api/plan/swap-contorno rejects a dish that isn't a contorno", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "dish", name: "Dish", type: "entrambi", weekendOnly: false, category: "piatto" }]),
		);
		await env.MEALPLAN_KV.put(
			"plan:owner@example.com:2026-09-28",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [
					{
						date: "2026-09-28",
						dayName: "Lunedì",
						isWeekend: false,
						pranzo: null,
						cena: null,
						pranzoContorno: null,
						cenaContorno: null,
					},
				],
			}),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap-contorno", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ weekStart: "2026-09-28", date: "2026-09-28", slot: "pranzo", dishId: "dish" }),
			}),
			env,
		);
		expect(res.status).toBe(400);
	});

	it("POST /api/plan/swap-contorno with a null dishId clears the slot", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([{ id: "insalata", name: "Insalata", type: "entrambi", weekendOnly: false, category: "contorno" }]),
		);
		await env.MEALPLAN_KV.put(
			"plan:owner@example.com:2026-09-28",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [
					{
						date: "2026-09-28",
						dayName: "Lunedì",
						isWeekend: false,
						pranzo: null,
						cena: null,
						pranzoContorno: "insalata",
						cenaContorno: null,
					},
				],
			}),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap-contorno", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Cf-Access-Authenticated-User-Email": "owner@example.com",
				},
				body: JSON.stringify({ weekStart: "2026-09-28", date: "2026-09-28", slot: "pranzo", dishId: null }),
			}),
			env,
		);
		expect(res.status).toBe(200);
		const plan = (await res.json()) as { days: { pranzoContorno: string | null }[] };
		expect(plan.days[0].pranzoContorno).toBeNull();
	});

	it("DEV_USER_EMAIL identifies the user on localhost when no Access header is sent", async () => {
		const env = makeEnv(undefined, "Dev@Example.com");
		for (const host of ["http://localhost:8788", "http://127.0.0.1:8788"]) {
			const res = await handleRequest(new Request(`${host}/api/me`), env);
			expect(await res.json()).toMatchObject({ email: "dev@example.com" });
		}
	});

	it("DEV_USER_EMAIL is ignored on non-local hosts", async () => {
		const env = makeEnv(undefined, "dev@example.com");
		const res = await handleRequest(new Request("https://mealplan-pro.pages.dev/api/me"), env);
		expect(await res.json()).toMatchObject({ email: null });
	});

	it("the Access header wins over DEV_USER_EMAIL, and POST bodies still reach the handler", async () => {
		const env = makeEnv(undefined, "dev@example.com");
		const me = await handleRequest(
			new Request("http://localhost:8788/api/me", {
				headers: { "Cf-Access-Authenticated-User-Email": "real@example.com" },
			}),
			env,
		);
		expect(await me.json()).toMatchObject({ email: "real@example.com" });

		const created = await handleRequest(
			new Request("http://localhost:8788/api/dishes", {
				method: "POST",
				body: JSON.stringify({ name: "Frittata", type: "cena" }),
			}),
			env,
		);
		expect(created.status).toBe(201);
	});

	it("POST /api/shopping-list/share requires authentication", async () => {
		const env = makeEnv();
		const res = await handleRequest(shareRequest({ items: [{ name: "pasta", count: 1 }] }), env);
		expect(res.status).toBe(401);
	});

	it("POST /api/shopping-list/share rejects empty or malformed lists", async () => {
		const env = makeEnv();
		const bad = [
			{ items: [] },
			{ items: "pasta" },
			{ items: [{ name: "", count: 1 }] },
			{ items: [{ name: "pasta", count: 0 }] },
			{ items: [{ name: "pasta", count: 1.5 }] },
			{ items: [{ name: "x".repeat(101), count: 1 }] },
			{ items: Array.from({ length: 201 }, (_, i) => ({ name: `ing${i}`, count: 1 })) },
		];
		for (const body of bad) {
			const res = await handleRequest(shareRequest(body, "owner@example.com"), env);
			expect(res.status).toBe(400);
		}
	});

	it("a shared shopping list is publicly readable as a schema.org Recipe page", async () => {
		const env = makeEnv();
		const created = await handleRequest(
			shareRequest(
				{
					title: "Lista della spesa · 9 – 15 novembre",
					items: [
						{ name: "pasta", count: 1 },
						{ name: "zucchine", count: 2 },
					],
				},
				"owner@example.com",
			),
			env,
		);
		expect(created.status).toBe(201);
		const { url } = (await created.json()) as { url: string };
		expect(url).toMatch(/^http:\/\/example\.com\/api\/public\/shopping-list\/[0-9a-f-]{36}$/);

		// No Access header: this is what Bring's servers will send.
		const page = await handleRequest(new Request(url), env);
		expect(page.status).toBe(200);
		expect(page.headers.get("Content-Type")).toContain("text/html");
		const html = await page.text();
		const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
		expect(ld).not.toBeNull();
		const recipe = JSON.parse(ld![1]) as { "@type": string; name: string; recipeIngredient: string[] };
		expect(recipe["@type"]).toBe("Recipe");
		expect(recipe.name).toBe("Lista della spesa · 9 – 15 novembre");
		expect(recipe.recipeIngredient).toEqual(["pasta", "2 zucchine"]);
	});

	it("the public shopping list page escapes user-provided text", async () => {
		const env = makeEnv();
		const evil = '</script><img src=x onerror=alert(1)>';
		const created = await handleRequest(
			shareRequest({ title: evil, items: [{ name: evil, count: 1 }] }, "owner@example.com"),
			env,
		);
		const { url } = (await created.json()) as { url: string };
		const html = await (await handleRequest(new Request(url), env)).text();
		expect(html).not.toContain("<img");
		expect(html.match(/<\/script>/g)).toHaveLength(1); // only the one closing the JSON-LD block
	});

	it("GET /api/public/shopping-list/:token returns 404 for unknown or expired tokens", async () => {
		const env = makeEnv();
		const res = await handleRequest(new Request("http://example.com/api/public/shopping-list/nope"), env);
		expect(res.status).toBe(404);
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

	it("POST /api/dishes stores trimmed, de-duplicated ingredients and defaults to an empty list", async () => {
		const env = makeEnv();
		const post = (body: unknown) =>
			handleRequest(
				new Request("http://example.com/api/dishes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
				env,
			);
		const withIngredients = await post({
			name: "Frittata con le zucchine",
			type: "cena",
			ingredients: [" uova ", "zucchine", "Zucchine", "", "  "],
		});
		expect(withIngredients.status).toBe(201);
		expect(((await withIngredients.json()) as { ingredients: string[] }).ingredients).toEqual(["uova", "zucchine"]);

		const without = await post({ name: "Pasta in bianco", type: "pranzo" });
		expect(((await without.json()) as { ingredients: string[] }).ingredients).toEqual([]);
	});

	it("POST /api/dishes rejects ingredients that are not an array of strings", async () => {
		const env = makeEnv();
		for (const ingredients of ["uova, zucchine", [1, 2], { a: 1 }]) {
			const res = await handleRequest(
				new Request("http://example.com/api/dishes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "Frittata", type: "cena", ingredients }),
				}),
				env,
			);
			expect(res.status).toBe(400);
		}
	});

	it("PUT /api/dishes/:id updates ingredients and leaves them untouched when omitted", async () => {
		const env = makeEnv();
		await env.MEALPLAN_KV.put(
			"dishes",
			JSON.stringify([
				{ id: "frittata", name: "Frittata", type: "cena", weekendOnly: false, ingredients: ["uova"] },
			]),
		);
		const put = (body: unknown) =>
			handleRequest(
				new Request("http://example.com/api/dishes/frittata", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
				env,
			);
		const kept = await put({ name: "Frittata", type: "cena" });
		expect(((await kept.json()) as { ingredients: string[] }).ingredients).toEqual(["uova"]);

		const updated = await put({ name: "Frittata", type: "cena", ingredients: ["uova", "zucchine"] });
		expect(((await updated.json()) as { ingredients: string[] }).ingredients).toEqual(["uova", "zucchine"]);

		const cleared = await put({ name: "Frittata", type: "cena", ingredients: [] });
		expect(((await cleared.json()) as { ingredients: string[] }).ingredients).toEqual([]);

		const invalid = await put({ name: "Frittata", type: "cena", ingredients: "uova" });
		expect(invalid.status).toBe(400);
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
