import Estimateur, { type CommuneOption } from "./Estimateur";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

export const metadata = { title: "Estimer un bien · Immo Orléans" };

export default async function Page() {
  let communes: CommuneOption[] = [];
  try {
    const res = await fetch(`${API_URL}/communes?type=Tous&min_ventes=1&limit=325`, { next: { revalidate: 3600 } });
    if (res.ok) communes = (await res.json()) as CommuneOption[];
  } catch {
    // API injoignable : le formulaire s'affiche avec une liste vide et un message
  }
  return (
    <main>
      <p className="source">Modèle statistique entraîné sur les ventes DVF du Loiret</p>
      <h1>Ce prix est-il raisonnable ?</h1>
      <Estimateur communes={communes} />
    </main>
  );
}
