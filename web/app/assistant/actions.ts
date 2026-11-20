"use server";

import { execFile } from "node:child_process";

export type Reponse = { texte: string; session?: string; erreur?: string };

const CONSIGNE =
  "Tu es l'assistant d'Immo Orléans. Réponds en français, brièvement, en citant les chiffres des outils immo-loiret " +
  "(ventes DVF du Loiret 2021 → juin 2026). Ne donne jamais d'adresse. Si l'outil ne permet pas de répondre, dis-le.";

// Local uniquement : lance Claude Code (login de l'utilisateur) restreint aux outils du serveur MCP du projet.
export async function demander(question: string, session?: string): Promise<Reponse> {
  const dossier = process.env.ASSISTANT_DIR;
  if (process.env.ASSISTANT_LOCAL !== "1" || !dossier) return { texte: "", erreur: "Assistant disponible en local uniquement." };
  const q = question.trim().slice(0, 500);
  if (q.length < 3) return { texte: "", erreur: "Posez une question d'au moins 3 caractères." };
  const args = [
    "-p", q, "--output-format", "json",
    "--mcp-config", ".mcp.json", "--strict-mcp-config",
    "--tools", "", "--allowedTools", "mcp__immo-loiret",
    "--append-system-prompt", CONSIGNE,
  ];
  if (session && /^[0-9a-f-]{36}$/.test(session)) args.push("--resume", session);
  return new Promise((ok) => {
    execFile("claude", args, { cwd: dossier, timeout: 180_000, maxBuffer: 4_000_000 }, (err, stdout) => {
      try {
        const d = JSON.parse(stdout);
        if (d.is_error) return ok({ texte: "", erreur: String(d.result ?? "Erreur de l'assistant.") });
        ok({ texte: String(d.result ?? ""), session: d.session_id });
      } catch {
        ok({ texte: "", erreur: err?.killed ? "L'assistant a mis trop de temps à répondre." : "Assistant indisponible : Claude Code est-il installé et connecté ?" });
      }
    });
  });
}
