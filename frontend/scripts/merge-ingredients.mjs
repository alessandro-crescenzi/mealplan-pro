#!/usr/bin/env node
// Safely copies `ingredients` from data/dishes.seed.json into the dishes stored in Cloudflare KV.
//
//   node scripts/merge-ingredients.mjs --remote            # dry run against production
//   node scripts/merge-ingredients.mjs --remote --apply    # write to production
//   node scripts/merge-ingredients.mjs --local [--apply]   # same, against local KV
//
// Ingredients come from data/dishes.seed.json plus data/ingredients.extra.json (id -> ingredients,
// for dishes that only exist in production). The seed wins if an id appears in both.
//
// Rules: dishes are matched by id; only dishes with no ingredients are filled in; existing
// ingredients and every other field are left alone; dishes are never added or removed.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BINDING = "MEALPLAN_KV";
const KEY = "dishes";

function hasIngredients(dish) {
	return Array.isArray(dish.ingredients) && dish.ingredients.length > 0;
}

export function mergeIngredients(prodDishes, seedDishes) {
	const seedById = new Map(seedDishes.map((d) => [d.id, d]));
	const prodIds = new Set(prodDishes.map((d) => d.id));
	const updated = [];
	const alreadyHad = [];
	const notInSeed = [];

	const merged = prodDishes.map((dish) => {
		if (hasIngredients(dish)) {
			alreadyHad.push(dish.id);
			return dish;
		}
		const seed = seedById.get(dish.id);
		if (!seed || !hasIngredients(seed)) {
			notInSeed.push(dish.id);
			return dish;
		}
		updated.push(dish.id);
		return { ...dish, ingredients: [...seed.ingredients] };
	});

	const seedOnly = seedDishes.filter((d) => !prodIds.has(d.id)).map((d) => d.id);
	return { merged, updated, alreadyHad, notInSeed, seedOnly };
}

function parseArgs(argv) {
	const args = { target: null, apply: false, persistTo: null };
	for (const arg of argv) {
		if (arg === "--remote" || arg === "--local") args.target = arg;
		else if (arg === "--apply") args.apply = true;
		else if (arg.startsWith("--persist-to=")) args.persistTo = arg.slice("--persist-to=".length);
		else throw new Error(`Argomento sconosciuto: ${arg}`);
	}
	if (!args.target) throw new Error("Indica --remote (produzione) oppure --local.");
	if (args.persistTo && args.target !== "--local") throw new Error("--persist-to vale solo con --local.");
	return args;
}

function wrangler(args, wranglerArgs) {
	const extra = args.persistTo ? [`--persist-to=${args.persistTo}`] : [];
	return execFileSync("npx", ["wrangler", ...wranglerArgs, args.target, ...extra], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
		maxBuffer: 50 * 1024 * 1024,
	});
}

function fetchDishes(args) {
	const raw = wrangler(args, ["kv", "key", "get", KEY, `--binding=${BINDING}`, "--text"]);
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("La chiave 'dishes' non contiene JSON valido (o non esiste): mi fermo senza scrivere.");
	}
	if (!Array.isArray(parsed)) throw new Error("La chiave 'dishes' non è un elenco: mi fermo senza scrivere.");
	return { raw, dishes: parsed };
}

function printIds(label, ids) {
	console.log(`${label}: ${ids.length}${ids.length ? ` (${ids.join(", ")})` : ""}`);
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const dataDir = join(root, "..", "data");
	const seed = JSON.parse(readFileSync(join(dataDir, "dishes.seed.json"), "utf8"));
	const extra = JSON.parse(readFileSync(join(dataDir, "ingredients.extra.json"), "utf8"));
	const seedIds = new Set(seed.map((d) => d.id));
	const sources = [
		...seed,
		...Object.entries(extra)
			.filter(([id]) => !seedIds.has(id))
			.map(([id, ingredients]) => ({ id, ingredients })),
	];

	const where = args.target === "--remote" ? "PRODUZIONE" : "locale";
	console.log(`Ambiente: ${where}${args.apply ? " (scrittura)" : " (dry run, non scrivo nulla)"}`);

	const { raw, dishes } = fetchDishes(args);
	const result = mergeIngredients(dishes, sources);

	console.log(`Ricette nel KV: ${dishes.length}`);
	printIds("Aggiornate con ingredienti", result.updated);
	printIds("Già con ingredienti (non toccate)", result.alreadyHad);
	printIds("Senza ingredienti nel seed (restano vuote)", result.notInSeed);
	printIds("Nelle fonti ma non nel KV (non aggiunte)", result.seedOnly);

	if (result.updated.length === 0) {
		console.log("Niente da fare.");
		return;
	}
	if (!args.apply) {
		console.log("Dry run: aggiungi --apply per scrivere.");
		return;
	}

	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupDir = join(root, ".wrangler", "backups");
	mkdirSync(backupDir, { recursive: true });
	const backupPath = join(backupDir, `dishes-${args.target.slice(2)}-${stamp}.json`);
	writeFileSync(backupPath, raw);
	console.log(`Backup: ${backupPath}`);

	// Abort if someone changed the dishes while we were merging: the put replaces the whole key.
	if (fetchDishes(args).raw !== raw) {
		throw new Error("Le ricette sono cambiate durante l'unione: nessuna scrittura. Riprova.");
	}

	const mergedPath = join(backupDir, `dishes-${args.target.slice(2)}-${stamp}.merged.json`);
	writeFileSync(mergedPath, JSON.stringify(result.merged));
	wrangler(args, ["kv", "key", "put", KEY, `--binding=${BINDING}`, `--path=${mergedPath}`]);
	console.log(`Scritto: ${result.updated.length} ricette aggiornate.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		main();
	} catch (err) {
		console.error(`Errore: ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	}
}
