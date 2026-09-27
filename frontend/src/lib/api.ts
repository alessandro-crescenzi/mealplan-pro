import type { Dish, DishType, IncomingShare, MealSlot, Permission, Plan, ShareEntry } from "./types";

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

export function addDish(input: { name: string; type: DishType; weekendOnly?: boolean }): Promise<Dish> {
	return request<Dish>("/api/dishes", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

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
