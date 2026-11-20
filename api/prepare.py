"""Prépare data/immobilier.parquet depuis DVF géolocalisées (Etalab), Loiret, 2021-2025.

Adapté de sources/build_immobilier.py du gabarit AWP. Source : DGFiP, DVF, Licence Ouverte 2.0.
Lancer : uv run python prepare.py [sortie.parquet]
"""

import sys
from pathlib import Path

import pandas as pd

URL = "https://files.data.gouv.fr/geo-dvf/latest/csv/{year}/departements/45.csv.gz"
SORTIE = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else Path(__file__).parent / "data" / "immobilier.parquet"
)
COLONNES = [
    "id_mutation", "date_mutation", "annee", "valeur_fonciere", "type", "surface_reelle_bati",
    "nombre_pieces_principales", "prix_m2", "surface_terrain", "code_commune", "nom_commune",
    "code_postal", "section", "longitude", "latitude",
]  # fmt: skip

raw = pd.concat(pd.read_csv(URL.format(year=y), dtype=str) for y in range(2021, 2026))
ventes = raw[raw["nature_mutation"] == "Vente"].copy()
for col in ["valeur_fonciere", "surface_reelle_bati", "nombre_pieces_principales",
            "surface_terrain", "longitude", "latitude"]:  # fmt: skip
    ventes[col] = pd.to_numeric(ventes[col])

# Une ligne DVF = une parcelle d'une mutation : le terrain d'une vente est la somme de ses parcelles.
terrain = (
    ventes.drop_duplicates(
        ["id_mutation", "id_parcelle", "code_nature_culture", "surface_terrain"]
    )
    .groupby("id_mutation")["surface_terrain"]
    .sum()
)

df = ventes[ventes["type_local"].isin(["Appartement", "Maison"])]
df = df.drop_duplicates(
    ["id_mutation", "type_local", "surface_reelle_bati", "nombre_pieces_principales"]
)
# Plusieurs logements dans une vente = un seul prix pour tous : on garde les ventes d'un seul logement.
df = df[~df["id_mutation"].duplicated(keep=False)].copy()
df["surface_terrain"] = df["id_mutation"].map(terrain)

# Erreurs évidentes : prix symboliques, surfaces et prix au m² absurdes.
df["prix_m2"] = df["valeur_fonciere"] / df["surface_reelle_bati"]
df = df[
    df["valeur_fonciere"].between(10_000, 2_000_000)
    & df["surface_reelle_bati"].between(9, 400)
    & df["prix_m2"].between(300, 8_000)
]

df["date_mutation"] = pd.to_datetime(df["date_mutation"])
df["annee"] = df["date_mutation"].dt.year
# "45234000AB0012" -> "AB" : la section cadastrale, niveau le plus fin (pas d'adresse gardée)
df["section"] = df["id_parcelle"].str[8:10]
df = (
    df.rename(columns={"type_local": "type"})[COLONNES]
    .sort_values("date_mutation")
    .reset_index(drop=True)
)

SORTIE.parent.mkdir(parents=True, exist_ok=True)
df.to_parquet(SORTIE, index=False)
print(f"{len(df)} ventes, {df['nom_commune'].nunique()} communes -> {SORTIE}")
