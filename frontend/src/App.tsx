import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { WeekView } from "./components/WeekView";
import { AddDishModal } from "./components/AddDishModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { RecipeList } from "./components/RecipeList";
import { addDish, deleteDish, generatePlan, getDishes, getMe, getPlan, swapDish, updateDish } from "./lib/api";
import type { Dish, DishType, MealSlot, Plan } from "./lib/types";

function weekRangeLabel(plan: Plan): string {
	const start = new Date(`${plan.weekStart}T00:00:00`);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	const fmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
	return `${fmt(start)} – ${fmt(end)}`;
}

function App() {
	const [dishes, setDishes] = useState<Dish[]>([]);
	const [plan, setPlan] = useState<Plan | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [view, setView] = useState<"plan" | "recipes">("plan");
	const [canDelete, setCanDelete] = useState(false);

	const [isAddModalOpen, setAddModalOpen] = useState(false);
	const [isRegenerateModalOpen, setRegenerateModalOpen] = useState(false);
	const [regenerating, setRegenerating] = useState(false);
	const [regenerateError, setRegenerateError] = useState<string | null>(null);
	const [swapError, setSwapError] = useState<string | null>(null);

	useEffect(() => {
		Promise.all([getDishes(), getPlan()])
			.then(([dishesResult, planResult]) => {
				setDishes(dishesResult);
				setPlan(planResult);
			})
			.catch((err: Error) => setError(err.message))
			.finally(() => setLoading(false));
		getMe()
			.then((me) => setCanDelete(me.canDelete))
			.catch(() => setCanDelete(false));
	}, []);

	const dishesById = useMemo(
		() => Object.fromEntries(dishes.map((d) => [d.id, d])),
		[dishes],
	);

	async function handleAddDish(input: { name: string; type: DishType; weekendOnly: boolean }): Promise<Dish> {
		const dish = await addDish(input);
		setDishes((prev) => [...prev, dish]);
		return dish;
	}

	async function handleConfirmRegenerate() {
		setRegenerating(true);
		setRegenerateError(null);
		try {
			const newPlan = await generatePlan();
			setPlan(newPlan);
			setRegenerateModalOpen(false);
		} catch (err) {
			setRegenerateError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setRegenerating(false);
		}
	}

	async function handleSwap(date: string, slot: MealSlot, dishId: string) {
		if (!dishId) return;
		setSwapError(null);
		try {
			const newPlan = await swapDish({ date, slot, dishId });
			setPlan(newPlan);
		} catch (err) {
			setSwapError(err instanceof Error ? err.message : "Errore imprevisto.");
		}
	}

	async function handleUpdateDish(id: string, input: { name: string; type: DishType }): Promise<Dish> {
		const updated = await updateDish(id, input);
		setDishes((prev) => prev.map((d) => (d.id === id ? updated : d)));
		return updated;
	}

	async function handleDeleteDish(id: string): Promise<void> {
		await deleteDish(id);
		setDishes((prev) => prev.filter((d) => d.id !== id));
	}

	return (
		<div className="app">
			<header className="app__header">
				<div className="app__header-row">
					<div>
						<h1>Piano pasti</h1>
						{view === "plan" && plan && <p className="app__week-range">{weekRangeLabel(plan)}</p>}
					</div>
					<div className="app__actions">
						<button
							type="button"
							className="btn btn--ghost"
							onClick={() => setView(view === "plan" ? "recipes" : "plan")}
						>
							{view === "plan" ? "Gestisci ricette" : "Torna al piano"}
						</button>
						{view === "plan" && (
							<>
								<button type="button" className="btn btn--ghost" onClick={() => setAddModalOpen(true)}>
									Aggiungi piatto
								</button>
								<button
									type="button"
									className="btn btn--primary"
									onClick={() => setRegenerateModalOpen(true)}
								>
									Rigenera piano
								</button>
							</>
						)}
					</div>
				</div>
				{view === "plan" && swapError && <p className="app__status app__status--error">{swapError}</p>}
			</header>

			<main className="app__main">
				{loading && <p className="app__status">Caricamento…</p>}
				{error && <p className="app__status app__status--error">Errore: {error}</p>}
				{!loading && !error && view === "plan" && !plan && (
					<p className="app__status">Nessun piano attivo. Genera il primo piano della settimana.</p>
				)}
				{!loading && !error && view === "plan" && plan && (
					<WeekView plan={plan} dishes={dishes} dishesById={dishesById} onSwap={handleSwap} />
				)}
				{!loading && !error && view === "recipes" && (
					<RecipeList
						dishes={dishes}
						canDelete={canDelete}
						onUpdate={handleUpdateDish}
						onDelete={handleDeleteDish}
					/>
				)}
			</main>

			{isAddModalOpen && (
				<AddDishModal onClose={() => setAddModalOpen(false)} onAdd={handleAddDish} />
			)}

			{isRegenerateModalOpen && (
				<ConfirmModal
					title="Rigenera piano"
					message="Generare un nuovo piano casuale sovrascriverà quello attuale. Continuare?"
					confirmLabel="Rigenera"
					pending={regenerating}
					error={regenerateError}
					onConfirm={handleConfirmRegenerate}
					onCancel={() => setRegenerateModalOpen(false)}
				/>
			)}
		</div>
	);
}

export default App;
