interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface Env {
	MEALPLAN_KV: KVNamespace;
}

interface EventContext<E> {
	request: Request;
	env: E;
}

type DishType = "pranzo" | "cena" | "entrambi";

interface Dish {
	id: string;
	name: string;
	type: DishType;
	weekendOnly: boolean;
}

type MealSlot = "pranzo" | "cena";

interface PlanDay {
	date: string;
	dayName: string;
	isWeekend: boolean;
	pranzo: string | null;
	cena: string | null;
}

interface Plan {
	weekStart: string;
	days: PlanDay[];
}

const DISHES_KEY = "dishes";
const PLAN_KEY = "plan";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function json(data: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json",
			...init.headers,
		},
	});
}

function slugify(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

async function getDishes(env: Env): Promise<Dish[]> {
	const raw = await env.MEALPLAN_KV.get(DISHES_KEY);
	return raw ? JSON.parse(raw) : [];
}

async function saveDishes(env: Env, dishes: Dish[]): Promise<void> {
	await env.MEALPLAN_KV.put(DISHES_KEY, JSON.stringify(dishes));
}

async function getPlan(env: Env): Promise<Plan | null> {
	const raw = await env.MEALPLAN_KV.get(PLAN_KEY);
	return raw ? JSON.parse(raw) : null;
}

async function savePlan(env: Env, plan: Plan): Promise<void> {
	await env.MEALPLAN_KV.put(PLAN_KEY, JSON.stringify(plan));
}

function mondayOf(date: Date): Date {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const day = d.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	d.setUTCDate(d.getUTCDate() + diff);
	return d;
}

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function pickRandom<T>(items: T[]): T | null {
	if (items.length === 0) return null;
	return items[Math.floor(Math.random() * items.length)];
}

function dishesForSlot(dishes: Dish[], slot: MealSlot, isWeekend: boolean): Dish[] {
	return dishes.filter((d) => {
		const matchesSlot = d.type === slot || d.type === "entrambi";
		if (!matchesSlot) return false;
		if (d.weekendOnly && !isWeekend) return false;
		return true;
	});
}

function buildRandomPlan(dishes: Dish[], weekStart: Date): Plan {
	const days: PlanDay[] = [];
	for (let i = 0; i < 7; i++) {
		const date = new Date(weekStart);
		date.setUTCDate(date.getUTCDate() + i);
		const isWeekend = i >= 5; // Sabato, Domenica
		const pranzoOptions = dishesForSlot(dishes, "pranzo", isWeekend);
		const cenaOptions = dishesForSlot(dishes, "cena", isWeekend);
		days.push({
			date: formatDate(date),
			dayName: DAY_NAMES[i],
			isWeekend,
			pranzo: pickRandom(pranzoOptions)?.id ?? null,
			cena: pickRandom(cenaOptions)?.id ?? null,
		});
	}
	return { weekStart: formatDate(weekStart), days };
}

async function handleGetDishes(env: Env): Promise<Response> {
	const dishes = await getDishes(env);
	return json(dishes);
}

async function handleCreateDish(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => null)) as Partial<Dish> | null;
	if (!body || typeof body.name !== "string" || !body.name.trim()) {
		return json({ error: "Il campo 'name' è obbligatorio." }, { status: 400 });
	}
	if (body.type !== "pranzo" && body.type !== "cena" && body.type !== "entrambi") {
		return json({ error: "Il campo 'type' deve essere 'pranzo', 'cena' o 'entrambi'." }, { status: 400 });
	}

	const dishes = await getDishes(env);
	const baseId = slugify(body.name);
	let id = baseId;
	let suffix = 2;
	while (dishes.some((d) => d.id === id)) {
		id = `${baseId}-${suffix++}`;
	}

	const dish: Dish = {
		id,
		name: body.name.trim(),
		type: body.type,
		weekendOnly: Boolean(body.weekendOnly),
	};
	dishes.push(dish);
	await saveDishes(env, dishes);
	return json(dish, { status: 201 });
}

async function handleGetPlan(env: Env): Promise<Response> {
	const plan = await getPlan(env);
	return json(plan);
}

async function handleGeneratePlan(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as { weekStart?: string };
	const dishes = await getDishes(env);
	const weekStart = body.weekStart ? mondayOf(new Date(body.weekStart)) : mondayOf(new Date());
	const plan = buildRandomPlan(dishes, weekStart);
	await savePlan(env, plan);
	return json(plan);
}

async function handleSwapDish(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => null)) as {
		date?: string;
		slot?: MealSlot;
		dishId?: string;
	} | null;
	if (!body || !body.date || !body.slot || !body.dishId) {
		return json({ error: "Servono 'date', 'slot' e 'dishId'." }, { status: 400 });
	}
	if (body.slot !== "pranzo" && body.slot !== "cena") {
		return json({ error: "'slot' deve essere 'pranzo' o 'cena'." }, { status: 400 });
	}

	const plan = await getPlan(env);
	if (!plan) {
		return json({ error: "Nessun piano attivo. Generane uno prima." }, { status: 404 });
	}
	const day = plan.days.find((d) => d.date === body.date);
	if (!day) {
		return json({ error: `Nessun giorno trovato per la data ${body.date}.` }, { status: 404 });
	}

	const dishes = await getDishes(env);
	const dish = dishes.find((d) => d.id === body.dishId);
	if (!dish) {
		return json({ error: `Piatto '${body.dishId}' non trovato.` }, { status: 404 });
	}
	const validForSlot = dish.type === body.slot || dish.type === "entrambi";
	if (!validForSlot) {
		return json({ error: `Il piatto '${dish.name}' non è valido per lo slot '${body.slot}'.` }, { status: 400 });
	}
	if (dish.weekendOnly && !day.isWeekend) {
		return json({ error: `Il piatto '${dish.name}' è disponibile solo nel weekend.` }, { status: 400 });
	}

	day[body.slot] = dish.id;
	await savePlan(env, plan);
	return json(plan);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const { pathname } = url;
	const method = request.method;

	try {
		if (pathname === "/api/dishes" && method === "GET") {
			return await handleGetDishes(env);
		}
		if (pathname === "/api/dishes" && method === "POST") {
			return await handleCreateDish(request, env);
		}
		if (pathname === "/api/plan" && method === "GET") {
			return await handleGetPlan(env);
		}
		if (pathname === "/api/plan/generate" && method === "POST") {
			return await handleGeneratePlan(request, env);
		}
		if (pathname === "/api/plan/swap" && method === "POST") {
			return await handleSwapDish(request, env);
		}
		return json({ error: "Not found" }, { status: 404 });
	} catch (err) {
		return json({ error: "Errore interno", detail: String(err) }, { status: 500 });
	}
}

export function onRequest(context: EventContext<Env>): Promise<Response> {
	return handleRequest(context.request, context.env);
}
