from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

import calculs

app = FastAPI(title="Immo Orléans")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"])


def filtre_type(type: Literal["Maison", "Appartement", "Tous"] = "Maison") -> str:
    # dépendance partagée : on y ajoutera annee, budget_max au sprint 2
    return type


Type = Annotated[str, Depends(filtre_type)]


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/kpis")
def kpis(type: Type):
    return calculs.kpis(type)


@app.get("/communes")
def communes(
    type: Type,
    min_ventes: Annotated[int, Query(ge=1, le=1000)] = 30,
    limit: Annotated[int, Query(ge=1, le=325)] = 15,
):
    return calculs.communes(type, min_ventes, limit)


@app.get("/evolution")
def evolution(type: Type):
    return calculs.evolution(type)
