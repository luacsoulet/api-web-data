"""Prépare l'index d'adresses (BAN, Loiret) et copie les équipements pour la recherche « autour d'une adresse ».

Lancer depuis api/ :  uv run python -I prepare_adresses.py
Sorties : api/data/adresses.parquet, api/data/equipements.geojson
Les données brutes sont lues, jamais exécutées.
"""

import shutil
import sys
from pathlib import Path

import pandas as pd

# python -I n'ajoute pas le dossier du script : on autorise seulement api/, jamais celui des données
sys.path.insert(0, str(Path(__file__).resolve().parent))
from calculs import normaliser

BAN = Path("/Users/luacsoulet/Desktop/Cours/api-web-data/donnees-brutes/ban/adresses-45.csv")  # fmt: skip
RACINE = Path(__file__).resolve().parent.parent
OUT = RACINE / "api/data"

df = pd.read_csv(
    BAN,
    sep=";",
    usecols=[
        "numero",
        "rep",
        "nom_voie",
        "code_postal",
        "code_insee",
        "nom_commune",
        "lon",
        "lat",
    ],
    dtype={"numero": "Int64", "rep": str, "code_postal": str, "code_insee": str},
)
df = df.dropna(subset=["nom_voie", "lon", "lat"])
# 99999 = lieu-dit sans numéro dans la BAN
num = df["numero"].where(df["numero"] != 99999).astype(str).replace("<NA>", "")
num = (num + df["rep"].fillna("")).str.strip()
df["libelle"] = (
    (num + " " + df["nom_voie"]).str.strip() + " " + df["code_postal"].fillna("") + " " + df["nom_commune"]
)  # fmt: skip
df = df.sort_values(["nom_commune", "nom_voie", "numero"]).drop_duplicates("libelle")
out = pd.DataFrame(
    {
        "libelle": df["libelle"],
        "code_insee": df["code_insee"],
        # float32 : ~2 cm de précision, fichier plus léger
        "lon": df["lon"].astype("float32"),
        "lat": df["lat"].astype("float32"),
        # espaces aux bords : recherche par début de mot (" tok")
        "recherche": " " + normaliser(df["libelle"]) + " ",
    }
)
out.to_parquet(OUT / "adresses.parquet", index=False, compression="zstd")
shutil.copyfile(
    RACINE / "web/public/couches/equipements.geojson", OUT / "equipements.geojson"
)
print(
    len(out),
    "adresses ;",
    round((OUT / "adresses.parquet").stat().st_size / 1e6, 2),
    "Mo",
)
