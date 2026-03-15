'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { ChefHat, Calendar, Plus, ShoppingCart, RotateCcw, Heart } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useHeaderActions } from '@/components/HeaderContext';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DishComponent {
  id: number;
  slot_category: 'carbohydrate' | 'protein' | 'vegetable';
  ingredient_id: number | null;
  recipe_id: number | null;
  ingredient?: { id: number; name: string; category: string } | null;
  recipe?: { id: number; name: string } | null;
  quantity?: number | null;
  unit?: string | null;
}

interface Dish {
  id: number;
  name: string;
  description?: string | null;
  instructions?: string | null;
  user_id?: string | null;
  healthiness_score?: number | null;
  components: DishComponent[];
}

interface DayMeals {
  lunch: Dish | null;
  dinner: Dish | null;
}

type WeeklyPlan = Record<string, DayMeals>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = [
  { key: 'monday', label: 'Lunedì' },
  { key: 'tuesday', label: 'Martedì' },
  { key: 'wednesday', label: 'Mercoledì' },
  { key: 'thursday', label: 'Giovedì' },
  { key: 'friday', label: 'Venerdì' },
  { key: 'saturday', label: 'Sabato' },
  { key: 'sunday', label: 'Domenica' },
];

const SLOT_ICONS: Record<string, string> = {
  carbohydrate: '🍝',
  protein: '🥩',
  vegetable: '🥬',
};

function getSlotLabel(dish: Dish, category: 'carbohydrate' | 'protein' | 'vegetable'): string | null {
  const comp = dish.components.find(c => c.slot_category === category);
  if (!comp) return null;
  return comp.ingredient?.name ?? comp.recipe?.name ?? null;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-green-100 text-green-800';
  if (score >= 40) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

// ---------------------------------------------------------------------------
// localStorage helpers for weekly plan persistence
// ---------------------------------------------------------------------------

function getWeekKey(userId: string): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `weeklyPlan_${userId}_${now.getFullYear()}_w${week}`;
}

function loadPlanFromStorage(userId: string): WeeklyPlan | null {
  try {
    const raw = localStorage.getItem(getWeekKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePlanToStorage(userId: string, plan: WeeklyPlan): void {
  try {
    localStorage.setItem(getWeekKey(userId), JSON.stringify(plan));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function generateWeeklyPlan(dishes: Dish[]): WeeklyPlan {
  if (dishes.length === 0) {
    return Object.fromEntries(DAYS.map(d => [d.key, { lunch: null, dinner: null }]));
  }
  // Distribute dishes as evenly as possible across the 14 slots (7 days × 2 meals)
  const pool = [...dishes];
  const plan: WeeklyPlan = {};
  let idx = 0;
  DAYS.forEach(day => {
    plan[day.key] = {
      lunch:  pool[idx % pool.length],
      dinner: pool[(idx + 1) % pool.length],
    };
    idx += 2;
  });
  return plan;
}

function randomizePlan(dishes: Dish[]): WeeklyPlan {
  if (dishes.length === 0) {
    return Object.fromEntries(DAYS.map(d => [d.key, { lunch: null, dinner: null }]));
  }
  const plan: WeeklyPlan = {};
  DAYS.forEach(day => {
    const shuffled = [...dishes].sort(() => Math.random() - 0.5);
    plan[day.key] = {
      lunch: shuffled[0] ?? null,
      dinner: shuffled[1] ?? shuffled[0] ?? null,
    };
  });
  return plan;
}

function getShoppingItems(plan: WeeklyPlan): string[] {
  const items = new Set<string>();
  Object.values(plan).forEach(({ lunch, dinner }) => {
    [lunch, dinner].forEach(dish => {
      if (!dish) return;
      dish.components.forEach(c => {
        if (c.ingredient?.name) items.add(c.ingredient.name);
        else if (c.recipe?.name) items.add(`${c.recipe.name} (ricetta)`);
      });
    });
  });
  return Array.from(items).sort();
}

// ---------------------------------------------------------------------------
// Dish card (used inside table cell)
// ---------------------------------------------------------------------------

function DishCell({ dish, color }: { dish: Dish; color: 'orange' | 'blue' }) {
  const bg = color === 'orange' ? 'bg-orange-100' : 'bg-blue-100';
  const slots: Array<'carbohydrate' | 'protein' | 'vegetable'> = ['carbohydrate', 'protein', 'vegetable'];
  return (
    <div className={`${bg} p-3 rounded-lg`}>
      <div className="font-medium text-sm text-gray-900 mb-1 leading-tight">{dish.name}</div>
      {dish.healthiness_score != null && (
        <span className={`inline-block text-xs font-semibold rounded-full px-2 py-0.5 mb-1 ${scoreColor(dish.healthiness_score)}`}>
          <Heart className="inline h-3 w-3 mr-0.5" />
          {Math.round(dish.healthiness_score)}
        </span>
      )}
      <div className="text-xs text-gray-600 space-y-0.5 mt-1">
        {slots.map(slot => {
          const label = getSlotLabel(dish, slot);
          if (!label) return null;
          return (
            <div key={slot}>{SLOT_ICONS[slot]} {label}</div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const { data: session, status } = useSession();
  const setHeader = useHeaderActions();

  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>({});
  const [showShoppingList, setShowShoppingList] = useState(false);

  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? '';

  // Header button
  useEffect(() => {
    setHeader(
      <Link
        href="/add-meal"
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nuovo Piatto
      </Link>
    );
    return () => setHeader(null);
  }, [setHeader]);

  // Fetch dishes, then restore or create the weekly plan
  const fetchDishes = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/dishes', session.accessToken as string);
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data: Dish[] = await res.json();
      setDishes(data);

      // Try to restore the plan from localStorage; if stale or missing, generate new one
      const saved = userId ? loadPlanFromStorage(userId) : null;
      const isValid = saved && Object.keys(saved).length === DAYS.length;
      if (isValid) {
        // Re-hydrate: replace dish objects (stale ids) with fresh ones from API
        const dishById = Object.fromEntries(data.map(d => [d.id, d]));
        const hydrated: WeeklyPlan = {};
        for (const day of DAYS) {
          const cell = saved[day.key];
          hydrated[day.key] = {
            lunch:  cell?.lunch  ? (dishById[cell.lunch.id]  ?? cell.lunch)  : null,
            dinner: cell?.dinner ? (dishById[cell.dinner.id] ?? cell.dinner) : null,
          };
        }
        setWeeklyPlan(hydrated);
      } else {
        const newPlan = generateWeeklyPlan(data);
        setWeeklyPlan(newPlan);
        if (userId) savePlanToStorage(userId, newPlan);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, userId]);

  useEffect(() => {
    if (status === 'authenticated') fetchDishes();
  }, [status, fetchDishes]);

  const handleRegenerate = () => {
    const newPlan = randomizePlan(dishes);
    setWeeklyPlan(newPlan);
    if (userId) savePlanToStorage(userId, newPlan);
  };
  const shoppingList = getShoppingItems(weeklyPlan);
  const plannedMeals = Object.values(weeklyPlan).reduce(
    (n, d) => n + (d.lunch ? 1 : 0) + (d.dinner ? 1 : 0), 0
  );

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <ChefHat className="h-10 w-10 mx-auto text-purple-400 animate-pulse" />
          <p className="text-gray-500">Caricamento piatti...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="text-blue-600" />
              Piano Settimanale
            </h2>
            <button
              onClick={handleRegenerate}
              disabled={dishes.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Rigenera Piano
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            Errore nel caricamento dei piatti: {error}
          </div>
        )}

        {/* Empty state */}
        {!error && dishes.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center space-y-4">
            <ChefHat className="h-14 w-14 mx-auto text-gray-300" />
            <p className="text-gray-500 text-lg">Nessun piatto nella tua lista personale</p>
            <Link
              href="/add-meal"
              className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Crea il tuo primo piatto unico
            </Link>
          </div>
        )}

        {/* Weekly plan table */}
        {dishes.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      Pasto
                    </th>
                    {DAYS.map(day => (
                      <th key={day.key} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(['lunch', 'dinner'] as const).map(meal => (
                    <tr key={meal}>
                      <td className={`px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap ${meal === 'lunch' ? 'bg-orange-50' : 'bg-blue-50'}`}>
                        {meal === 'lunch' ? '🍽️ Pranzo' : '🌙 Cena'}
                      </td>
                      {DAYS.map(day => {
                        const dish = weeklyPlan[day.key]?.[meal];
                        return (
                          <td key={`${day.key}-${meal}`} className="px-3 py-3">
                            {dish ? (
                              <DishCell dish={dish} color={meal === 'lunch' ? 'orange' : 'blue'} />
                            ) : (
                              <div className="bg-gray-100 p-3 rounded-lg text-center text-xs text-gray-400">
                                Nessun piatto
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Shopping list */}
        {dishes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="text-purple-600" />
                Lista della Spesa
              </h2>
              <button
                onClick={() => setShowShoppingList(v => !v)}
                className="text-blue-600 hover:text-blue-800 transition-colors text-sm"
              >
                {showShoppingList ? 'Nascondi' : 'Mostra'} Lista
              </button>
            </div>
            {showShoppingList && (
              <div className="bg-white rounded-lg shadow p-6">
                {shoppingList.length > 0 ? (
                  <div className="grid md:grid-cols-3 gap-3">
                    {shoppingList.map((item, i) => (
                      <label key={i} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded text-green-600 accent-green-600" />
                        <span className="text-sm text-gray-700 capitalize">{item}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center text-sm">Nessun ingrediente trovato</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow flex items-center gap-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <Calendar className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pasti Pianificati</p>
              <p className="text-2xl font-semibold text-gray-900">{plannedMeals}/14</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <ShoppingCart className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Ingredienti Totali</p>
              <p className="text-2xl font-semibold text-gray-900">{shoppingList.length}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow flex items-center gap-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <ChefHat className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Piatti nel Catalogo</p>
              <p className="text-2xl font-semibold text-gray-900">{dishes.length}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}