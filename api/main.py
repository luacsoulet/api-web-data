from functools import lru_cache
from typing import Annotated, Literal

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import calculs
import modele

app = FastAPI(title="Immo Orléans")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def filtres(
    type: Literal["Maison", "Appartement", "Tous"] = "Maison",
    budget_max: Annotated[int | None, Query(ge=10_000, le=2_000_000)] = None,
    annee: Annotated[int | None, Query(ge=2021, le=2025)] = None,
    annee_min: Annotated[int, Query(ge=2021, le=2025)] = 2021,
    annee_max: Annotated[int, Query(ge=2021, le=2025)] = 2025,
    surface_min: Annotated[int | None, Query(ge=9, le=400)] = None,
    surface_max: Annotated[int | None, Query(ge=9, le=400)] = None,
    pieces_min: Annotated[int | None, Query(ge=1, le=10)] = None,
    jardin: bool = False,
    dependance: bool = False,
) -> dict:
    # dépendance partagée par toutes les routes de données
    if annee is not None:  # annee seule = annee_min = annee_max
        annee_min = annee_max = annee
    if annee_min > annee_max:
        raise HTTPException(422, "annee_min doit être inférieure ou égale à annee_max")
    if (
        surface_min is not None
        and surface_max is not None
        and surface_min > surface_max
    ):
        raise HTTPException(
            422, "surface_min doit être inférieure ou égale à surface_max"
        )
    return locals()


Filtres = Annotated[dict, Depends(filtres)]


@lru_cache
def charger_modele() -> dict:
    # chargé une fois ; entraîné ici seulement si modele.joblib manque (build Docker l'a déjà fait)
    if modele.SORTIE.exists():
        return joblib.load(modele.SORTIE)
    m = modele.entrainer(calculs.charger())
    joblib.dump(m, modele.SORTIE)
    return m


def commune_ou_404(f: dict, code: str) -> dict:
    c = calculs.commune(f, code)
    if c is None:
        raise HTTPException(404, f"Commune {code} inconnue")
    return c


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/kpis")
def kpis(f: Filtres):
    return calculs.kpis(f)


@app.get("/communes")
def communes(
    f: Filtres,
    min_ventes: Annotated[int, Query(ge=1, le=1000)] = 30,
    limit: Annotated[int, Query(ge=1, le=325)] = 15,
):
    return calculs.communes(f, min_ventes, limit)


@app.get("/evolution")
def evolution(f: Filtres):
    return calculs.evolution(f)


@app.get("/evolution/tranches")
def evolution_tranches(f: Filtres):
    return calculs.evolution_tranches(f)


@app.get("/carte")
def carte(f: Filtres):
    return calculs.carte(f)


@app.get("/ventes")
def ventes(f: Filtres, limit: Annotated[int, Query(ge=1, le=5000)] = 3000):
    return calculs.ventes(f, limit)


@app.get("/points")
def points(f: Filtres, limit: Annotated[int, Query(ge=1, le=2000)] = 500):
    return calculs.points(f, limit)


@app.get("/bien/{id_mutation}")
def bien(id_mutation: str):
    b = calculs.bien(id_mutation)
    if b is None:
        raise HTTPException(404, f"Bien {id_mutation} inconnu")
    return b


@app.post("/resume")
def resume(payload: dict):
    """Couche intelligente IA generique : resume l'agregat de la vue filtree."""
    return {"resume": calculs.resumer_ia(payload)}


@app.get("/communes/{code}")
def commune(f: Filtres, code: str):
    return commune_ou_404(f, code)


@app.get("/communes/{code}/sections")
def sections(f: Filtres, code: str):
    commune_ou_404(f, code)
    return calculs.sections(f, code)


@app.get("/communes/{code}/ventes")
def ventes_commune(
    f: Filtres,
    code: str,
    section: str | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
):
    commune_ou_404(f, code)
    return calculs.ventes_commune(f, code, section, limit)


@app.get("/estimation")
def estimation(
    type: Literal["Maison", "Appartement"],
    code_commune: str,
    surface: Annotated[float, Query(ge=9, le=400)],
    pieces: Annotated[int, Query(ge=1, le=20)],
    jardin: bool = False,
    dependance: bool = False,
    prix_demande: Annotated[float | None, Query(gt=0)] = None,
):
    if code_commune not in set(calculs.charger()["code_commune"]):
        raise HTTPException(404, f"Commune {code_commune} inconnue")
    m = charger_modele()
    x = pd.DataFrame(
        [
            {
                "type": type,
                "code_commune": code_commune,
                "surface_reelle_bati": surface,
                "nombre_pieces_principales": pieces,
                # le contrat ne demande pas le terrain : médiane des ventes de la commune et du type
                "surface_terrain": calculs.terrain_median(type, code_commune),
                "annee": 2025,
                "avec_jardin": int(jardin),
                "avec_dependance": int(dependance),
            }
        ]
    )[modele.FEATURES]
    prix = float(np.expm1(m["pipeline"].predict(x)[0]))
    basse, haute = max(prix - m["mae"], 0.0), prix + m["mae"]
    verdict = None
    if prix_demande is not None:
        verdict = (
            "au-dessus"
            if prix_demande > haute
            else "au-dessous"
            if prix_demande < basse
            else "dans la fourchette"
        )
    return {
        "prix_estime": prix,
        "fourchette_basse": basse,
        "fourchette_haute": haute,
        "mae": m["mae"],
        "mape": m["mape"],
        "n_entrainement": m["n_train"],
        "n_test": m["n_test"],
        "comparables": calculs.comparables(type, code_commune, surface),
        "comparables_ventes": calculs.comparables_ventes(type, code_commune, surface),
        "verdict": verdict,
    }
