'use client';
import React, {useEffect, useState} from 'react';
import {ChefHat, Calendar, Plus, Edit2, ShoppingCart, RotateCcw} from 'lucide-react';
import Link from 'next/link';
import {useHeaderActions} from "@/components/HeaderContext";

// Tipi per i dati
interface Dish {
    id: string;
    name: string;
    carbohydrate: string;
    protein: string;
    vegetable: string;
    ingredients: string[];
    description?: string;
}

interface DayMeals {
    lunch: Dish | null;
    dinner: Dish | null;
}

interface WeeklyPlan {
    monday: DayMeals;
    tuesday: DayMeals;
    wednesday: DayMeals;
    thursday: DayMeals;
    friday: DayMeals;
    saturday: DayMeals;
    sunday: DayMeals;
}

// Dati di esempio
const sampleDishes: Dish[] = [
    {
        id: '1',
        name: 'Pasta al Pomodoro con Pollo',
        carbohydrate: 'Pasta',
        protein: 'Pollo',
        vegetable: 'Pomodoro',
        ingredients: ['pasta', 'pollo', 'pomodoro', 'basilico', 'olio'],
        description: 'Pasta semplice con pollo e pomodoro fresco'
    },
    {
        id: '2',
        name: 'Riso con Salmone e Broccoli',
        carbohydrate: 'Riso',
        protein: 'Salmone',
        vegetable: 'Broccoli',
        ingredients: ['riso', 'salmone', 'broccoli', 'limone', 'olio'],
        description: 'Riso integrale con salmone grigliato'
    },
    {
        id: '3',
        name: 'Quinoa con Tacchino e Spinaci',
        carbohydrate: 'Quinoa',
        protein: 'Tacchino',
        vegetable: 'Spinaci',
        ingredients: ['quinoa', 'tacchino', 'spinaci', 'aglio', 'olio'],
        description: 'Quinoa proteica con tacchino e spinaci freschi'
    },
    {
        id: '4',
        name: 'Patate con Manzo e Carote',
        carbohydrate: 'Patate',
        protein: 'Manzo',
        vegetable: 'Carote',
        ingredients: ['patate', 'manzo', 'carote', 'rosmarino', 'olio'],
        description: 'Patate al forno con manzo e carote'
    }
];

// Genera un piano settimanale casuale
const generateRandomWeeklyPlan = (): WeeklyPlan => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
    const plan: WeeklyPlan = {} as WeeklyPlan;

    days.forEach(day => {
        const usedDishes = new Set<string>();

        // Seleziona pranzo
        let lunchDish;
        do {
            lunchDish = sampleDishes[Math.floor(Math.random() * sampleDishes.length)];
        } while (usedDishes.has(lunchDish.id));
        usedDishes.add(lunchDish.id);

        // Seleziona cena (diversa dal pranzo)
        let dinnerDish;
        do {
            dinnerDish = sampleDishes[Math.floor(Math.random() * sampleDishes.length)];
        } while (usedDishes.has(dinnerDish.id));

        plan[day] = {
            lunch: lunchDish,
            dinner: dinnerDish
        };
    });

    return plan;
};

export default function Home() {
    const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(generateRandomWeeklyPlan());
    const [showShoppingList, setShowShoppingList] = useState<boolean>(false);

    const days = [
        {key: 'monday', label: 'Lunedì'},
        {key: 'tuesday', label: 'Martedì'},
        {key: 'wednesday', label: 'Mercoledì'},
        {key: 'thursday', label: 'Giovedì'},
        {key: 'friday', label: 'Venerdì'},
        {key: 'saturday', label: 'Sabato'},
        {key: 'sunday', label: 'Domenica'}
    ];

    const generateShoppingList = () => {
        const ingredients = new Set<string>();

        Object.values(weeklyPlan).forEach(dayMeals => {
            if (dayMeals.lunch) {
                dayMeals.lunch.ingredients.forEach((ingredient: string) => ingredients.add(ingredient));
            }
            if (dayMeals.dinner) {
                dayMeals.dinner.ingredients.forEach((ingredient: string) => ingredients.add(ingredient));
            }
        });

        return Array.from(ingredients).sort();
    };

    const handleRegeneratePlan = () => {
        setWeeklyPlan(generateRandomWeeklyPlan());
        setShowShoppingList(false);
    };

    const shoppingList = generateShoppingList();

    const setHeader = useHeaderActions();

    useEffect(() => {
        setHeader(
            <Link href="/add-meal"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                <Plus className="h-4 w-4"/>
                Aggiungi Piatto
            </Link>
        );

        return () => setHeader(null); // reset quando si lascia la pagina
    }, [setHeader]);

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                            <Calendar className="text-blue-600"/>
                            Piano Settimanale
                        </h2>
                        <div className="flex gap-2">
                            <button
                                onClick={handleRegeneratePlan}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                                <RotateCcw className="h-4 w-4"/>
                                Rigenera Piano
                            </button>
                            <button
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                <Edit2 className="h-4 w-4"/>
                                Modifica Piano
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Piano Settimanale */}
                <div className="mb-8">

                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Pasto
                                    </th>
                                    {days.map(day => (
                                        <th key={day.key}
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            {day.label}
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                {/* Riga Pranzo */}
                                <tr>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 bg-orange-50">
                                        🍽️ Pranzo
                                    </td>
                                    {days.map(day => (
                                        <td key={`${day.key}-lunch`} className="px-6 py-4">
                                            {weeklyPlan[day.key as keyof WeeklyPlan]?.lunch ? (
                                                <div className="bg-orange-100 p-3 rounded-lg">
                                                    <div className="font-medium text-sm text-gray-900 mb-1">
                                                        {weeklyPlan[day.key as keyof WeeklyPlan].lunch!.name}
                                                    </div>
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        <div>🍝 {weeklyPlan[day.key as keyof WeeklyPlan].lunch!.carbohydrate}</div>
                                                        <div>🥩 {weeklyPlan[day.key as keyof WeeklyPlan].lunch!.protein}</div>
                                                        <div>🥬 {weeklyPlan[day.key as keyof WeeklyPlan].lunch!.vegetable}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    className="bg-gray-100 p-3 rounded-lg text-center text-sm text-gray-500">
                                                    Nessun piatto
                                                </div>
                                            )}
                                        </td>
                                    ))}
                                </tr>

                                {/* Riga Cena */}
                                <tr>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 bg-blue-50">
                                        🌙 Cena
                                    </td>
                                    {days.map(day => (
                                        <td key={`${day.key}-dinner`} className="px-6 py-4">
                                            {weeklyPlan[day.key as keyof WeeklyPlan]?.dinner ? (
                                                <div className="bg-blue-100 p-3 rounded-lg">
                                                    <div className="font-medium text-sm text-gray-900 mb-1">
                                                        {weeklyPlan[day.key as keyof WeeklyPlan].dinner!.name}
                                                    </div>
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        <div>🍝 {weeklyPlan[day.key as keyof WeeklyPlan].dinner!.carbohydrate}</div>
                                                        <div>🥩 {weeklyPlan[day.key as keyof WeeklyPlan].dinner!.protein}</div>
                                                        <div>🥬 {weeklyPlan[day.key as keyof WeeklyPlan].dinner!.vegetable}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    className="bg-gray-100 p-3 rounded-lg text-center text-sm text-gray-500">
                                                    Nessun piatto
                                                </div>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Lista della Spesa */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                            <ShoppingCart className="text-purple-600"/>
                            Lista della Spesa
                        </h2>
                        <button
                            onClick={() => setShowShoppingList(!showShoppingList)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                        >
                            {showShoppingList ? 'Nascondi' : 'Mostra'} Lista
                        </button>
                    </div>

                    {showShoppingList && (
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="grid md:grid-cols-3 gap-4">
                                {shoppingList.map((ingredient, index) => (
                                    <div key={index} className="flex items-center space-x-2">
                                        <input type="checkbox" className="rounded text-green-600"/>
                                        <span className="text-sm text-gray-700 capitalize">{ingredient}</span>
                                    </div>
                                ))}
                            </div>
                            {shoppingList.length === 0 && (
                                <p className="text-gray-500 text-center">Nessun ingrediente trovato</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Statistiche Rapide */}
                <div className="grid md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center">
                            <div className="bg-green-100 p-3 rounded-lg">
                                <Calendar className="h-8 w-8 text-green-600"/>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Pasti Pianificati</p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {Object.values(weeklyPlan).reduce((total, day) => {
                                        return total + (day.lunch ? 1 : 0) + (day.dinner ? 1 : 0);
                                    }, 0)}/14
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center">
                            <div className="bg-blue-100 p-3 rounded-lg">
                                <ShoppingCart className="h-8 w-8 text-blue-600"/>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Ingredienti Totali</p>
                                <p className="text-2xl font-semibold text-gray-900">{shoppingList.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow">
                        <div className="flex items-center">
                            <div className="bg-purple-100 p-3 rounded-lg">
                                <ChefHat className="h-8 w-8 text-purple-600"/>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm text-gray-600">Piatti Unici</p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {new Set(Object.values(weeklyPlan).flatMap(day =>
                                        [day.lunch?.id, day.dinner?.id].filter(Boolean)
                                    )).size}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}