'use client';

import React, {useEffect} from 'react';
import {useHeaderActions} from '@/components/HeaderContext';
import {ChefHat, RotateCcw} from 'lucide-react';
import Link from "next/link";
import MealForm from './MealForm';

export default function AddMealPage() {
    const setHeader = useHeaderActions();

    useEffect(() => {
        setHeader(
            <Link href="/"
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
                <ChefHat className="h-4 w-4"/>
                Il tuo Piano
            </Link>
        );

        return () => setHeader(null); // reset quando si lascia la pagina
    }, [setHeader]);

    return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Crea Piatto Unico</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Componi un piatto assemblando ingredienti o ricette nei 3 slot fondamentali:
        carboidrati, proteine e verdure.
      </p>
      <MealForm />
    </main>
  );
}