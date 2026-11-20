"""Serveur MCP local (stdio) sur les ventes immobilières du Loiret (DVF 2021-06 à 2026-06)."""

import json
import os
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Annotated, Literal

import pandas as pd
from mcp.server.fastmcp import FastMCP
from pydantic import Field

RACINE = Path(__file__).resolve().parent.parent
GROUPEES = Path("/Users/luacsoulet/Desktop/Cours/api-web-data/donnees-groupees")
API = os.environ.get("IMMO_API_URL", "http://127.0.0.1:8000").rstrip("/")

mcp = FastMCP("immo-loiret")

_biens_path = RACINE / "api/data/biens.parquet"
if not _biens_path.exists():
    _biens_path = GROUPEES / "biens_45.parquet"
BIENS = pd.read_parquet(_biens_path)
COMMUNES = pd.read_parquet(GROUPEES / "communes_45.parquet")
DICO = pd.read_csv(GROUPEES / "dictionnaire.csv")

Type = Literal["Maison", "Appartement"]
ARGILE = {"faible": 0, "moyen": 1, "fort": 2}
COLONNES_COMPACTES = [
    "id_mutation", "date_mutation", "nom_commune", "type", "valeur_fonciere",
    "surface_reelle_bati", "nombre_pieces_principales", "prix_m2", "surface_terrain",
    "piscine", "dpe_classe", "alea_argile", "zone_inondable_scenario",
    "bat_annee_construction",
]  # fmt: skip


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode()
    return s.lower().replace("-", " ").replace("'", " ").strip()


_NOMS = {_norm(n): c for c, n in zip(COMMUNES["code_commune"], COMMUNES["nom_commune"])}


def _code(commune: str) -> str:
    """Nom (accents/casse ignorés) ou code INSEE -> code INSEE ; ValueError claire sinon."""
    c = commune.strip()
    if c in set(COMMUNES["code_commune"]):
        return c
    if _norm(c) in _NOMS:
        return _NOMS[_norm(c)]
    proches = [n for n in _NOMS if _norm(c) in n][:5]
    raise ValueError(f"Commune '{commune}' inconnue dans le Loiret. Proches : {proches}")


def _propre(v):
    """Valeur JSON-compatible (NaN -> None, numpy -> python)."""
    if pd.isna(v):
        return None
    return v.item() if hasattr(v, "item") else v


def _lignes(df: pd.DataFrame, cols: list[str]) -> list[dict]:
    return [{c: _propre(r[c]) for c in cols} for _, r in df.iterrows()]


def _api(chemin: str, params: dict | None = None):
    q = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
    url = f"{API}{chemin}" + (f"?{q}" if q else "")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"L'API a répondu {e.code} : {e.read().decode()[:300]}") from e
    except OSError as e:
        raise RuntimeError(
            f"API injoignable sur {API} ({e}). Lancer l'API (cd api && uv run fastapi dev) "
            "ou définir IMMO_API_URL."
        ) from e


@mcp.tool()
def chercher_biens(
    commune: str | None = None,
    type: Type | None = None,
    budget_max: Annotated[float | None, Field(gt=0)] = None,
    surface_min: Annotated[float | None, Field(ge=0, le=1000)] = None,
    piscine: bool | None = None,
    dpe_max: Annotated[str | None, Field(pattern="^[A-Ga-g]$")] = None,
    hors_inondable: bool = False,
    argile_max: Literal["faible", "moyen", "fort"] | None = None,
    limite: Annotated[int, Field(ge=1, le=50)] = 20,
) -> list[dict]:
    """Cherche des ventes passées (DVF) correspondant à des critères, les moins chères au m² d'abord.
    À utiliser pour « trouve-moi des maisons à Olivet sous 300 000 € sans risque inondation ».
    commune : nom ou code INSEE. dpe_max : pire classe acceptée (ex. 'C' garde A, B, C).
    argile_max : aléa retrait-gonflement maximal accepté. hors_inondable : exclut la zone TRI.
    Retourne des lignes compactes ; utiliser fiche_bien(id_mutation) pour le détail."""
    d = BIENS
    if commune:
        d = d[d["code_commune"] == _code(commune)]
    if type:
        d = d[d["type"] == type]
    if budget_max:
        d = d[d["valeur_fonciere"] <= budget_max]
    if surface_min:
        d = d[d["surface_reelle_bati"] >= surface_min]
    if piscine is not None:
        d = d[d["piscine"] == piscine]
    if dpe_max:
        ok = list("ABCDEFG")[: "ABCDEFG".index(dpe_max.upper()) + 1]
        d = d[d["dpe_classe"].isin(ok)]
    if hors_inondable:
        d = d[d["zone_inondable_scenario"].isna()]
    if argile_max:
        d = d[d["alea_argile"].map(ARGILE).fillna(-1) <= ARGILE[argile_max]]
    return _lignes(d.sort_values("prix_m2").head(limite), COLONNES_COMPACTES)


@mcp.tool()
def fiche_bien(id_mutation: str) -> dict:
    """Fiche complète d'une vente (toutes les colonnes) avec ses « points d'attention »
    (argile, inondation, DPE, bruit, amiante/plomb…). À utiliser après chercher_biens pour
    creuser un bien. Nécessite l'API locale pour les points d'attention ; sans elle, repli
    sur la ligne du parquet seule."""
    try:
        return _api(f"/biens/{urllib.parse.quote(id_mutation, safe='')}")
    except RuntimeError as e:
        ligne = BIENS[BIENS["id_mutation"] == id_mutation]
        if ligne.empty:
            raise ValueError(f"Vente {id_mutation} inconnue") from e
        fiche = {c: _propre(v) for c, v in ligne.iloc[0].items()}
        fiche["attention"] = None
        fiche["avertissement"] = str(e)
        return fiche


@mcp.tool()
def stats_commune(commune: str) -> dict:
    """Statistiques d'une commune : médianes de prix, de prix au m² et nombre de ventes par type
    et par année, plus le contexte (loyers au m², niveau de vie, catastrophes naturelles, risques).
    À utiliser pour « que valent les biens à Olivet ? » ou pour juger un prix d'une commune.
    commune : nom (accents/casse ignorés) ou code INSEE. 2026 = premier semestre seulement."""
    code = _code(commune)
    d = BIENS[BIENS["code_commune"] == code]
    g = d.groupby(["type", "annee"]).agg(
        ventes=("id_mutation", "count"),
        prix_median=("valeur_fonciere", "median"),
        prix_m2_median=("prix_m2", "median"),
    )
    par = [
        {"type": t, "annee": int(a), **{k: _propre(v) for k, v in r.items()}}
        for (t, a), r in g.round(0).iterrows()
    ]
    ctx = COMMUNES[COMMUNES["code_commune"] == code].iloc[0]
    cles = [
        "loyer_app_m2", "loyer_mai_m2", "filosofi_niveau_vie_median", "filosofi_taux_pauvrete_pct",
        "catnat_nb_total", "catnat_nb_inondation", "catnat_nb_secheresse", "catnat_date_dernier",
        "pprn_existe", "pprn_types", "azi_existe", "casias_nb_sites", "icpe_nb_seveso",
    ]  # fmt: skip
    return {
        "code_commune": code,
        "nom_commune": ctx["nom_commune"],
        "nb_ventes": len(d),
        "par_type_et_annee": par,
        "contexte": {c: _propre(ctx[c]) for c in cles},
    }


@mcp.tool()
def comparer_communes(
    communes: Annotated[list[str], Field(min_length=2, max_length=10)],
    type: Type,
) -> list[dict]:
    """Compare 2 à 10 communes pour un type de bien (médiane prix, prix au m², surface, nombre de
    ventes depuis 2024, part en zone inondable, loyer au m²). À utiliser pour « Olivet ou
    Saran ? ». communes : noms ou codes INSEE."""
    out = []
    for c in communes:
        code = _code(c)
        d = BIENS[(BIENS["code_commune"] == code) & (BIENS["type"] == type) & (BIENS["annee"] >= 2024)]
        ctx = COMMUNES[COMMUNES["code_commune"] == code].iloc[0]
        part = round(d["zone_inondable_scenario"].notna().mean() * 100, 1) if len(d) else None
        out.append(
            {
                "commune": ctx["nom_commune"],
                "code_commune": code,
                "ventes_depuis_2024": len(d),
                "prix_median": _propre(d["valeur_fonciere"].median()),
                "prix_m2_median": _propre(d["prix_m2"].median()),
                "surface_mediane": _propre(d["surface_reelle_bati"].median()),
                "part_zone_inondable_pct": part,
                "loyer_m2": _propre(ctx["loyer_app_m2" if type == "Appartement" else "loyer_mai_m2"]),
            }
        )
    return out


@mcp.tool()
def estimer_bien(
    type: Type,
    commune: str,
    surface: Annotated[float, Field(ge=9, le=400)],
    pieces: Annotated[int, Field(ge=1, le=20)],
    jardin: bool = False,
    dependance: bool = False,
    prix_demande: Annotated[float | None, Field(gt=0)] = None,
    annee_construction: Annotated[int | None, Field(ge=1500, le=2026)] = None,
    dpe: Annotated[str | None, Field(pattern="^[A-Ga-g]$")] = None,
    materiau_murs: str | None = None,
    piscine: bool | None = None,
    alea_argile: Literal["faible", "moyen", "fort"] | None = None,
    zone_inondable: Literal["frequent", "moyen", "extreme"] | None = None,
    sensibilite_nappe: Literal["aucune", "inondation_cave", "debordement_nappe"] | None = None,
    bruit_db: Annotated[float | None, Field(ge=0, le=120)] = None,
    longitude: Annotated[float | None, Field(ge=-180, le=180)] = None,
    latitude: Annotated[float | None, Field(ge=-90, le=90)] = None,
) -> dict:
    """Estime le prix d'un bien (modèle ML de l'API locale) avec fourchette, facteurs chiffrés
    (argile, inondation, DPE…), marge de négociation et points à vérifier. À utiliser pour
    « combien vaut / combien négocier pour… ». Les critères de risque sont facultatifs ; si
    longitude/latitude sont donnés, l'API les déduit du voisinage. Nécessite l'API locale démarrée."""
    p = {
        "type": type, "code_commune": _code(commune), "surface": surface, "pieces": pieces,
        "jardin": str(jardin).lower(), "dependance": str(dependance).lower(),
        "prix_demande": prix_demande, "annee_construction": annee_construction,
        "dpe": dpe.upper() if dpe else None, "materiau_murs": materiau_murs,
        "piscine": None if piscine is None else str(piscine).lower(),
        "alea_argile": alea_argile, "zone_inondable": zone_inondable,
        "sensibilite_nappe": sensibilite_nappe, "bruit_db": bruit_db,
        "longitude": longitude, "latitude": latitude,
    }  # fmt: skip
    return _api("/estimation", p)


@mcp.tool()
def colonnes_disponibles() -> list[dict]:
    """Dictionnaire des données : nom, table (biens ou communes), source, description, groupe de
    chaque colonne. À utiliser pour savoir quelles informations existent avant de filtrer."""
    return _lignes(DICO, list(DICO.columns))


if __name__ == "__main__":
    mcp.run()
