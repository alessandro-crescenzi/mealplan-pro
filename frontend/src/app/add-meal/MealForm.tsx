"use client";

import React, {useState} from "react";
import Select from 'react-select';

interface MealInput {
    name: string;
    carbohydrate: string;
    protein: string;
    vegetable: string;
    ingredients: string[];
    description: string;
    instructions: string;
}

const initialState: MealInput = {
    name: "",
    carbohydrate: "",
    protein: "",
    vegetable: "",
    ingredients: [],
    description: "",
    instructions: "",
};

export default function MealForm() {
    const [form, setForm] = useState<MealInput>(initialState);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState("");

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        setForm({...form, [e.target.name]: e.target.value});
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage("");

        if (!form.name || !form.carbohydrate || !form.protein || !form.vegetable) {
            setMessage("❌ Compila tutti i campi obbligatori");
            setIsSubmitting(false);
            return;
        }

        if (form.ingredients.length === 0) {
            setMessage("❌ Seleziona almeno un ingrediente");
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/meals`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    form,
                }),
            });

            if (!res.ok) throw new Error("Errore nel salvataggio");

            setMessage("✅ Piatto aggiunto con successo!");
            setForm(initialState);
        } catch (err) {
            setMessage("❌ Errore: " + (err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow space-y-4">
            {[
                {label: "Nome del piatto", name: "name"},
                {label: "Carboidrato", name: "carbohydrate"},
                {label: "Proteina", name: "protein"},
                {label: "Fibra", name: "vegetable"},
            ].map(({label, name}) => (
                <div key={name}>
                    <label className="block text-sm font-medium text-gray-700 capitalize">{label}</label>
                    <input
                        type="text"
                        name={name}
                        value={(form as any)[name]}
                        onChange={handleChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm h-12"
                    />
                </div>
            ))}

            {[
                {label: "Descrizione del piatto", name: "description"},
                {label: "Preparazione", name: "instructions"},
            ].map(({label, name}) => (
                <div key={name}>
                    <label className="block text-sm font-medium text-gray-700 capitalize">{label}</label>
                    <textarea
                        name={name}
                        value={(form as any)[name]}
                        onChange={handleChange}
                        rows={4}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                    />
                </div>
            ))}

            <div>
                <label className="block text-sm font-medium text-gray-700">
                    Ingredienti (seleziona multipli):
                </label>
                <Select
                    isMulti
                    name="ingredients"
                    options={[
                        {value: 'pomodoro', label: 'Pomodoro'},
                        {value: 'mozzarella', label: 'Mozzarella'},
                        {value: 'basilico', label: 'Basilico'},
                        {value: 'olio', label: 'Olio d\'Oliva'},
                        {value: 'sale', label: 'Sale'},
                        {value: 'pepe', label: 'Pepe'},
                    ]}
                    className="mt-1"
                    classNamePrefix="react-select"
                    onChange={(selected) => {
                        setForm({
                            ...form,
                            ingredients: selected.map((s) => s.value),
                        });
                    }}
                    styles={{
                        multiValue: (base) => ({
                            ...base,
                            backgroundColor: '#EBECF0',
                        }),
                        multiValueLabel: (base) => ({
                            ...base,
                            color: '#172B4D',
                        }),
                        multiValueRemove: (base) => ({
                            ...base,
                            color: '#172B4D',
                            ':hover': {
                                backgroundColor: '#DDE1E6',
                                color: '#172B4D',
                            },
                        }),
                    }}
                    placeholder="Seleziona ingredienti..."
                />
            </div>

            <button
                type="submit"
                disabled={isSubmitting}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
                {isSubmitting ? "Salvataggio..." : "Salva Piatto"}
            </button>

            {message && <p className="text-sm mt-2">{message}</p>}
        </form>
    );
}