import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "./Modal";
import type { Permission, ShareEntry } from "../lib/types";

interface ShareModalProps {
	shares: ShareEntry[];
	onClose: () => void;
	onAdd: (granteeEmail: string, permission: Permission) => Promise<void>;
	onRemove: (granteeEmail: string) => Promise<void>;
}

export function ShareModal({ shares, onClose, onAdd, onRemove }: ShareModalProps) {
	const [email, setEmail] = useState("");
	const [permission, setPermission] = useState<Permission>("view");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!email.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			await onAdd(email.trim(), permission);
			setEmail("");
			setPermission("view");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Errore imprevisto.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Modal title="Condividi piano" onClose={onClose}>
			{shares.length === 0 ? (
				<p className="app__status">Non hai ancora condiviso il piano con nessuno.</p>
			) : (
				<ul className="share-list">
					{shares.map((share) => (
						<li key={share.granteeEmail} className="share-list__row">
							<span>{share.granteeEmail}</span>
							<span className="recipe-list__badge">
								{share.permission === "edit" ? "Modifica" : "Sola lettura"}
							</span>
							<button
								type="button"
								className="btn btn--danger"
								onClick={() => onRemove(share.granteeEmail)}
							>
								Rimuovi
							</button>
						</li>
					))}
				</ul>
			)}

			<form className="dish-form" onSubmit={handleSubmit}>
				<label className="dish-form__field">
					<span>Email</span>
					<input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="persona@esempio.com"
						autoFocus
					/>
				</label>
				<label className="dish-form__field">
					<span>Permesso</span>
					<select value={permission} onChange={(e) => setPermission(e.target.value as Permission)}>
						<option value="view">Sola lettura</option>
						<option value="edit">Modifica</option>
					</select>
				</label>
				{error && <p className="app__status app__status--error">{error}</p>}
				<div className="modal__actions">
					<button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
						Chiudi
					</button>
					<button type="submit" className="btn btn--primary" disabled={submitting}>
						{submitting ? "Condivisione…" : "Condividi"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
