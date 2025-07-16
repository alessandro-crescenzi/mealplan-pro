import React from 'react';
import { ChefHat, Calendar, Plus } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ChefHat className="text-green-600" />
            MealPlan Pro
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            🚀 Progetto in Sviluppo
          </h2>
          <p className="text-gray-600 mb-8">
            Generatore di piani settimanali per pasti - Coming Soon!
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow">
              <Calendar className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Piano Settimanale</h3>
              <p className="text-sm text-gray-600">
                Visualizza e modifica i tuoi pasti della settimana
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <Plus className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Aggiungi Piatti</h3>
              <p className="text-sm text-gray-600">
                Crea nuovi piatti unici con carboidrati, proteine e verdure
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <ChefHat className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Lista Spesa</h3>
              <p className="text-sm text-gray-600">
                Genera automaticamente la lista della spesa
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
