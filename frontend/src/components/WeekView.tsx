import type { Dish, MealSlot, Plan } from "../lib/types";
import { DayCard } from "./DayCard";

interface WeekViewProps {
	plan: Plan;
	dishes: Dish[];
	dishesById: Record<string, Dish>;
	onSwap: (date: string, slot: MealSlot, dishId: string) => void;
	readOnly?: boolean;
}

export function WeekView({ plan, dishes, dishesById, onSwap, readOnly }: WeekViewProps) {
	return (
		<div className="week-grid">
			{plan.days.map((day) => (
				<DayCard
					key={day.date}
					day={day}
					dishes={dishes}
					dishesById={dishesById}
					onSwap={onSwap}
					readOnly={readOnly}
				/>
			))}
		</div>
	);
}
