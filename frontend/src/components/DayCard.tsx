import type { Dish, MealSlot, PlanDay } from "../lib/types";
import { contorniForDay, dishesForSlot } from "../lib/planLogic";

interface DayCardProps {
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
	onContornoChange: (date: string, slot: MealSlot, dishId: string | null) => void;
	readOnly?: boolean;
}

function formatDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

function ContornoRow({
	slot,
	day,
	dishes,
	dishesById,
	onContornoChange,
	readOnly,
}: {
	slot: MealSlot;
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onContornoChange: (date: string, slot: MealSlot, dishId: string | null) => void;
	readOnly?: boolean;
}) {
	const field = slot === "pranzo" ? "pranzoContorno" : "cenaContorno";
	const currentId = day[field];
	const current = currentId ? dishesById[currentId] : null;

	if (readOnly) {
		if (!current) return null;
		return (
			<div className="day-card__meal day-card__contorno">
				<span className="day-card__label day-card__label--sub">Contorno</span>
				<p className="day-card__dish">{current.name}</p>
			</div>
		);
	}

	const options = contorniForDay(dishes, day.isWeekend);
	const optionsWithCurrent =
		current && !options.some((d) => d.id === current.id) ? [...options, current] : options;

	return (
		<div className="day-card__meal day-card__contorno">
			<span className="day-card__label day-card__label--sub">Contorno</span>
			<select
				className="day-card__select"
				value={currentId ?? ""}
				onChange={(e) => onContornoChange(day.date, slot, e.target.value || null)}
			>
				<option value="">—</option>
				{optionsWithCurrent.map((dish) => (
					<option key={dish.id} value={dish.id}>
						{dish.name}
					</option>
				))}
			</select>
		</div>
	);
}

function MealSlotRow({
	label,
	slot,
	day,
	dishes,
	dishesById,
	onSwap,
	onContornoChange,
	readOnly,
}: {
	label: string;
	slot: MealSlot;
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
	onContornoChange: (date: string, slot: MealSlot, dishId: string | null) => void;
	readOnly?: boolean;
}) {
	const currentId = day[slot];
	const current = currentId ? dishesById[currentId] : null;

	if (readOnly) {
		return (
			<>
				<div className="day-card__meal">
					<span className="day-card__label">{label}</span>
					<p className="day-card__dish">{current?.name ?? "—"}</p>
				</div>
				<ContornoRow
					slot={slot}
					day={day}
					dishes={dishes}
					dishesById={dishesById}
					onContornoChange={onContornoChange}
					readOnly={readOnly}
				/>
			</>
		);
	}

	const options = dishesForSlot(dishes, slot, day.isWeekend);
	const optionsWithCurrent =
		current && !options.some((d) => d.id === current.id) ? [...options, current] : options;

	return (
		<>
			<div className="day-card__meal">
				<span className="day-card__label">{label}</span>
				{optionsWithCurrent.length > 0 ? (
					<select
						className="day-card__select"
						value={currentId ?? ""}
						onChange={(e) => onSwap(day.date, slot, e.target.value)}
					>
						{!currentId && <option value="">—</option>}
						{optionsWithCurrent.map((dish) => (
							<option key={dish.id} value={dish.id}>
								{dish.name}
							</option>
						))}
					</select>
				) : (
					<p className="day-card__dish">—</p>
				)}
			</div>
			<ContornoRow
				slot={slot}
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onContornoChange={onContornoChange}
				readOnly={readOnly}
			/>
		</>
	);
}

export function DayCard({ day, dishes, dishesById, onSwap, onContornoChange, readOnly }: DayCardProps) {
	return (
		<article className={`day-card${day.isWeekend ? " day-card--weekend" : ""}`}>
			<header className="day-card__header">
				<h3>{day.dayName}</h3>
				<span className="day-card__date">{formatDate(day.date)}</span>
			</header>

			<MealSlotRow
				label="Pranzo"
				slot="pranzo"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
				onContornoChange={onContornoChange}
				readOnly={readOnly}
			/>
			<MealSlotRow
				label="Cena"
				slot="cena"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
				onContornoChange={onContornoChange}
				readOnly={readOnly}
			/>
		</article>
	);
}
