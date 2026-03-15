"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Mail, Calendar, Edit3, Save, X, Shield } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  google_id: string | null;
  created_at: string;
  settings: {
    bio: string | null;
  } | null;
}

function Avatar({
  name,
  image,
  size = "lg",
}: {
  name?: string | null;
  image?: string | null;
  size?: "lg" | "sm";
}) {
  const dim =
    size === "lg" ? "w-24 h-24 text-3xl" : "w-10 h-10 text-sm";
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";
  if (image)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt="avatar"
        className={`${dim} rounded-full object-cover ring-4 ring-green-100`}
      />
    );
  return (
    <div
      className={`${dim} rounded-full bg-green-600 text-white flex items-center justify-center font-bold ring-4 ring-green-100`}
    >
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    apiFetch("/users/me", session.accessToken)
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data);
        setName(data.name ?? "");
        setBio(data.settings?.bio ?? "");
      })
      .catch(() => showToast("error", "Impossibile caricare il profilo"))
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const [profileRes, settingsRes] = await Promise.all([
        apiFetch("/users/me", session.accessToken, {
          method: "PUT",
          body: JSON.stringify({ name }),
        }),
        apiFetch("/users/me/settings", session.accessToken, {
          method: "PUT",
          body: JSON.stringify({ bio }),
        }),
      ]);
      if (!profileRes.ok || !settingsRes.ok) throw new Error();
      const updatedProfile: UserProfile = await profileRes.json();
      setProfile({ ...updatedProfile, settings: { ...updatedProfile.settings, bio } });
      setEditing(false);
      showToast("success", "Profilo aggiornato con successo");
    } catch {
      showToast("error", "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(profile?.name ?? "");
    setBio(profile?.settings?.bio ?? "");
    setEditing(false);
  }

  const loginMethod = profile?.google_id ? "Google" : "Email & Password";

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="bg-white rounded-xl shadow p-8 flex gap-6">
          <div className="w-24 h-24 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-6 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
            toast.type === "success" ? "bg-green-600" : "bg-red-500"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-6">
            <Avatar name={profile?.name} image={session?.user?.image} size="lg" />
            <div>
              {editing ? (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-2xl font-bold border-b-2 border-green-500 outline-none bg-transparent w-full mb-1"
                  placeholder="Il tuo nome"
                />
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile?.name || "Nessun nome"}
                </h1>
              )}
              <p className="text-gray-500 text-sm">{profile?.email}</p>
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                <Shield className="h-3 w-3" /> {loginMethod}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X className="h-4 w-4" /> Annulla
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="h-4 w-4" />{" "}
                  {saving ? "Salvataggio..." : "Salva"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Edit3 className="h-4 w-4" /> Modifica
              </button>
            )}
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bio
          </label>
          {editing ? (
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Scrivi qualcosa su di te..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          ) : (
            <p className="text-gray-600 text-sm min-h-[3rem]">
              {profile?.settings?.bio || (
                <span className="text-gray-400 italic">
                  Nessuna bio. Clicca Modifica per aggiungerne una.
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Email
            </p>
            <p className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">
              {profile?.email}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-lg">
            <Calendar className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Membro da
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString("it-IT", {
                    year: "numeric",
                    month: "long",
                  })
                : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
