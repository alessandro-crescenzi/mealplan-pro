import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "./Modal";
import type { Dish, DishCategory, DishType } from "../lib/types";

interface AddDishModalProps {
	onClose: () => void;
	onAdd: (input: { name: string; type: DishType; weekendOnly: boolean; category: DishCategory }) => Promise<Dish>;
}

export function AddDishModal({ onClose, onAdd }: AddDishModalProps) {
	const [name, setName] = useState("");
	const [category, setCategory] = useState<DishCategory>("piatto");
	const [type, setType] = useState<DishType>("pranzo");
	const [weekendOnly, setWeekendOnly] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			setError("Il nome è obbligatorio.");
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await onAdd({ name: name.trim(), type, weekendOnly, category });
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Modal title="Aggiungi ricetta" onClose={onClose}>
			<form className="dish-form" onSubmit={handleSubmit}>
				<label className="dish-form__field">
					<span>Categoria</span>
					<select value={category} onChange={(e) => setCategory(e.target.value as DishCategory)}>
						<option value="piatto">Piatto</option>
						<option value="contorno">Contorno</option>
					</select>
				</label>

				<label className="dish-form__field">
					<span>Nome</span>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={category === "contorno" ? "Es. Insalata mista" : "Es. Pasta alla norma"}
						autoFocus
					/>
				</label>

				{category === "piatto" && (
					<label className="dish-form__field">
						<span>Tipo</span>
						<select value={type} onChange={(e) => setType(e.target.value as DishType)}>
							<option value="pranzo">Pranzo</option>
							<option value="cena">Cena</option>
							<option value="entrambi">Entrambi</option>
						</select>
					</label>
				)}

				<label className="dish-form__checkbox">
					<input
						type="checkbox"
						checked={weekendOnly}
						onChange={(e) => setWeekendOnly(e.target.checked)}
					/>
					<span>Solo nel weekend (sabato/domenica)</span>
				</label>

				{error && <p className="app__status app__status--error">{error}</p>}

				<div className="modal__actions">
					<button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
						Annulla
					</button>
					<button type="submit" className="btn btn--primary" disabled={submitting}>
						{submitting ? "Aggiunta…" : "Aggiungi"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
