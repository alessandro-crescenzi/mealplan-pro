"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { ChefHat } from "lucide-react";

type RegisterStep = "details" | "verification";

type RegistrationStartResponse = {
  message: string;
  email: string;
  expires_in_minutes: number;
};

export default function RegisterPage() {
  const [step, setStep] = useState<RegisterStep>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }
    if (password.length < 8) {
      setError("La password deve essere lunga almeno 8 caratteri");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Errore durante la registrazione");
        return;
      }

      const data: RegistrationStartResponse = await res.json();
      setStep("verification");
      setExpiresInMinutes(data.expires_in_minutes);
      setMessage(data.message);
    } catch {
      setError("Errore di rete. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!verificationCode.trim()) {
      setError("Inserisci il codice ricevuto via email");
      return;
    }

    setLoading(true);
    try {
      const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(data.detail || "Errore durante la verifica del codice");
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email verificata, ma l'accesso automatico non è riuscito. Effettua il login manualmente.");
        return;
      }

      window.location.href = "/home";
    } catch {
      setError("Errore di rete. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Errore durante il reinvio del codice");
        return;
      }

      const data: RegistrationStartResponse = await res.json();
      setExpiresInMinutes(data.expires_in_minutes);
      setMessage(data.message);
    } catch {
      setError("Errore di rete. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-6">
        <div className="text-center">
          <ChefHat className="mx-auto text-green-600 h-10 w-10 mb-2" />
          <h1 className="text-2xl font-bold">
            {step === "details" ? "Crea il tuo account" : "Verifica la tua email"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">MealPlan Pro</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded text-sm">
            {message}
          </div>
        )}

        {step === "details" ? (
          <form onSubmit={handleRegistrationSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Nome (opzionale)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="password"
              placeholder="Password (min. 8 caratteri)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="password"
              placeholder="Conferma password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Invio codice..." : "Registrati"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerificationSubmit} className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p>
                Abbiamo inviato un codice a <span className="font-medium text-gray-900">{email}</span>.
              </p>
              {expiresInMinutes && (
                <p className="mt-1">Il codice scade tra circa {expiresInMinutes} minuti.</p>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Codice di verifica"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              required
              className="w-full border border-gray-300 rounded-md px-4 py-2 tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Verifica..." : "Conferma codice"}
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reinvia codice
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setVerificationCode("");
                  setMessage("");
                  setError("");
                  setExpiresInMinutes(null);
                }}
                disabled={loading}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Modifica dati
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-gray-600">
          Hai già un account?{" "}
          <Link href="/login" className="text-green-600 hover:underline font-medium">
            Accedi
          </Link>
        </p>
      </div>
    </div>
  );
}
