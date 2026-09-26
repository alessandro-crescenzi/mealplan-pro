import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "./Modal";
import type { Dish, DishType } from "../lib/types";

interface AddDishModalProps {
	onClose: () => void;
	onAdd: (input: { name: string; type: DishType; weekendOnly: boolean }) => Promise<Dish>;
}

export function AddDishModal({ onClose, onAdd }: AddDishModalProps) {
	const [name, setName] = useState("");
	const [type, setType] = useState<DishType>("pranzo");
	const [weekendOnly, setWeekendOnly] = useState(false);
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
			await onAdd({ name: name.trim(), type, weekendOnly });
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Modal title="Aggiungi piatto" onClose={onClose}>
			<form className="dish-form" onSubmit={handleSubmit}>
				<label className="dish-form__field">
					<span>Nome del piatto</span>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Es. Pasta alla norma"
						autoFocus
					/>
				</label>

				<label className="dish-form__field">
					<span>Tipo</span>
					<select value={type} onChange={(e) => setType(e.target.value as DishType)}>
						<option value="pranzo">Pranzo</option>
						<option value="cena">Cena</option>
						<option value="entrambi">Entrambi</option>
					</select>
				</label>

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
