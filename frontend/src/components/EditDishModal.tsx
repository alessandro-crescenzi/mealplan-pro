import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "./Modal";
import type { Dish, DishType } from "../lib/types";

interface EditDishModalProps {
	dish: Dish;
	onClose: () => void;
	onSave: (id: string, input: { name: string; type: DishType }) => Promise<Dish>;
}

export function EditDishModal({ dish, onClose, onSave }: EditDishModalProps) {
	const [name, setName] = useState(dish.name);
	const [type, setType] = useState<DishType>(dish.type);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			setError("Il nome del piatto è obbligatorio.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await onSave(dish.id, { name: name.trim(), type });
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Modal title="Modifica ricetta" onClose={onClose}>
			<form className="dish-form" onSubmit={handleSubmit}>
				<label className="dish-form__field">
					<span>Nome del piatto</span>
					<input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
				</label>

				<label className="dish-form__field">
					<span>Tipo</span>
					<select value={type} onChange={(e) => setType(e.target.value as DishType)}>
						<option value="pranzo">Pranzo</option>
						<option value="cena">Cena</option>
						<option value="entrambi">Entrambi</option>
					</select>
				</label>

				{error && <p className="app__status app__status--error">{error}</p>}

				<div className="modal__actions">
					<button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
						Annulla
					</button>
					<button type="submit" className="btn btn--primary" disabled={submitting}>
						{submitting ? "Salvataggio…" : "Salva"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
