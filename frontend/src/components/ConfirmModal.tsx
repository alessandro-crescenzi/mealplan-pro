import { Modal } from "./Modal";

interface ConfirmModalProps {
	title: string;
	message: string;
	confirmLabel: string;
	pending?: boolean;
	error?: string | null;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmModal({
	title,
	message,
	confirmLabel,
	pending,
	error,
	onConfirm,
	onCancel,
}: ConfirmModalProps) {
	return (
		<Modal title={title} onClose={onCancel}>
			<p className="confirm-modal__message">{message}</p>
			{error && <p className="app__status app__status--error">{error}</p>}
			<div className="modal__actions">
				<button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
					Annulla
				</button>
				<button type="button" className="btn btn--primary" onClick={onConfirm} disabled={pending}>
					{pending ? "Attendere…" : confirmLabel}
				</button>
			</div>
		</Modal>
	);
}
