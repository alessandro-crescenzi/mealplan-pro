interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface Env {
	MEALPLAN_KV: KVNamespace;
	ADMIN_EMAIL?: string;
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
type Permission = "view" | "edit";

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

interface ShareEntry {
	granteeEmail: string;
	permission: Permission;
}

interface IncomingShare {
	ownerEmail: string;
	permission: Permission;
}

const DISHES_KEY = "dishes";

function planKey(ownerEmail: string, weekStart: string): string {
	return `plan:${ownerEmail}:${weekStart}`;
}

function sharesKey(ownerEmail: string): string {
	return `shares:${ownerEmail}`;
}

function sharedWithKey(granteeEmail: string): string {
	return `shared-with:${granteeEmail}`;
}

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

function getAuthenticatedEmail(request: Request): string | null {
	const email = request.headers.get("Cf-Access-Authenticated-User-Email");
	return email ? email.toLowerCase() : null;
}

function unauthorized(): Response {
	return json({ error: "Autenticazione mancante." }, { status: 401 });
}

function canDeleteDishes(request: Request, env: Env): boolean {
	const email = getAuthenticatedEmail(request);
	return Boolean(email && env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
}

async function getPlan(env: Env, ownerEmail: string, weekStart: string): Promise<Plan | null> {
	const raw = await env.MEALPLAN_KV.get(planKey(ownerEmail, weekStart));
	return raw ? JSON.parse(raw) : null;
}

async function savePlan(env: Env, ownerEmail: string, plan: Plan): Promise<void> {
	await env.MEALPLAN_KV.put(planKey(ownerEmail, plan.weekStart), JSON.stringify(plan));
}

async function getShares(env: Env, ownerEmail: string): Promise<ShareEntry[]> {
	const raw = await env.MEALPLAN_KV.get(sharesKey(ownerEmail));
	return raw ? JSON.parse(raw) : [];
}

async function saveShares(env: Env, ownerEmail: string, shares: ShareEntry[]): Promise<void> {
	await env.MEALPLAN_KV.put(sharesKey(ownerEmail), JSON.stringify(shares));
}

async function getSharedWith(env: Env, granteeEmail: string): Promise<IncomingShare[]> {
	const raw = await env.MEALPLAN_KV.get(sharedWithKey(granteeEmail));
	return raw ? JSON.parse(raw) : [];
}

async function saveSharedWith(env: Env, granteeEmail: string, incoming: IncomingShare[]): Promise<void> {
	await env.MEALPLAN_KV.put(sharedWithKey(granteeEmail), JSON.stringify(incoming));
}

function permissionCovers(granted: Permission, required: Permission): boolean {
	if (granted === "edit") return true;
	return required === "view";
}

async function resolveAccess(
	env: Env,
	requesterEmail: string,
	ownerEmail: string,
	required: Permission,
): Promise<boolean> {
	if (requesterEmail === ownerEmail) return true;
	const incoming = await getSharedWith(env, requesterEmail);
	const entry = incoming.find((s) => s.ownerEmail === ownerEmail);
	if (!entry) return false;
	return permissionCovers(entry.permission, required);
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

async function handleUpdateDish(request: Request, env: Env, id: string): Promise<Response> {
	const body = (await request.json().catch(() => null)) as Partial<Dish> | null;
	if (!body || typeof body.name !== "string" || !body.name.trim()) {
		return json({ error: "Il campo 'name' è obbligatorio." }, { status: 400 });
	}
	if (body.type !== "pranzo" && body.type !== "cena" && body.type !== "entrambi") {
		return json({ error: "Il campo 'type' deve essere 'pranzo', 'cena' o 'entrambi'." }, { status: 400 });
	}

	const dishes = await getDishes(env);
	const dish = dishes.find((d) => d.id === id);
	if (!dish) {
		return json({ error: `Piatto '${id}' non trovato.` }, { status: 404 });
	}
	dish.name = body.name.trim();
	dish.type = body.type;
	await saveDishes(env, dishes);
	return json(dish);
}

async function handleDeleteDish(request: Request, env: Env, id: string): Promise<Response> {
	if (!canDeleteDishes(request, env)) {
		return json({ error: "Non sei autorizzato a eliminare le ricette." }, { status: 403 });
	}
	const dishes = await getDishes(env);
	const index = dishes.findIndex((d) => d.id === id);
	if (index === -1) {
		return json({ error: `Piatto '${id}' non trovato.` }, { status: 404 });
	}
	dishes.splice(index, 1);
	await saveDishes(env, dishes);
	return json({ ok: true });
}

async function handleWhoAmI(request: Request, env: Env): Promise<Response> {
	return json({
		email: getAuthenticatedEmail(request),
		canDelete: canDeleteDishes(request, env),
	});
}

async function handleGetPlan(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const url = new URL(request.url);
	const ownerEmail = (url.searchParams.get("ownerEmail") || requesterEmail).toLowerCase();
	if (!(await resolveAccess(env, requesterEmail, ownerEmail, "view"))) {
		return json({ error: "Non hai accesso a questo piano." }, { status: 403 });
	}
	const weekStartParam = url.searchParams.get("weekStart");
	const weekStart = formatDate(weekStartParam ? mondayOf(new Date(weekStartParam)) : mondayOf(new Date()));
	const plan = await getPlan(env, ownerEmail, weekStart);
	return json(plan);
}

async function handleGeneratePlan(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const body = (await request.json().catch(() => ({}))) as { ownerEmail?: string; weekStart?: string };
	const ownerEmail = (body.ownerEmail || requesterEmail).toLowerCase();
	if (!(await resolveAccess(env, requesterEmail, ownerEmail, "edit"))) {
		return json({ error: "Non hai i permessi per modificare questo piano." }, { status: 403 });
	}
	const dishes = await getDishes(env);
	const weekStart = body.weekStart ? mondayOf(new Date(body.weekStart)) : mondayOf(new Date());
	const plan = buildRandomPlan(dishes, weekStart);
	await savePlan(env, ownerEmail, plan);
	return json(plan);
}

async function handleSwapDish(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const body = (await request.json().catch(() => null)) as {
		ownerEmail?: string;
		weekStart?: string;
		date?: string;
		slot?: MealSlot;
		dishId?: string;
	} | null;
	if (!body || !body.weekStart || !body.date || !body.slot || !body.dishId) {
		return json({ error: "Servono 'weekStart', 'date', 'slot' e 'dishId'." }, { status: 400 });
	}
	if (body.slot !== "pranzo" && body.slot !== "cena") {
		return json({ error: "'slot' deve essere 'pranzo' o 'cena'." }, { status: 400 });
	}
	const ownerEmail = (body.ownerEmail || requesterEmail).toLowerCase();
	if (!(await resolveAccess(env, requesterEmail, ownerEmail, "edit"))) {
		return json({ error: "Non hai i permessi per modificare questo piano." }, { status: 403 });
	}

	const plan = await getPlan(env, ownerEmail, body.weekStart);
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
	await savePlan(env, ownerEmail, plan);
	return json(plan);
}

async function handleGetShares(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const shares = await getShares(env, requesterEmail);
	return json(shares);
}

async function handlePostShare(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const body = (await request.json().catch(() => null)) as { granteeEmail?: string; permission?: string } | null;
	if (!body || !body.granteeEmail || (body.permission !== "view" && body.permission !== "edit")) {
		return json({ error: "Servono 'granteeEmail' e 'permission' ('view' o 'edit')." }, { status: 400 });
	}
	const granteeEmail = body.granteeEmail.toLowerCase();
	if (granteeEmail === requesterEmail) {
		return json({ error: "Non puoi condividere il piano con te stesso." }, { status: 400 });
	}
	const permission = body.permission;

	const shares = await getShares(env, requesterEmail);
	const shareIndex = shares.findIndex((s) => s.granteeEmail === granteeEmail);
	if (shareIndex === -1) {
		shares.push({ granteeEmail, permission });
	} else {
		shares[shareIndex] = { granteeEmail, permission };
	}
	await saveShares(env, requesterEmail, shares);

	const incoming = await getSharedWith(env, granteeEmail);
	const incomingIndex = incoming.findIndex((s) => s.ownerEmail === requesterEmail);
	if (incomingIndex === -1) {
		incoming.push({ ownerEmail: requesterEmail, permission });
	} else {
		incoming[incomingIndex] = { ownerEmail: requesterEmail, permission };
	}
	await saveSharedWith(env, granteeEmail, incoming);

	return json(shares, { status: 201 });
}

async function handleDeleteShare(request: Request, env: Env, granteeEmail: string): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();

	const shares = await getShares(env, requesterEmail);
	await saveShares(
		env,
		requesterEmail,
		shares.filter((s) => s.granteeEmail !== granteeEmail),
	);

	const incoming = await getSharedWith(env, granteeEmail);
	await saveSharedWith(
		env,
		granteeEmail,
		incoming.filter((s) => s.ownerEmail !== requesterEmail),
	);

	return json({ ok: true });
}

async function handleGetSharedWithMe(request: Request, env: Env): Promise<Response> {
	const requesterEmail = getAuthenticatedEmail(request);
	if (!requesterEmail) return unauthorized();
	const incoming = await getSharedWith(env, requesterEmail);
	return json(incoming);
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
		const dishMatch = pathname.match(/^\/api\/dishes\/([^/]+)$/);
		if (dishMatch && method === "PUT") {
			return await handleUpdateDish(request, env, decodeURIComponent(dishMatch[1]));
		}
		if (dishMatch && method === "DELETE") {
			return await handleDeleteDish(request, env, decodeURIComponent(dishMatch[1]));
		}
		if (pathname === "/api/me" && method === "GET") {
			return await handleWhoAmI(request, env);
		}
		if (pathname === "/api/plan" && method === "GET") {
			return await handleGetPlan(request, env);
		}
		if (pathname === "/api/plan/generate" && method === "POST") {
			return await handleGeneratePlan(request, env);
		}
		if (pathname === "/api/plan/swap" && method === "POST") {
			return await handleSwapDish(request, env);
		}
		if (pathname === "/api/shares" && method === "GET") {
			return await handleGetShares(request, env);
		}
		if (pathname === "/api/shares" && method === "POST") {
			return await handlePostShare(request, env);
		}
		const shareMatch = pathname.match(/^\/api\/shares\/([^/]+)$/);
		if (shareMatch && method === "DELETE") {
			return await handleDeleteShare(request, env, decodeURIComponent(shareMatch[1]));
		}
		if (pathname === "/api/shared-with-me" && method === "GET") {
			return await handleGetSharedWithMe(request, env);
		}
		return json({ error: "Not found" }, { status: 404 });
	} catch (err) {
		return json({ error: "Errore interno", detail: String(err) }, { status: 500 });
	}
}

export function onRequest(context: EventContext<Env>): Promise<Response> {
	return handleRequest(context.request, context.env);
}
