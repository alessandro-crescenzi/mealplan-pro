"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Select from "react-select";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SlotCategory = "carbohydrate" | "protein" | "vegetable";
type SlotType = "ingredient" | "recipe";

interface Ingredient {
  id: number;
  name: string;
  category: string;
  healthiness_score?: number | null;
  unit: string;
}

interface Recipe {
  id: number;
  name: string;
  description?: string | null;
}

interface SlotState {
  active: boolean;
  type: SlotType;
  ingredientId: number | null;
  recipeId: number | null;
  quantity: string;
  unit: string;
}

interface SelectOption {
  value: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOT_CONFIG: { category: SlotCategory; label: string; emoji: string; color: string }[] = [
  { category: "carbohydrate", label: "Carboidrati", emoji: "🍝", color: "orange" },
  { category: "protein",      label: "Proteine",    emoji: "🥩", color: "red"    },
  { category: "vegetable",    label: "Verdure",     emoji: "🥬", color: "green"  },
];

const SLOT_COLORS: Record<string, string> = {
  orange: "border-orange-200 bg-orange-50",
  red:    "border-red-200 bg-red-50",
  green:  "border-green-200 bg-green-50",
};

const INITIAL_SLOT: SlotState = {
  active: false,
  type: "ingredient",
  ingredientId: null,
  recipeId: null,
  quantity: "",
  unit: "g",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DishForm() {
  const { data: session } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const [slots, setSlots] = useState<Record<SlotCategory, SlotState>>({
    carbohydrate: { ...INITIAL_SLOT },
    protein:      { ...INITIAL_SLOT },
    vegetable:    { ...INITIAL_SLOT },
  });

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load catalog
  useEffect(() => {
    if (!session?.accessToken) return;
    const token = session.accessToken as string;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

    Promise.all([
      fetch(`${base}/ingredients?limit=200`).then(r => r.json()),
      apiFetch("/recipes?limit=200", token).then(r => r.json()),
    ])
      .then(([ings, recs]) => {
        setIngredients(Array.isArray(ings) ? ings : []);
        setRecipes(Array.isArray(recs) ? recs : []);
      })
      .catch(() => {/* silently ignore catalog load errors */})
      .finally(() => setLoadingCatalog(false));
  }, [session?.accessToken]);

  // Helpers
  const ingredientsByCategory = (cat: SlotCategory): Ingredient[] =>
    ingredients.filter(i => i.category === cat);

  const ingredientOptions = (cat: SlotCategory): SelectOption[] =>
    ingredientsByCategory(cat).map(i => ({
      value: i.id,
      label: `${i.name}${i.healthiness_score != null ? ` (♥ ${i.healthiness_score})` : ""}`,
    }));

  const recipeOptions: SelectOption[] = recipes.map(r => ({
    value: r.id,
    label: r.name,
  }));

  const updateSlot = (cat: SlotCategory, patch: Partial<SlotState>) =>
    setSlots(prev => ({ ...prev, [cat]: { ...prev[cat], ...patch } }));

  const toggleSlot = (cat: SlotCategory) =>
    updateSlot(cat, { active: !slots[cat].active });

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Il nome del piatto è obbligatorio"); return; }
    if (!session?.accessToken) { setError("Sessione scaduta, effettua nuovamente il login"); return; }

    const activeSlots = SLOT_CONFIG.filter(s => slots[s.category].active);
    if (activeSlots.length === 0) {
      setError("Aggiungi almeno uno slot (carboidrati, proteine o verdure)");
      return;
    }

    for (const { category, label } of activeSlots) {
      const slot = slots[category];
      if (slot.type === "ingredient" && !slot.ingredientId) {
        setError(`Seleziona un ingrediente per lo slot "${label}"`);
        return;
      }
      if (slot.type === "recipe" && !slot.recipeId) {
        setError(`Seleziona una ricetta per lo slot "${label}"`);
        return;
      }
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    const components = activeSlots.map(({ category }) => {
      const slot = slots[category];
      return {
        slot_category: category,
        ingredient_id: slot.type === "ingredient" ? slot.ingredientId : null,
        recipe_id:     slot.type === "recipe"     ? slot.recipeId     : null,
        quantity:      slot.quantity ? parseFloat(slot.quantity) : null,
        unit:          slot.unit || null,
      };
    });

    try {
      const res = await apiFetch("/dishes", session.accessToken as string, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          components,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Errore ${res.status}`);
      }

      setSuccess("✅ Piatto creato con successo!");
      setTimeout(() => router.push("/home"), 1200);
    } catch (err) {
      setError("❌ " + (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow space-y-6">

      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nome del piatto <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Es. Pasta al pomodoro con insalata"
          className="w-full rounded-md border border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm h-10 px-3"
        />
      </div>

      {/* Descrizione */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Breve descrizione (opzionale)"
          className="w-full rounded-md border border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm h-10 px-3"
        />
      </div>

      {/* Slot */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-700">
          Composizione — seleziona gli slot che compongono il piatto
        </p>

        {SLOT_CONFIG.map(({ category, label, emoji, color }) => {
          const slot = slots[category];
          const colorClass = SLOT_COLORS[color];

          return (
            <div key={category} className={`border rounded-lg p-4 ${slot.active ? colorClass : "border-gray-200 bg-gray-50"}`}>
              {/* Toggle header */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={slot.active}
                  onChange={() => toggleSlot(category)}
                  className="rounded accent-purple-600 w-4 h-4"
                />
                <span className="text-base font-semibold text-gray-800">
                  {emoji} {label}
                </span>
              </label>

              {slot.active && (
                <div className="mt-4 space-y-3">
                  {/* Tipo: ingrediente o ricetta */}
                  <div className="flex gap-4">
                    {(["ingredient", "recipe"] as SlotType[]).map(t => (
                      <label key={t} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                        <input
                          type="radio"
                          name={`type-${category}`}
                          value={t}
                          checked={slot.type === t}
                          onChange={() => updateSlot(category, { type: t, ingredientId: null, recipeId: null })}
                          className="accent-purple-600"
                        />
                        {t === "ingredient" ? "Ingrediente diretto" : "Ricetta"}
                      </label>
                    ))}
                  </div>

                  {/* Selezione */}
                  {loadingCatalog ? (
                    <p className="text-xs text-gray-400">Caricamento catalogo...</p>
                  ) : slot.type === "ingredient" ? (
                    <Select<SelectOption>
                      options={ingredientOptions(category)}
                      value={ingredientOptions(category).find(o => o.value === slot.ingredientId) ?? null}
                      onChange={opt => updateSlot(category, { ingredientId: opt?.value ?? null })}
                      placeholder={`Cerca ${label.toLowerCase()}...`}
                      isClearable
                      classNamePrefix="react-select"
                    />
                  ) : (
                    <Select<SelectOption>
                      options={recipeOptions}
                      value={recipeOptions.find(o => o.value === slot.recipeId) ?? null}
                      onChange={opt => updateSlot(category, { recipeId: opt?.value ?? null })}
                      placeholder="Cerca ricetta..."
                      isClearable
                      classNamePrefix="react-select"
                    />
                  )}

                  {/* Quantità + unità */}
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={slot.quantity}
                      onChange={e => updateSlot(category, { quantity: e.target.value })}
                      placeholder="Quantità"
                      className="w-32 rounded-md border border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm h-9 px-2"
                    />
                    <input
                      type="text"
                      value={slot.unit}
                      onChange={e => updateSlot(category, { unit: e.target.value })}
                      placeholder="Unità (g, ml…)"
                      className="w-28 rounded-md border border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm h-9 px-2"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Istruzioni */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Istruzioni di preparazione</label>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={3}
          placeholder="Descrivi come assemblare il piatto (opzionale)"
          className="w-full rounded-md border border-gray-300 shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm px-3 py-2"
        />
      </div>

      {/* Feedback */}
      {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 font-medium"
      >
        {isSubmitting ? "Salvataggio..." : "Crea Piatto Unico"}
      </button>
    </form>
  );
}

