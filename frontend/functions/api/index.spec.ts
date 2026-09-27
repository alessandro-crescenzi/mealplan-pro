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
				headers: { "Content-Type": "application/json" },
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
			"plan",
			JSON.stringify({
				weekStart: "2026-09-28",
				days: [{ date: "2026-09-28", dayName: "Lunedì", isWeekend: false, pranzo: null, cena: null }],
			}),
		);
		const res = await handleRequest(
			new Request("http://example.com/api/plan/swap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ date: "2026-09-28", slot: "pranzo", dishId: "weekend-lunch" }),
			}),
			env,
		);
		expect(res.status).toBe(400);
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
});
