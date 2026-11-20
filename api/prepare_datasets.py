"""Convertit datasets/*.csv en parquet pour l'API. Lancer : uv run python prepare_datasets.py

- communes_infos.parquet : revenus Filosofi, CatNat, PPRN, équipements BPE, copropriétés, sites pollués, ICPE, loyers
- biens_complements.parquet : colonnes de biens_filtres.csv absentes de biens.parquet
Les adresses (adresse, adresse_code_voie) ne sont jamais lues : elles ne sont pas publiées.
"""

from pathlib import Path

import pandas as pd

ICI = Path(__file__).parent
SRC = ICI.parent / "datasets"
DATA = ICI / "data"

COMPLEMENTS = ["id_mutation", "hauteur_inondation_max_m", "dpe_classe_conso_2012", "bdnb_alea_debordement"]


def communes() -> pd.DataFrame:
    df = pd.read_csv(SRC / "2026-11-20T14-49_export.csv", dtype={"code_commune": str})
    df["code_commune"] = df["code_commune"].str.zfill(5)
    df = df.drop(columns="nom_commune").drop_duplicates("code_commune")
    df.to_parquet(DATA / "communes_infos.parquet", index=False)
    return df


def complements() -> pd.DataFrame:
    df = pd.read_csv(SRC / "biens_filtres.csv", usecols=COMPLEMENTS, dtype={"id_mutation": str})
    df = df.drop_duplicates("id_mutation")
    df.to_parquet(DATA / "biens_complements.parquet", index=False)
    return df


if __name__ == "__main__":
    c, b = communes(), complements()
    print(f"{len(c)} communes, {len(b)} biens -> data/")
