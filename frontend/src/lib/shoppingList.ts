import type { Dish, Plan } from "./types";

export interface ShoppingItem {
	name: string;
	count: number;
}

function ingredientKey(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function dishIdsInPlan(plan: Plan): string[] {
	const ids: string[] = [];
	for (const day of plan.days) {
		for (const id of [day.pranzo, day.pranzoContorno, day.cena, day.cenaContorno]) {
			if (id) ids.push(id);
		}
	}
	return ids;
}

/**
 * One entry per distinct ingredient, in order of first appearance, with the number of
 * recipes (counted per appearance in the plan) that use it.
 */
export function buildShoppingList(plan: Plan, dishesById: Record<string, Dish>): ShoppingItem[] {
	const items = new Map<string, ShoppingItem>();
	for (const id of dishIdsInPlan(plan)) {
		const seenInRecipe = new Set<string>();
		for (const raw of dishesById[id]?.ingredients ?? []) {
			const name = raw.trim().replace(/\s+/g, " ");
			const key = ingredientKey(name);
			if (!key || seenInRecipe.has(key)) continue;
			seenInRecipe.add(key);
			const existing = items.get(key);
			if (existing) existing.count += 1;
			else items.set(key, { name, count: 1 });
		}
	}
	return [...items.values()];
}

export function formatShoppingList(items: ShoppingItem[]): string {
	return items.map((i) => (i.count > 1 ? `- ${i.name} x${i.count}` : `- ${i.name}`)).join("\n");
}

/** Planned dishes (deduplicated) that have no ingredients, so the list may be incomplete. */
export function dishesMissingIngredients(plan: Plan, dishesById: Record<string, Dish>): Dish[] {
	const missing = new Map<string, Dish>();
	for (const id of dishIdsInPlan(plan)) {
		const dish = dishesById[id];
		if (dish && !(dish.ingredients && dish.ingredients.length > 0)) missing.set(id, dish);
	}
	return [...missing.values()];
}

export function parseIngredientsInput(text: string): string[] {
	return text
		.split(/[,\n]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

export function ingredientsToInput(ingredients: string[] | undefined): string {
	return (ingredients ?? []).join(", ");
}
