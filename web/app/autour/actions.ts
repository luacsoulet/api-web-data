"use server";

import type { Adresse } from "@/lib/api";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

/** Suggestions d'adresses (BAN du Loiret) ; null si le service ne répond pas. */
export async function chercherAdresses(q: string): Promise<Adresse[] | null> {
  const texte = String(q).trim().slice(0, 100);
  if (texte.length < 3) return [];
  try {
    const res = await fetch(`${API_URL}/adresses?q=${encodeURIComponent(texte)}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Adresse[]) : null;
  } catch {
    return null;
  }
}
