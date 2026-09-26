import type { Dish, MealSlot, PlanDay } from "../lib/types";
import { dishesForSlot } from "../lib/planLogic";

interface DayCardProps {
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
}

function formatDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

function MealSlotRow({
	label,
	slot,
	day,
	dishes,
	dishesById,
	onSwap,
}: {
	label: string;
	slot: MealSlot;
	day: PlanDay;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
}) {
	const currentId = day[slot];
	const current = currentId ? dishesById[currentId] : null;
	const options = dishesForSlot(dishes, slot, day.isWeekend);
	const optionsWithCurrent =
		current && !options.some((d) => d.id === current.id) ? [...options, current] : options;

	return (
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
	);
}

export function DayCard({ day, dishes, dishesById, onSwap }: DayCardProps) {
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
			/>
			<MealSlotRow
				label="Cena"
				slot="cena"
				day={day}
				dishes={dishes}
				dishesById={dishesById}
				onSwap={onSwap}
			/>
		</article>
	);
}
