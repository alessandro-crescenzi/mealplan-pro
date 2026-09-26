export type DishType = "pranzo" | "cena" | "entrambi";
export type MealSlot = "pranzo" | "cena";

export interface Dish {
	id: string;
	name: string;
	type: DishType;
	weekendOnly: boolean;
}

export interface PlanDay {
	date: string;
	dayName: string;
	isWeekend: boolean;
	pranzo: string | null;
	cena: string | null;
}

export interface Plan {
	weekStart: string;
	days: PlanDay[];
}
