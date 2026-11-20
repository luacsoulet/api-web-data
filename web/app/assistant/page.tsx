import { connection } from "next/server";
import Assistant from "./Assistant";

export const metadata = { title: "Assistant · Immo Orléans" };

export default async function Page() {
  await connection(); // lit l'environnement à la requête, pas au build
  const actif = process.env.ASSISTANT_LOCAL === "1" && !!process.env.ASSISTANT_DIR;
  return (
    <main>
      <p className="source">Claude Code + serveur MCP local immo-loiret · ventes DVF du Loiret 2021 → juin 2026</p>
      <h1>Posez vos questions aux données</h1>
      {actif ? (
        <Assistant />
      ) : (
        <p className="panel">
          L&apos;assistant fonctionne en local uniquement : il utilise Claude Code installé sur la machine et le serveur MCP
          du projet. Lancez l&apos;appli avec <code>ASSISTANT_LOCAL=1 ASSISTANT_DIR=&lt;racine du dépôt&gt;</code>.
        </p>
      )}
    </main>
  );
}
