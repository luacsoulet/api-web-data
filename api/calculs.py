from functools import lru_cache
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
