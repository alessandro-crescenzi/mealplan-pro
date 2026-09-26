import type { ReactNode } from "react";

interface ModalProps {
	title: string;
	onClose: () => void;
	children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
				<header className="modal__header">
					<h2>{title}</h2>
					<button type="button" className="modal__close" onClick={onClose} aria-label="Chiudi">
						×
					</button>
				</header>
				<div className="modal__body">{children}</div>
			</div>
		</div>
	);
}
