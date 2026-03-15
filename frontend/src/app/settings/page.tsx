"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Bell, Utensils, Globe, Save, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Settings {
  bio: string;
  theme: string;
  language: string;
  email_notifications: boolean;
  weekly_report: boolean;
  portions_per_meal: number;
  dietary_preference: string;
}

const defaultSettings: Settings = {
  bio: "",
  theme: "light",
  language: "it",
  email_notifications: true,
  weekly_report: true,
  portions_per_meal: 2,
  dietary_preference: "nessuna",
};

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="text-green-600">{icon}</div>
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.accessToken) return;
    apiFetch("/users/me/settings", session.accessToken)
      .then((r) => r.json())
      .then((data: Partial<Settings>) =>
        setSettings({ ...defaultSettings, ...data })
      )
      .catch(() => setError("Impossibile caricare le impostazioni"))
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!session?.accessToken) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/users/me/settings", session.accessToken, {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow h-40" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {saved ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Salvataggio..." : saved ? "Salvato!" : "Salva modifiche"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Sezione 1: Preferenze generali */}
      <SectionCard
        icon={<Globe className="h-5 w-5" />}
        title="Preferenze generali"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Lingua
          </label>
          <select
            value={settings.language}
            onChange={(e) => update("language", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="it">🇮🇹  Italiano</option>
            <option value="en">🇬🇧  English</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tema
          </label>
          <div className="flex gap-3">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => update("theme", t)}
                className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                  settings.theme === t
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t === "light" ? "☀️  Chiaro" : "🌙  Scuro"}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Sezione 2: Piano alimentare */}
      <SectionCard
        icon={<Utensils className="h-5 w-5" />}
        title="Piano alimentare"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Porzioni per pasto:{" "}
            <span className="text-green-600 font-bold">
              {settings.portions_per_meal}
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={6}
            value={settings.portions_per_meal}
            onChange={(e) =>
              update("portions_per_meal", parseInt(e.target.value))
            }
            className="w-full accent-green-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1 persona</span>
            <span>6 persone</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preferenza alimentare
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "nessuna", label: "🍽️  Nessuna" },
              { value: "vegetariano", label: "🥗  Vegetariano" },
              { value: "vegano", label: "🌱  Vegano" },
              { value: "senza_glutine", label: "🌾  Senza glutine" },
              { value: "senza_lattosio", label: "🥛  Senza lattosio" },
              { value: "mediterranea", label: "🫒  Mediterranea" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => update("dietary_preference", opt.value)}
                className={`py-2 px-3 rounded-lg border text-sm font-medium text-left transition-colors ${
                  settings.dietary_preference === opt.value
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Sezione 3: Notifiche */}
      <SectionCard icon={<Bell className="h-5 w-5" />} title="Notifiche">
        <ToggleSwitch
          checked={settings.email_notifications}
          onChange={(v) => update("email_notifications", v)}
          label="Notifiche email"
          description="Ricevi aggiornamenti e avvisi via email"
        />
        <div className="border-t border-gray-100 pt-5">
          <ToggleSwitch
            checked={settings.weekly_report}
            onChange={(v) => update("weekly_report", v)}
            label="Report settimanale"
            description="Ricevi un riepilogo settimanale del tuo piano alimentare"
          />
        </div>
      </SectionCard>
    </div>
  );
}
