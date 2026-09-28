import type { Dish, MealSlot } from "./types";

export function isContorno(dish: Dish): boolean {
	return dish.category === "contorno";
}

export function dishesForSlot(dishes: Dish[], slot: MealSlot, isWeekend: boolean): Dish[] {
	return dishes.filter((d) => {
		if (isContorno(d)) return false;
		const matchesSlot = d.type === slot || d.type === "entrambi";
		if (!matchesSlot) return false;
		if (d.weekendOnly && !isWeekend) return false;
		return true;
	});
}

export function contorniForDay(dishes: Dish[], isWeekend: boolean): Dish[] {
	return dishes.filter((d) => {
		if (!isContorno(d)) return false;
		if (d.weekendOnly && !isWeekend) return false;
		return true;
	});
}
