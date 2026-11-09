import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without type declarations
import { mergeIngredients } from "./merge-ingredients.mjs";

const base = { type: "pranzo", weekendOnly: false, category: "piatto" };

describe("mergeIngredients", () => {
	it("adds seed ingredients to production dishes that have none, matching by id", () => {
		const prod = [
			{ id: "a", name: "A", ...base },
			{ id: "b", name: "B", ...base, ingredients: [] },
		];
		const seed = [
			{ id: "a", name: "A", ingredients: ["pasta", "sugo"] },
			{ id: "b", name: "B", ingredients: ["riso"] },
		];
		const { merged, updated } = mergeIngredients(prod, seed);
		expect(updated).toEqual(["a", "b"]);
		expect(merged[0]).toEqual({ id: "a", name: "A", ...base, ingredients: ["pasta", "sugo"] });
		expect(merged[1].ingredients).toEqual(["riso"]);
	});

	it("never overwrites ingredients already present in production", () => {
		const prod = [{ id: "a", name: "A", ...base, ingredients: ["custom"] }];
		const seed = [{ id: "a", name: "A", ingredients: ["pasta"] }];
		const { merged, updated, alreadyHad } = mergeIngredients(prod, seed);
		expect(merged[0].ingredients).toEqual(["custom"]);
		expect(updated).toEqual([]);
		expect(alreadyHad).toEqual(["a"]);
	});

	it("keeps production-only dishes untouched and never adds or removes dishes", () => {
		const prod = [
			{ id: "added-in-app", name: "Insalata mista", type: "entrambi", weekendOnly: false, category: "contorno" },
			{ id: "a", name: "A", ...base },
		];
		const seed = [
			{ id: "a", name: "A", ingredients: ["pasta"] },
			{ id: "seed-only", name: "Solo seed", ingredients: ["x"] },
		];
		const { merged, notInSeed, seedOnly } = mergeIngredients(prod, seed);
		expect(merged.map((d: { id: string }) => d.id)).toEqual(["added-in-app", "a"]);
		expect(merged[0]).toEqual(prod[0]);
		expect(notInSeed).toEqual(["added-in-app"]);
		expect(seedOnly).toEqual(["seed-only"]);
	});

	it("does not mutate its inputs and does not share ingredient arrays with the seed", () => {
		const prod = [{ id: "a", name: "A", ...base }];
		const seed = [{ id: "a", name: "A", ingredients: ["pasta"] }];
		const { merged } = mergeIngredients(prod, seed);
		expect(prod[0]).not.toHaveProperty("ingredients");
		merged[0].ingredients.push("extra");
		expect(seed[0].ingredients).toEqual(["pasta"]);
	});

	it("ignores seed entries without usable ingredients", () => {
		const prod = [{ id: "a", name: "A", ...base }];
		const seed = [{ id: "a", name: "A", ingredients: [] }];
		const { merged, updated, notInSeed } = mergeIngredients(prod, seed);
		expect(updated).toEqual([]);
		expect(notInSeed).toEqual(["a"]);
		expect(merged[0]).toEqual(prod[0]);
	});
});
