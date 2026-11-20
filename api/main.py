from typing import Annotated, Literal, Optional

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

import calculs

app = FastAPI(title="Immo Orléans")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def filtre_commun(
    type: Literal["Maison", "Appartement", "Tous"] = "Maison",
    annee: Optional[int] = Query(default=None, ge=2021, le=2025),
    budget_max: Optional[int] = Query(default=None, ge=0),
) -> dict:
    """Dépendance partagée : filtres type / annee / budget_max.
    On ajoutera d'autres filtres ici sans casser le contrat des routes."""
    return {"type": type, "annee": annee, "budget_max": budget_max}


Filtres = Annotated[dict, Depends(filtre_commun)]


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/kpis")
def kpis(f: Filtres):
    return calculs.kpis(f["type"], f["annee"], f["budget_max"])


@app.get("/communes")
def communes(
    f: Filtres,
    min_ventes: Annotated[int, Query(ge=1, le=1000)] = 30,
    limit: Annotated[int, Query(ge=1, le=325)] = 15,
):
    return calculs.communes(f["type"], f["annee"], f["budget_max"], min_ventes, limit)


@app.get("/evolution")
def evolution(f: Filtres):
    return calculs.evolution(f["type"], f["annee"], f["budget_max"])


@app.get("/points")
def points(
    f: Filtres,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
):
    return calculs.points(f["type"], f["annee"], f["budget_max"], limit)
