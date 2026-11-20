"""Modèle d'estimation : régression sur log(valeur_fonciere), entraîné sur les ventes DVF enrichies.

Lancer : uv run python modele.py  (écrit modele.joblib avec ses métriques de test)
"""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import KFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, TargetEncoder

SORTIE = Path(__file__).parent / "modele.joblib"

# Colonnes brutes (noms de biens.parquet) lues par preparer()
BRUTES = [
    "type", "code_commune", "surface_reelle_bati", "nombre_pieces_principales",
    "surface_terrain", "annee", "avec_jardin", "avec_dependance", "piscine",
    "bat_annee_construction", "dpe_classe", "bat_materiau_murs", "alea_argile",
    "zone_inondable_scenario", "sensibilite_nappe", "bruit_lden_max_db", "distance_mh_m",
    "perimetre_mh_500m", "nb_medecins_generalistes_1km", "nb_ecoles_1km",
    "nb_commerces_alimentaires_1km", "dist_gare_proche_m", "niveau_vie_moyen_carreau",
]  # fmt: skip
ORDRES = {
    "dpe_classe": {c: i for i, c in enumerate("ABCDEFG", 1)},
    "alea_argile": {"faible": 0, "moyen": 1, "fort": 2},
    "zone_inondable_scenario": {"extreme": 1, "moyen": 2, "frequent": 3},
    "sensibilite_nappe": {"aucune": 0, "inondation_cave": 1, "debordement_nappe": 2},
}
MATERIAUX = ["PIERRE", "MEULIERE", "BRIQUES", "BETON", "AGGLOMERE", "BOIS"]
# un défaut ne peut que faire baisser le prix (un atout, le monter) : contrainte monotone, sinon le HGB apprend des corrélations de quartier
MONOTONE = {
    "piscine": 1,
    "avec_jardin": 1,
    "avec_dependance": 1,
    "dpe_classe": -1,
    "alea_argile": -1,
    "zone_inondable_scenario": -1,
    "sensibilite_nappe": -1,
    "bruit_lden_max_db": -1,
}
VARIABLES = [b if b != "bat_materiau_murs" else "materiau" for b in BRUTES]


def _materiau(s: pd.Series) -> pd.Series:
    # premier matériau reconnu de « BRIQUES - PIERRE » ; sinon AUTRES / INCONNU
    out = pd.Series("AUTRES", index=s.index)
    for m in reversed(MATERIAUX):
        out[s.str.contains(m, na=False, regex=False)] = m
    return out.where(s.notna() & (s != "INDETERMINE"), "INCONNU")


def preparer(df: pd.DataFrame) -> pd.DataFrame:
    x = df[BRUTES].copy()
    x["surface_terrain"] = x["surface_terrain"].fillna(0)
    # hors zone inondable / hors carte de bruit (< 55 dB) : valeur « sans défaut », pas inconnue
    x["zone_inondable_scenario"] = x["zone_inondable_scenario"].fillna("aucun")
    x["bruit_lden_max_db"] = x["bruit_lden_max_db"].fillna(50).astype(float)
    for c, ordre in ORDRES.items():
        x[c] = x[c].map(ordre | {"aucun": 0}).astype(float)
    for c in ["avec_jardin", "avec_dependance", "piscine", "perimetre_mh_500m"]:
        x[c] = x[c].astype(bool).astype(int)
    x["materiau"] = _materiau(x.pop("bat_materiau_murs"))
    return x[VARIABLES]


def entrainer(df: pd.DataFrame) -> dict:
    x, y = preparer(df), np.log1p(df["valeur_fonciere"])
    x_tr, x_te, y_tr, y_te = train_test_split(x, y, test_size=0.2, random_state=42)
    cat = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    pipe = Pipeline(
        [
            (
                "prep",
                ColumnTransformer(
                    [
                        ("cat", cat, ["type", "materiau"]),
                        # 325 communes : encodage cible (le mode catégoriel du HGB plafonne à 255)
                        (
                            "commune",
                            TargetEncoder(cv=KFold(5, shuffle=True, random_state=42)),
                            ["code_commune"],
                        ),
                    ],
                    remainder="passthrough",
                    verbose_feature_names_out=False,
                ).set_output(transform="pandas"),
            ),
            (
                "hgb",
                HistGradientBoostingRegressor(random_state=42, monotonic_cst=MONOTONE),
            ),
        ]
    )
    pipe.fit(x_tr, y_tr)
    vrai, pred = np.expm1(y_te), np.expm1(pipe.predict(x_te))
    return {
        "pipeline": pipe,
        "mae": float(np.mean(np.abs(vrai - pred))),
        "mape": float(np.mean(np.abs(vrai - pred) / vrai)),
        "n_train": len(x_tr),
        "n_test": len(x_te),
    }


if __name__ == "__main__":
    from calculs import charger

    m = entrainer(charger())
    joblib.dump(m, SORTIE)
    print(
        f"MAE {m['mae']:,.0f} €, MAPE {m['mape']:.1%}, "
        f"{m['n_train']} entraînement / {m['n_test']} test -> {SORTIE.name}"
    )
