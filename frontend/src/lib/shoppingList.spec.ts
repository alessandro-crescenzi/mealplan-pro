import { describe, expect, it } from "vitest";
import {
	buildShoppingList,
	formatShoppingList,
	ingredientsToInput,
	parseIngredientsInput,
} from "./shoppingList";
import type { Dish, Plan, PlanDay } from "./types";

function dish(id: string, ingredients?: string[], category: Dish["category"] = "piatto"): Dish {
	return { id, name: id, type: "entrambi", weekendOnly: false, category, ingredients };
}

function day(overrides: Partial<PlanDay> = {}): PlanDay {
	return {
		date: "2026-09-28",
		dayName: "Lunedì",
		isWeekend: false,
		pranzo: null,
		cena: null,
		pranzoContorno: null,
		cenaContorno: null,
		...overrides,
	};
}

function planOf(...days: PlanDay[]): Plan {
	return { weekStart: "2026-09-28", days };
}

function byId(...dishes: Dish[]): Record<string, Dish> {
	return Object.fromEntries(dishes.map((d) => [d.id, d]));
}

describe("buildShoppingList", () => {
	it("counts how many times an ingredient appears across recipes, in order of first appearance", () => {
		const pasta = dish("pasta-zucchine-pancetta", ["pasta", "zucchine", "pancetta"]);
		const frittata = dish("frittata", ["uova", "zucchine"]);
		const plan = planOf(day({ pranzo: pasta.id, cena: frittata.id }));

		expect(buildShoppingList(plan, byId(pasta, frittata))).toEqual([
			{ name: "pasta", count: 1 },
			{ name: "zucchine", count: 2 },
			{ name: "pancetta", count: 1 },
			{ name: "uova", count: 1 },
		]);
	});

	it("counts a recipe once per appearance in the plan", () => {
		const pasta = dish("pasta", ["pasta", "sugo"]);
		const plan = planOf(day({ pranzo: pasta.id }), day({ date: "2026-09-29", cena: pasta.id }));

		expect(buildShoppingList(plan, byId(pasta))).toEqual([
			{ name: "pasta", count: 2 },
			{ name: "sugo", count: 2 },
		]);
	});

	it("includes contorni and matches ingredients case-insensitively", () => {
		const main = dish("main", ["Zucchine"]);
		const side = dish("side", ["zucchine  ", "patate"], "contorno");
		const plan = planOf(day({ pranzo: main.id, pranzoContorno: side.id }));

		expect(buildShoppingList(plan, byId(main, side))).toEqual([
			{ name: "Zucchine", count: 2 },
			{ name: "patate", count: 1 },
		]);
	});

	it("counts an ingredient once per recipe even if the recipe lists it twice", () => {
		const d = dish("d", ["uova", "Uova"]);
		expect(buildShoppingList(planOf(day({ pranzo: d.id })), byId(d))).toEqual([{ name: "uova", count: 1 }]);
	});

	it("ignores empty slots, unknown ids and dishes without ingredients", () => {
		const legacy = dish("legacy");
		const plan = planOf(day({ pranzo: legacy.id, cena: "missing", pranzoContorno: null }));
		expect(buildShoppingList(plan, byId(legacy))).toEqual([]);
	});
});

describe("formatShoppingList", () => {
	it("prints one bullet per ingredient with xN only when N > 1", () => {
		expect(
			formatShoppingList([
				{ name: "pasta", count: 1 },
				{ name: "zucchine", count: 2 },
			]),
		).toBe("- pasta\n- zucchine x2");
	});
});

describe("ingredient input helpers", () => {
	it("parses comma or newline separated text, trimming and dropping empties", () => {
		expect(parseIngredientsInput(" pasta, zucchine ,\npancetta,, ")).toEqual(["pasta", "zucchine", "pancetta"]);
	});

	it("round-trips through ingredientsToInput", () => {
		expect(parseIngredientsInput(ingredientsToInput(["pasta", "zucchine"]))).toEqual(["pasta", "zucchine"]);
		expect(ingredientsToInput(undefined)).toBe("");
	});
});
