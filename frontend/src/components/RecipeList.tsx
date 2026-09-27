import { useState } from "react";
import { EditDishModal } from "./EditDishModal";
import { ConfirmModal } from "./ConfirmModal";
import type { Dish, DishType } from "../lib/types";

const TYPE_LABELS: Record<DishType, string> = {
	pranzo: "Pranzo",
	cena: "Cena",
	entrambi: "Entrambi",
};

interface RecipeListProps {
	dishes: Dish[];
	canDelete: boolean;
	onUpdate: (id: string, input: { name: string; type: DishType }) => Promise<Dish>;
	onDelete: (id: string) => Promise<void>;
}

export function RecipeList({ dishes, canDelete, onUpdate, onDelete }: RecipeListProps) {
	const [editingDish, setEditingDish] = useState<Dish | null>(null);
	const [deletingDish, setDeletingDish] = useState<Dish | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

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
			{dishes.map((dish) => (
				<div key={dish.id} className="recipe-list__row">
					<div className="recipe-list__info">
						<span className="recipe-list__name">{dish.name}</span>
						<span className="recipe-list__badge">{TYPE_LABELS[dish.type]}</span>
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
