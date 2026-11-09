import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { shareShoppingList } from "../lib/api";
import { bringImportUrl } from "../lib/bring";
import { buildShoppingList, dishesMissingIngredients, formatShoppingList } from "../lib/shoppingList";
import type { Dish, Plan } from "../lib/types";

interface ShoppingListModalProps {
	plan: Plan;
	dishesById: Record<string, Dish>;
	weekLabel: string;
	onClose: () => void;
}

export function ShoppingListModal({ plan, dishesById, weekLabel, onClose }: ShoppingListModalProps) {
	const items = useMemo(() => buildShoppingList(plan, dishesById), [plan, dishesById]);
	const missing = useMemo(() => dishesMissingIngredients(plan, dishesById), [plan, dishesById]);
	const [copied, setCopied] = useState(false);
	const [openingBring, setOpeningBring] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const text = formatShoppingList(items);
	const title = `Lista della spesa · ${weekLabel}`;
	const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

	async function handleCopy() {
		setError(null);
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError("Impossibile copiare negli appunti.");
		}
	}

	async function handleShare() {
		setError(null);
		try {
			await navigator.share({ title, text });
		} catch (err) {
			// The user dismissing the share sheet is not an error.
			if (err instanceof DOMException && err.name === "AbortError") return;
			setError("Impossibile condividere la lista.");
		}
	}

	async function handleOpenBring() {
		setError(null);
		setOpeningBring(true);
		// Open the tab synchronously (inside the click) so popup blockers allow it; navigate it once the
		// public link exists. Falls back to this tab if the browser refuses the popup.
		const tab = window.open("", "_blank");
		try {
			const { url } = await shareShoppingList({ title, items });
			const target = bringImportUrl(url);
			if (tab) tab.location.href = target;
			else window.location.href = target;
		} catch (err) {
			tab?.close();
			setError(err instanceof Error ? err.message : "Impossibile aprire Bring!.");
		} finally {
			setOpeningBring(false);
		}
	}

	return (
		<Modal title={title} onClose={onClose}>
			{items.length === 0 ? (
				<p className="app__status">Nessun ingrediente nel piano di questa settimana.</p>
			) : (
				<ul className="shopping-list">
					{items.map((item) => (
						<li key={item.name.toLowerCase()} className="shopping-list__item">
							<span>{item.name}</span>
							{item.count > 1 && <span className="shopping-list__count">x{item.count}</span>}
						</li>
					))}
				</ul>
			)}

			{missing.length > 0 && (
				<p className="app__status">
					Senza ingredienti (non inclusi nella lista): {missing.map((d) => d.name).join(", ")}.
				</p>
			)}

			{error && <p className="app__status app__status--error">{error}</p>}

			<div className="modal__actions">
				<button type="button" className="btn btn--ghost" onClick={onClose}>
					Chiudi
				</button>
				<button
					type="button"
					className="btn btn--ghost"
					onClick={handleOpenBring}
					disabled={items.length === 0 || openingBring}
				>
					{openingBring ? "Apertura…" : "Apri in Bring!"}
				</button>
				{canShare && (
					<button type="button" className="btn btn--ghost" onClick={handleShare} disabled={items.length === 0}>
						Condividi
					</button>
				)}
				<button type="button" className="btn btn--primary" onClick={handleCopy} disabled={items.length === 0}>
					{copied ? "Copiata!" : "Copia"}
				</button>
			</div>
		</Modal>
	);
}
