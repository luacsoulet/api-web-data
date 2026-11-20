from functools import lru_cache
import json
import os
import urllib.request
from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / "data" / "immobilier.parquet"


@lru_cache
def charger() -> pd.DataFrame:
    return pd.read_parquet(DATA)


def filtrer(
    type_: str,
    annee: int | None = None,
    budget_max: int | None = None,
) -> pd.DataFrame:
    df = charger()
    if type_ != "Tous":
        df = df[df["type"] == type_]
    if annee is not None:
        df = df[df["annee"] == annee]
    if budget_max is not None:
        df = df[df["valeur_fonciere"] <= budget_max]
    return df


def _nombre(x):
    # NaN -> None pour que le JSON soit valide
    return None if pd.isna(x) else float(x)


def kpis(
    type_: str,
    annee: int | None = None,
    budget_max: int | None = None,
) -> dict:
    df = filtrer(type_, annee, budget_max)
    return {
        "n_ventes": len(df),
        "prix_m2_median": _nombre(df["prix_m2"].median()),
        "valeur_median": _nombre(df["valeur_fonciere"].median()),
        "n_communes": int(df["code_commune"].nunique()),
    }


def communes(
    type_: str,
    annee: int | None = None,
    budget_max: int | None = None,
    min_ventes: int = 30,
    limit: int = 15,
) -> list[dict]:
    g = (
        filtrer(type_, annee, budget_max)
        .groupby(["code_commune", "nom_commune"])
        .agg(
            n=("id_mutation", "size"),
            prix_m2_median=("prix_m2", "median"),
            valeur_median=("valeur_fonciere", "median"),
        )
        .reset_index()
    )
    g = g[g["n"] >= min_ventes].sort_values("prix_m2_median", ascending=False)
    return [
        {
            "code_commune": str(r.code_commune),
            "nom_commune": r.nom_commune,
            "n": int(r.n),
            "prix_m2_median": _nombre(r.prix_m2_median),
            "valeur_median": _nombre(r.valeur_median),
        }
        for r in g.head(limit).itertuples()
    ]


def evolution(
    type_: str,
    annee: int | None = None,
    budget_max: int | None = None,
) -> list[dict]:
    g = (
        filtrer(type_, annee, budget_max)
        .groupby("annee")
        .agg(n=("id_mutation", "size"), prix_m2_median=("prix_m2", "median"))
        .reset_index()
        .sort_values("annee")
    )
    return [
        {
            "annee": int(r.annee),
            "n": int(r.n),
            "prix_m2_median": _nombre(r.prix_m2_median),
        }
        for r in g.itertuples()
    ]


def points(
    type_: str,
    annee: int | None = None,
    budget_max: int | None = None,
    limit: int = 500,
) -> list[dict]:
    """Ventes geolocalisees pour les marqueurs de la carte (type maps)."""
    df = filtrer(type_, annee, budget_max)
    df = df.dropna(subset=["latitude", "longitude"]).head(limit)
    return [
        {
            "id_mutation": str(r.id_mutation),
            "nom_commune": r.nom_commune,
            "type": r.type,
            "prix": _nombre(r.valeur_fonciere),
            "surface": _nombre(r.surface_reelle_bati),
            "prix_m2": _nombre(r.prix_m2),
            "nombre_pieces": _nombre(r.nombre_pieces_principales),
            "date": str(r.date_mutation.date()) if pd.notna(r.date_mutation) else None,
            "latitude": float(r.latitude),
            "longitude": float(r.longitude),
        }
        for r in df.itertuples()
    ]


def resumer_ia(agregat: dict) -> str:
    """Appelle n'importe quelle IA compatible OpenAI pour resumer l'agregat.
    Variables d'env : IA_URL, IA_KEY, IA_MODEL."""
    url = os.environ.get("IA_URL")
    key = os.environ.get("IA_KEY")
    model = os.environ.get("IA_MODEL", "ia")
    if not url or not key:
        return (
            "Couche IA non configuree : definissez IA_URL et IA_KEY."
        )
    consigne = (
        "Resume ce tableau en 3 phrases, en francais, sans inventer de chiffre. "
        "Ne donne que le texte du resume, sans preamble."
    )
    donnees = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": consigne},
                {"role": "user", "content": json.dumps(agregat, ensure_ascii=False)},
            ],
            "temperature": 0,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=donnees,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        return f"Erreur IA : {type(exc).__name__}"
