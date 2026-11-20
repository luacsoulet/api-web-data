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

Classe = Literal["A", "B", "C", "D", "E", "F", "G"]
Alea = Literal["faible", "moyen", "fort"]


def filtres(
    type: Literal["Maison", "Appartement", "Tous"] = "Maison",
    budget_max: Annotated[int | None, Query(ge=10_000, le=2_000_000)] = None,
    annee: Annotated[int | None, Query(ge=2021, le=2026)] = None,
    annee_min: Annotated[int, Query(ge=2021, le=2026)] = 2021,
    annee_max: Annotated[int, Query(ge=2021, le=2026)] = 2026,
    surface_min: Annotated[int | None, Query(ge=9, le=400)] = None,
    surface_max: Annotated[int | None, Query(ge=9, le=400)] = None,
    pieces_min: Annotated[int | None, Query(ge=1, le=10)] = None,
    jardin: bool = False,
    dependance: bool = False,
    piscine: bool = False,
    dpe: Annotated[list[Classe] | None, Query()] = None,
    argile_max: Alea | None = None,
    hors_inondable: bool = False,
    hors_nappe: bool = False,
    materiau: Annotated[str | None, Query(max_length=40)] = None,
    construit_apres: Annotated[int | None, Query(ge=1000, le=2030)] = None,
    construit_avant: Annotated[int | None, Query(ge=1000, le=2030)] = None,
    medecins_min: Annotated[int | None, Query(ge=0, le=500)] = None,
    ecoles_min: Annotated[int | None, Query(ge=0, le=500)] = None,
    commerces_min: Annotated[int | None, Query(ge=0, le=500)] = None,
    gare_max_m: Annotated[int | None, Query(ge=0, le=50_000)] = None,
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


@app.get("/biens/{id_mutation}")
def bien(id_mutation: str):
    b = calculs.bien(id_mutation)
    if b is None:
        raise HTTPException(404, f"Vente {id_mutation} inconnue")
    return b


Longitude = Annotated[float, Query(ge=-5.5, le=10)]
Latitude = Annotated[float, Query(ge=41, le=51.5)]


@app.get("/contexte")
def contexte(longitude: Longitude, latitude: Latitude):
    return calculs.contexte(longitude, latitude)


@app.get("/adresses")
def adresses(q: Annotated[str, Query(min_length=3, max_length=100)]):
    return calculs.adresses(q)


@app.get("/autour")
def autour(
    f: Filtres,
    longitude: Longitude,
    latitude: Latitude,
    rayon_m: Annotated[int, Query(ge=100, le=5000)] = 500,
):
    return calculs.autour(f, longitude, latitude, rayon_m)


# facteur -> colonnes ramenées à la valeur « sans défaut » pour mesurer son impact
REFERENCES = {
    "alea_argile": {"alea_argile": "faible"},
    "zone_inondable_scenario": {"zone_inondable_scenario": None},
    "sensibilite_nappe": {"sensibilite_nappe": "aucune"},
    "dpe_classe": {"dpe_classe": "D"},
    "bruit_lden_max_db": {"bruit_lden_max_db": None},
    "perimetre_mh_500m": {"perimetre_mh_500m": False, "distance_mh_m": 600.0},
    "piscine": {"piscine": False},
}
LIBELLES = {
    "alea_argile": "argile",
    "zone_inondable_scenario": "zone inondable",
    "sensibilite_nappe": "remontée de nappe",
    "dpe_classe": "DPE",
    "bruit_lden_max_db": "bruit",
    "perimetre_mh_500m": "périmètre monument historique",
    "piscine": "piscine",
}
VALEURS = {
    "debordement_nappe": "débordement",
    "inondation_cave": "caves inondables",
    "frequent": "crue fréquente",
    "moyen": "moyen",
    "extreme": "crue extrême",
}
MARGE_MAX = 0.25  # plafond de la marge justifiée par les défauts, en part du prix
# Forfaits indicatifs de négociation par aléa (part du prix) : arguments d'acheteur, pas mesurés sur les ventes
# passées (où les zones inondables de la Loire ne sont pas moins chères).
# shortcut: valeurs fixées à la main, à recaler si une étude de décote locale est disponible.
FORFAITS = {
    "zone_inondable_scenario": {"frequent": 0.08, "moyen": 0.05, "extreme": 0.02},
    "alea_argile": {"fort": 0.04, "moyen": 0.02},
    "sensibilite_nappe": {"debordement_nappe": 0.03, "inondation_cave": 0.015},
}


def _forfait(f) -> float:
    if f["facteur"] == "bruit_lden_max_db":
        v = f["valeur"] or 0
        return 0.03 if v >= 65 else 0.01 if v >= 55 else 0.0
    return FORFAITS.get(f["facteur"], {}).get(f["valeur"], 0.0)


def _nom(f) -> str:
    v = f["valeur"]
    return LIBELLES[f["facteur"]] + ("" if isinstance(v, bool) else f" {v:g} dB" if isinstance(v, float) else f" {VALEURS.get(v, v)}")  # fmt: skip


def _arguments(facteurs, prix) -> list[dict]:
    """Par défaut : le plus fort entre l'impact mesuré par le modèle et le forfait indicatif de l'aléa."""
    out = []
    for f in facteurs:
        modele, forfait = max(-f["impact_eur"], 0.0), _forfait(f) * prix
        montant = max(modele, forfait)
        if montant < 1:
            continue
        out.append({
            "facteur": f["facteur"], "valeur": f["valeur"], "libelle": _nom(f),
            "source": "forfait" if forfait > modele else "modele", "montant_eur": montant, "pct": montant / prix,
        })  # fmt: skip
    return sorted(out, key=lambda a: -a["montant_eur"])


def _eur(x: float) -> str:
    return f"{x:,.0f} €".replace(",", " ")


def _marge(facteurs, prix, mae, prix_demande) -> dict:
    args = _arguments(facteurs, prix)
    ref = prix_demande or prix
    justifiee = min(sum(a["montant_eur"] for a in args), MARGE_MAX * ref)
    haute = max(justifiee, prix_demande - prix) if prix_demande else justifiee
    pct = haute / ref
    pct_fr = f"{pct * 100:.1f} %".replace(".", ",")

    if args:
        raisons = ", ".join(
            f"{a['libelle']} (-{_eur(a['montant_eur'])}{', forfait indicatif' if a['source'] == 'forfait' else ''})"
            for a in args
        )
        texte = f"Défauts à faire valoir, jusqu'à {_eur(justifiee)} : {raisons}."
    else:
        texte = "Aucun défaut connu à faire valoir."
    if any(a["source"] == "forfait" for a in args):
        texte += " Forfait indicatif = argument de négociation : les ventes passées ne montrent pas cette décote."
    if prix_demande and prix_demande - prix > justifiee:
        texte += (
            f" Le prix demandé dépasse l'estimation de "
            f"{_eur(prix_demande - prix)} : marge haute {_eur(haute)} ({pct_fr})."
        )
    texte += f" Erreur moyenne du modèle : ± {_eur(mae)}."
    return {
        "basse_eur": justifiee,
        "haute_eur": haute,
        "pct": pct,
        "explication": texte,
        "arguments": args,
    }


@app.get("/estimation")
def estimation(
    type: Literal["Maison", "Appartement"],
    code_commune: str,
    surface: Annotated[float, Query(ge=9, le=400)],
    pieces: Annotated[int, Query(ge=1, le=20)],
    jardin: bool = False,
    dependance: bool = False,
    prix_demande: Annotated[float | None, Query(gt=0)] = None,
    annee_construction: Annotated[int | None, Query(ge=1000, le=2030)] = None,
    dpe: Classe | None = None,
    materiau_murs: Annotated[str | None, Query(max_length=40)] = None,
    piscine: bool = False,
    alea_argile: Alea | None = None,
    # « aucune » = hors zone inondable (ajout au contrat : sans lui on ne peut pas forcer « hors zone »)
    zone_inondable: Literal["frequent", "moyen", "extreme", "aucune"] | None = None,
    sensibilite_nappe: Literal["aucune", "inondation_cave", "debordement_nappe"]
    | None = None,
    bruit_db: Annotated[float | None, Query(ge=0, le=120)] = None,
    longitude: Longitude | None = None,
    latitude: Latitude | None = None,
):
    df = calculs.charger()
    if code_commune not in set(df["code_commune"]):
        raise HTTPException(404, f"Commune {code_commune} inconnue")
    if (longitude is None) != (latitude is None):
        raise HTTPException(422, "longitude et latitude vont ensemble")
    m = charger_modele()

    # risques et équipements : voisinage du point (< 150 m), sinon valeurs typiques de la commune
    ctx = calculs.contexte(longitude, latitude) if longitude is not None else None
    proche = ctx is not None and (ctx["distance_m"] or 1e9) <= calculs.VOISINAGE_M
    bien = ctx if proche else calculs.valeurs_commune(code_commune)
    # ce que l'utilisateur a saisi l'emporte sur le voisinage
    if alea_argile:
        bien["alea_argile"] = alea_argile
    if zone_inondable:
        bien["zone_inondable_scenario"] = None if zone_inondable == "aucune" else zone_inondable  # fmt: skip
    if sensibilite_nappe:
        bien["sensibilite_nappe"] = sensibilite_nappe
    if bruit_db is not None:
        bien["bruit_lden_max_db"] = bruit_db
    bien |= {
        "type": type,
        "code_commune": code_commune,
        "surface_reelle_bati": surface,
        "nombre_pieces_principales": pieces,
        # le contrat ne demande pas le terrain : médiane des ventes de la commune et du type
        "surface_terrain": calculs.terrain_median(type, code_commune),
        "annee": int(df["annee"].max()),
        "avec_jardin": jardin,
        "avec_dependance": dependance,
        "piscine": piscine,
        "bat_annee_construction": annee_construction,
        "dpe_classe": dpe,
        "bat_materiau_murs": materiau_murs.upper() if materiau_murs else None,
    }

    # contrefactuels : le même bien avec un facteur ramené à sa valeur de référence
    variantes = {
        f: ref
        for f, ref in REFERENCES.items()
        if bien.get(f) not in (None, False, *ref.values())
        and not (f == "bruit_lden_max_db" and bien[f] < 55)
    }
    lignes = [bien, *({**bien, **ref} for ref in variantes.values())]
    x = modele.preparer(pd.DataFrame(lignes).reindex(columns=modele.BRUTES))
    preds = np.expm1(m["pipeline"].predict(x))
    prix = float(preds[0])
    facteurs = sorted(
        (
            {
                "facteur": f,
                "valeur": bien[f],
                "impact_eur": prix - float(p),
                "impact_pct": (prix - float(p)) / prix,
            }
            for f, p in zip(variantes, preds[1:])
        ),
        key=lambda f: f["impact_eur"],
    )

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
        "facteurs": facteurs,
        "marge_negociation": _marge(facteurs, prix, m["mae"], prix_demande),
        "a_verifier": calculs.attention(bien),
        "variables_modele": modele.VARIABLES,
        "contexte_source": "voisinage" if proche else "commune",
    }
