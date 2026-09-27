interface UserBadgeProps {
	email: string | null;
}

export function UserBadge({ email }: UserBadgeProps) {
	if (!email) return null;

	return (
		<div className="user-badge">
			<span className="user-badge__icon" aria-hidden="true">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="12" cy="8" r="4" />
					<path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" />
				</svg>
			</span>
			<span className="user-badge__email">{email}</span>
		</div>
	);
}
