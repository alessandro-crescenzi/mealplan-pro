import type { IncomingShare } from "../lib/types";

const SELF_OPTION = "__self__";

interface OwnerSwitcherProps {
	viewedOwnerEmail: string | null;
	sharedWithMe: IncomingShare[];
	onChange: (ownerEmail: string | null) => void;
}

export function OwnerSwitcher({ viewedOwnerEmail, sharedWithMe, onChange }: OwnerSwitcherProps) {
	if (sharedWithMe.length === 0) return null;

	return (
		<select
			className="owner-switcher"
			value={viewedOwnerEmail ?? SELF_OPTION}
			onChange={(e) => onChange(e.target.value === SELF_OPTION ? null : e.target.value)}
		>
			<option value={SELF_OPTION}>Il mio piano</option>
			{sharedWithMe.map((share) => (
				<option key={share.ownerEmail} value={share.ownerEmail}>
					{share.ownerEmail} ({share.permission === "edit" ? "modifica" : "sola lettura"})
				</option>
			))}
		</select>
	);
}
