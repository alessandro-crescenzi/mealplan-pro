import type { Dish, DishType, MealSlot, Plan } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(body?.error ?? `Richiesta fallita (${res.status})`);
	}
	return res.json() as Promise<T>;
}

export function getDishes(): Promise<Dish[]> {
	return request<Dish[]>("/api/dishes");
}

export function getPlan(): Promise<Plan | null> {
	return request<Plan | null>("/api/plan");
}

export function generatePlan(weekStart?: string): Promise<Plan> {
	return request<Plan>("/api/plan/generate", {
		method: "POST",
		body: JSON.stringify({ weekStart }),
	});
}

export function addDish(input: { name: string; type: DishType; weekendOnly?: boolean }): Promise<Dish> {
	return request<Dish>("/api/dishes", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export function swapDish(input: { date: string; slot: MealSlot; dishId: string }): Promise<Plan> {
	return request<Plan>("/api/plan/swap", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export function updateDish(id: string, input: { name: string; type: DishType }): Promise<Dish> {
	return request<Dish>(`/api/dishes/${encodeURIComponent(id)}`, {
		method: "PUT",
		body: JSON.stringify(input),
	});
}

export function deleteDish(id: string): Promise<void> {
	return request<void>(`/api/dishes/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

export function getMe(): Promise<{ email: string | null; canDelete: boolean }> {
	return request<{ email: string | null; canDelete: boolean }>("/api/me");
}
