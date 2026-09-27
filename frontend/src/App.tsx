import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { WeekView } from "./components/WeekView";
import { AddDishModal } from "./components/AddDishModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { RecipeList } from "./components/RecipeList";
import { OwnerSwitcher } from "./components/OwnerSwitcher";
import { ShareModal } from "./components/ShareModal";
import {
	addDish,
	addShare,
	deleteDish,
	generatePlan,
	getDishes,
	getMe,
	getPlan,
	getShares,
	getSharedWithMe,
	removeShare,
	swapDish,
	updateDish,
} from "./lib/api";
import { addDays, mondayOf } from "./lib/week";
import type { Dish, DishType, IncomingShare, MealSlot, Permission, Plan, ShareEntry } from "./lib/types";

function weekRangeLabel(weekStart: string): string {
	const start = new Date(`${weekStart}T00:00:00`);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	const fmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
	return `${fmt(start)} – ${fmt(end)}`;
}

function App() {
	const [dishes, setDishes] = useState<Dish[]>([]);
	const [plan, setPlan] = useState<Plan | null>(null);
	const [loading, setLoading] = useState(true);
	const [planLoading, setPlanLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [view, setView] = useState<"plan" | "recipes">("plan");
	const [canDelete, setCanDelete] = useState(false);

	const [isAddModalOpen, setAddModalOpen] = useState(false);
	const [isRegenerateModalOpen, setRegenerateModalOpen] = useState(false);
	const [isShareModalOpen, setShareModalOpen] = useState(false);
	const [regenerating, setRegenerating] = useState(false);
	const [regenerateError, setRegenerateError] = useState<string | null>(null);
	const [swapError, setSwapError] = useState<string | null>(null);
	const [shares, setShares] = useState<ShareEntry[]>([]);

	const currentWeekStart = useMemo(() => mondayOf(new Date()), []);
	const nextWeekStart = useMemo(() => addDays(currentWeekStart, 7), [currentWeekStart]);
	const [viewedWeekStart, setViewedWeekStart] = useState(currentWeekStart);
	const [viewedOwnerEmail, setViewedOwnerEmail] = useState<string | null>(null);
	const [sharedWithMe, setSharedWithMe] = useState<IncomingShare[]>([]);
	const isFirstLoad = useRef(true);
	const isOwnPlan = viewedOwnerEmail === null;
	const canEditViewedPlan =
		isOwnPlan || sharedWithMe.some((s) => s.ownerEmail === viewedOwnerEmail && s.permission === "edit");

	useEffect(() => {
		if (isFirstLoad.current) {
			isFirstLoad.current = false;
			Promise.all([getDishes(), getPlan(viewedWeekStart, viewedOwnerEmail ?? undefined)])
				.then(([dishesResult, planResult]) => {
					setDishes(dishesResult);
					setPlan(planResult);
				})
				.catch((err: Error) => setError(err.message))
				.finally(() => setLoading(false));
			getMe()
				.then((me) => setCanDelete(me.canDelete))
				.catch(() => setCanDelete(false));
			getSharedWithMe()
				.then(setSharedWithMe)
				.catch(() => setSharedWithMe([]));
			getShares()
				.then(setShares)
				.catch(() => setShares([]));
			return;
		}
		setPlanLoading(true);
		getPlan(viewedWeekStart, viewedOwnerEmail ?? undefined)
			.then(setPlan)
			.catch((err: Error) => setError(err.message))
			.finally(() => setPlanLoading(false));
	}, [viewedWeekStart, viewedOwnerEmail]);

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
			const newPlan = await generatePlan(viewedWeekStart, viewedOwnerEmail ?? undefined);
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
			const newPlan = await swapDish({
				weekStart: viewedWeekStart,
				date,
				slot,
				dishId,
				ownerEmail: viewedOwnerEmail ?? undefined,
			});
			setPlan(newPlan);
		} catch (err) {
			setSwapError(err instanceof Error ? err.message : "Errore imprevisto.");
		}
	}

	async function handleAddShare(granteeEmail: string, permission: Permission): Promise<void> {
		const updated = await addShare({ granteeEmail, permission });
		setShares(updated);
	}

	async function handleRemoveShare(granteeEmail: string): Promise<void> {
		await removeShare(granteeEmail);
		setShares((prev) => prev.filter((s) => s.granteeEmail !== granteeEmail));
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
						{view === "plan" && (
							<p className="app__week-range">
								{weekRangeLabel(viewedWeekStart)}
								{planLoading && " · aggiornamento…"}
							</p>
						)}
					</div>
					<div className="app__actions">
						{view === "plan" && (
							<div className="app__week-nav">
								<button
									type="button"
									className="btn btn--ghost"
									disabled={viewedWeekStart === currentWeekStart}
									onClick={() => setViewedWeekStart(currentWeekStart)}
								>
									‹ Settimana attuale
								</button>
								<button
									type="button"
									className="btn btn--ghost"
									disabled={viewedWeekStart === nextWeekStart}
									onClick={() => setViewedWeekStart(nextWeekStart)}
								>
									Settimana successiva ›
								</button>
							</div>
						)}
						{view === "plan" && (
							<OwnerSwitcher
								viewedOwnerEmail={viewedOwnerEmail}
								sharedWithMe={sharedWithMe}
								onChange={setViewedOwnerEmail}
							/>
						)}
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
								{isOwnPlan && (
									<button type="button" className="btn btn--ghost" onClick={() => setShareModalOpen(true)}>
										Condividi piano
									</button>
								)}
								{canEditViewedPlan && (
									<button
										type="button"
										className="btn btn--primary"
										onClick={() => setRegenerateModalOpen(true)}
									>
										Rigenera piano
									</button>
								)}
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
					<p className="app__status">
						{canEditViewedPlan
							? "Nessun piano per questa settimana. Genera il primo piano."
							: "Nessun piano per questa settimana."}
					</p>
				)}
				{!loading && !error && view === "plan" && plan && (
					<WeekView
						plan={plan}
						dishes={dishes}
						dishesById={dishesById}
						onSwap={handleSwap}
						readOnly={!canEditViewedPlan}
					/>
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
					message={`Generare un nuovo piano casuale sovrascriverà quello della settimana ${weekRangeLabel(viewedWeekStart)}. Continuare?`}
					confirmLabel="Rigenera"
					pending={regenerating}
					error={regenerateError}
					onConfirm={handleConfirmRegenerate}
					onCancel={() => setRegenerateModalOpen(false)}
				/>
			)}

			{isShareModalOpen && (
				<ShareModal
					shares={shares}
					onClose={() => setShareModalOpen(false)}
					onAdd={handleAddShare}
					onRemove={handleRemoveShare}
				/>
			)}
		</div>
	);
}

export default App;
