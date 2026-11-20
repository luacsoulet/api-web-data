"""Modèle d'estimation : régression sur log(valeur_fonciere), entraîné sur les ventes DVF.

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
NUMERIQUES = [
    "surface_reelle_bati", "nombre_pieces_principales", "surface_terrain",
    "annee", "avec_jardin", "avec_dependance",
]  # fmt: skip
FEATURES = ["type", "code_commune", *NUMERIQUES]


def preparer(df: pd.DataFrame) -> pd.DataFrame:
    x = df[FEATURES].copy()
    x["surface_terrain"] = x["surface_terrain"].fillna(0)
    x[["avec_jardin", "avec_dependance"]] = x[
        ["avec_jardin", "avec_dependance"]
    ].astype(int)
    return x


def entrainer(df: pd.DataFrame) -> dict:
    x, y = preparer(df), np.log1p(df["valeur_fonciere"])
    x_tr, x_te, y_tr, y_te = train_test_split(x, y, test_size=0.2, random_state=42)
    pipe = Pipeline(
        [
            (
                "prep",
                ColumnTransformer(
                    [
                        ("type", OneHotEncoder(handle_unknown="ignore"), ["type"]),
                        # 325 communes : encodage cible (le mode catégoriel du HGB plafonne à 255)
                        (
                            "commune",
                            TargetEncoder(cv=KFold(5, shuffle=True, random_state=42)),
                            ["code_commune"],
                        ),
                    ],
                    remainder="passthrough",
                ),
            ),
            ("hgb", HistGradientBoostingRegressor(random_state=42)),
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
