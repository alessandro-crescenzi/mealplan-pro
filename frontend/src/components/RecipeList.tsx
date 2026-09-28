import { useMemo, useState } from "react";
import { EditDishModal } from "./EditDishModal";
import { ConfirmModal } from "./ConfirmModal";
import type { Dish, DishCategory, DishType } from "../lib/types";

const TYPE_LABELS: Record<DishType, string> = {
	pranzo: "Pranzo",
	cena: "Cena",
	entrambi: "Entrambi",
};

interface RecipeListProps {
	dishes: Dish[];
	canDelete: boolean;
	onUpdate: (id: string, input: { name: string; type: DishType; category: DishCategory }) => Promise<Dish>;
	onDelete: (id: string) => Promise<void>;
}

interface Filters {
	pranzo: boolean;
	cena: boolean;
	contorni: boolean;
}

export function RecipeList({ dishes, canDelete, onUpdate, onDelete }: RecipeListProps) {
	const [editingDish, setEditingDish] = useState<Dish | null>(null);
	const [deletingDish, setDeletingDish] = useState<Dish | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [filters, setFilters] = useState<Filters>({ pranzo: true, cena: true, contorni: true });

	const visibleDishes = useMemo(
		() =>
			dishes.filter((dish) => {
				if (dish.category === "contorno") return filters.contorni;
				if (dish.type === "entrambi") return filters.pranzo || filters.cena;
				if (dish.type === "pranzo") return filters.pranzo;
				return filters.cena;
			}),
		[dishes, filters],
	);

	function toggleFilter(key: keyof Filters) {
		setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
	}

	async function handleConfirmDelete() {
		if (!deletingDish) return;
		setDeleting(true);
		setDeleteError(null);
		try {
			await onDelete(deletingDish.id);
			setDeletingDish(null);
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setDeleting(false);
		}
	}

	if (dishes.length === 0) {
		return <p className="app__status">Nessuna ricetta nel database.</p>;
	}

	return (
		<div className="recipe-list">
			<div className="recipe-list__filters">
				<label className="recipe-list__filter">
					<input type="checkbox" checked={filters.pranzo} onChange={() => toggleFilter("pranzo")} />
					<span>Pranzo</span>
				</label>
				<label className="recipe-list__filter">
					<input type="checkbox" checked={filters.cena} onChange={() => toggleFilter("cena")} />
					<span>Cena</span>
				</label>
				<label className="recipe-list__filter">
					<input type="checkbox" checked={filters.contorni} onChange={() => toggleFilter("contorni")} />
					<span>Contorni</span>
				</label>
			</div>

			{visibleDishes.length === 0 && <p className="app__status">Nessuna ricetta per i filtri selezionati.</p>}

			{visibleDishes.map((dish) => (
				<div key={dish.id} className="recipe-list__row">
					<div className="recipe-list__info">
						<span className="recipe-list__name">{dish.name}</span>
						<span className="recipe-list__badge">
							{dish.category === "contorno" ? "Contorno" : TYPE_LABELS[dish.type]}
						</span>
						{dish.weekendOnly && (
							<span className="recipe-list__badge recipe-list__badge--weekend">Weekend</span>
						)}
					</div>
					<div className="recipe-list__actions">
						<button type="button" className="btn btn--ghost" onClick={() => setEditingDish(dish)}>
							Modifica
						</button>
						{canDelete && (
							<button type="button" className="btn btn--danger" onClick={() => setDeletingDish(dish)}>
								Elimina
							</button>
						)}
					</div>
				</div>
			))}

			{editingDish && (
				<EditDishModal dish={editingDish} onClose={() => setEditingDish(null)} onSave={onUpdate} />
			)}

			{deletingDish && (
				<ConfirmModal
					title="Elimina ricetta"
					message={`Eliminare definitivamente "${deletingDish.name}"? L'operazione non è reversibile.`}
					confirmLabel="Elimina"
					pending={deleting}
					error={deleteError}
					onConfirm={handleConfirmDelete}
					onCancel={() => setDeletingDish(null)}
				/>
			)}
		</div>
	);
}
