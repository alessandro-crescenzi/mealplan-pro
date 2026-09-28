export type DishType = "pranzo" | "cena" | "entrambi";
export type DishCategory = "piatto" | "contorno";
export type MealSlot = "pranzo" | "cena";

export interface Dish {
	id: string;
	name: string;
	type: DishType;
	weekendOnly: boolean;
	category: DishCategory;
}

export interface PlanDay {
	date: string;
	dayName: string;
	isWeekend: boolean;
	pranzo: string | null;
	cena: string | null;
	pranzoContorno: string | null;
	cenaContorno: string | null;
}

export interface Plan {
	weekStart: string;
	days: PlanDay[];
}

export type Permission = "view" | "edit";

export interface ShareEntry {
	granteeEmail: string;
	permission: Permission;
}

export interface IncomingShare {
	ownerEmail: string;
	permission: Permission;
}
