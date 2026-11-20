import json
import os
import urllib.request
from functools import lru_cache
from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / "data" / "immobilier.parquet"
COMMUNES = Path(__file__).parent / "data" / "communes.geojson"


@lru_cache
def charger() -> pd.DataFrame:
    return pd.read_parquet(DATA)


@lru_cache
def contours() -> dict:
    return json.loads(COMMUNES.read_text(encoding="utf-8"))


def filtrer(f: dict) -> pd.DataFrame:
    """f = filtres du contrat v2 (type, budget_max, annee_min, annee_max, surface_min, surface_max, pieces_min, jardin, dependance)."""
    df = charger()
    m = df["annee"].between(f["annee_min"], f["annee_max"])
    if f["type"] != "Tous":
        m &= df["type"] == f["type"]
    if f["budget_max"] is not None:
        m &= df["valeur_fonciere"] <= f["budget_max"]
    if f["surface_min"] is not None:
        m &= df["surface_reelle_bati"] >= f["surface_min"]
    if f["surface_max"] is not None:
        m &= df["surface_reelle_bati"] <= f["surface_max"]
    if f["pieces_min"] is not None:
        m &= df["nombre_pieces_principales"] >= f["pieces_min"]
    if f["jardin"]:
        m &= df["avec_jardin"]
    if f["dependance"]:
        m &= df["avec_dependance"]
    return df[m]


def _nombre(x):
    # NaN -> None pour que le JSON soit valide
    return None if pd.isna(x) else float(x)


def _medianes(df: pd.DataFrame) -> dict:
    return {
        "n": len(df),
        "prix_m2_median": _nombre(df["prix_m2"].median()),
        "valeur_median": _nombre(df["valeur_fonciere"].median()),
    }


def _par(df: pd.DataFrame, cles: list[str]) -> pd.DataFrame:
    return (
        df.groupby(cles)
        .agg(
            n=("id_mutation", "size"),
            prix_m2_median=("prix_m2", "median"),
            valeur_median=("valeur_fonciere", "median"),
        )
        .reset_index()
    )


def _records(df: pd.DataFrame) -> list[dict]:
    """Ventes -> dicts JSON : NaN -> null, dates YYYY-MM-DD, booléens natifs."""
    df = df.assign(date_mutation=df["date_mutation"].dt.strftime("%Y-%m-%d"))
    return json.loads(df.to_json(orient="records", force_ascii=False))


def kpis(f: dict) -> dict:
    df = filtrer(f)
    m = _medianes(df)
    return {
        "n_ventes": m["n"],
        "prix_m2_median": m["prix_m2_median"],
        "valeur_median": m["valeur_median"],
        "n_communes": int(df["code_commune"].nunique()),
    }


def communes(f: dict, min_ventes: int, limit: int) -> list[dict]:
    g = _par(filtrer(f), ["code_commune", "nom_commune"])
    g = g[g["n"] >= min_ventes].sort_values("prix_m2_median", ascending=False)
    return [
        {
            "code_commune": str(r.code_commune),
            "nom_commune": r.nom_commune,
            "n": int(r.n),
            "prix_m2_median": _nombre(r.prix_m2_median),
            "valeur_median": _nombre(r.valeur_median),
        }
        for r in g.head(limit).itertuples()
    ]


TRANCHES = [
    ("moins de 50 m²", 9, 50),
    ("50 à 80 m²", 50, 80),
    ("80 à 120 m²", 80, 120),
    ("120 m² et plus", 120, 401),  # bornes [min, max[ ; surface max 400 incluse
]


def _evol(g) -> dict:
    return {
        "annee": int(g.annee),
        "n": int(g.n),
        "prix_m2_median": _nombre(g.prix_m2_median),
    }


def _par_annee(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby("annee")
        .agg(
            n=("id_mutation", "size"),
            prix_m2_median=("prix_m2", "median"),
        )
        .reset_index()
        .sort_values("annee")
    )


def evolution(f: dict) -> list[dict]:
    return [_evol(r) for r in _par_annee(filtrer(f)).itertuples()]


def evolution_tranches(f: dict) -> list[dict]:
    df = filtrer(f)
    out = []
    smin, smax = f.get("surface_min") or 9, f.get("surface_max") or 400
    for nom, lo, hi in TRANCHES:
        # tranche touchée seulement par sa borne (ex. filtre jusqu'à 120 m², tranche 120+) : courbe trompeuse
        if min(hi - 1, smax) <= max(lo, smin):
            continue
        s = df["surface_reelle_bati"]
        out += [
            {"tranche": nom, **_evol(r)}
            for r in _par_annee(df[(s >= lo) & (s < hi)]).itertuples()
        ]
    return out


def carte(f: dict) -> dict:
    g = _par(filtrer(f), ["code_commune"]).set_index("code_commune")
    features = []
    for feat in contours()["features"]:
        p = feat["properties"]
        s = g.loc[p["code_insee"]] if p["code_insee"] in g.index else None
        features.append(
            {
                **feat,
                "properties": {
                    "code_insee": p["code_insee"],
                    "commune": p["commune"],
                    "n": 0 if s is None else int(s["n"]),
                    "prix_m2_median": None
                    if s is None
                    else _nombre(s["prix_m2_median"]),
                    "valeur_median": None if s is None else _nombre(s["valeur_median"]),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


PROPS_VENTE = [
    "id_mutation", "date_mutation", "type", "valeur_fonciere", "surface_reelle_bati",
    "nombre_pieces_principales", "prix_m2", "nom_commune", "section", "avec_jardin",
    "avec_dependance",
]  # fmt: skip


def _points(df: pd.DataFrame) -> list[dict]:
    coords = df[["longitude", "latitude"]].to_numpy().tolist()
    return [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": c},
            "properties": p,
        }
        for c, p in zip(coords, _records(df[PROPS_VENTE]))
    ]


def ventes(f: dict, limit: int) -> dict:
    df = filtrer(f).dropna(subset=["longitude", "latitude"])
    total = len(df)
    df = df.sort_values("date_mutation", ascending=False).head(limit)
    return {"type": "FeatureCollection", "total": total, "features": _points(df)}


def commune(f: dict, code: str) -> dict | None:
    """None si le code est inconnu (aucune vente de la commune, tous filtres confondus)."""
    toutes = charger()
    noms = toutes.loc[toutes["code_commune"] == code, "nom_commune"]
    if noms.empty:
        return None
    df = filtrer(f)
    return {
        "code_commune": code,
        "nom_commune": noms.iloc[0],
        **_medianes(df[df["code_commune"] == code]),
    }


def sections(f: dict, code: str) -> list[dict]:
    df = filtrer(f)
    g = _par(df[df["code_commune"] == code], ["section"])
    g = g.sort_values("prix_m2_median", ascending=False)
    return [
        {
            "section": r.section,
            "n": int(r.n),
            "prix_m2_median": _nombre(r.prix_m2_median),
            "valeur_median": _nombre(r.valeur_median),
        }
        for r in g.itertuples()
    ]


COLS_VENTE_COMMUNE = [
    "id_mutation", "date_mutation", "type", "valeur_fonciere", "surface_reelle_bati",
    "nombre_pieces_principales", "prix_m2", "surface_terrain", "section",
    "avec_dependance", "avec_jardin", "avec_eau", "longitude", "latitude",
]  # fmt: skip


def ventes_commune(f: dict, code: str, section: str | None, limit: int) -> list[dict]:
    df = filtrer(f)
    df = df[df["code_commune"] == code]
    if section:
        df = df[df["section"] == section]
    df = df.sort_values("date_mutation", ascending=False).head(limit)
    return _records(df[COLS_VENTE_COMMUNE])


def _comparables(type_: str, code: str, surface: float) -> pd.DataFrame:
    df = charger()
    return df[
        (df["code_commune"] == code)
        & (df["type"] == type_)
        & df["surface_reelle_bati"].between(surface * 0.8, surface * 1.2)
    ]


def comparables(type_: str, code: str, surface: float) -> dict:
    df = _comparables(type_, code, surface)
    return {"n": len(df), "prix_median": _nombre(df["valeur_fonciere"].median())}


def comparables_ventes(type_: str, code: str, surface: float) -> dict:
    df = _comparables(type_, code, surface).dropna(subset=["longitude", "latitude"])
    df = df.sort_values("date_mutation", ascending=False).head(300)
    return {"type": "FeatureCollection", "features": _points(df)}


def terrain_median(type_: str, code: str) -> float:
    df = charger()
    t = df.loc[(df["code_commune"] == code) & (df["type"] == type_), "surface_terrain"]
    return float(t.fillna(0).median()) if len(t) else 0.0


def points(f: dict, limit: int = 500) -> list[dict]:
    """Ventes geolocalisees pour les marqueurs de la carte (type maps)."""
    df = filtrer(f).dropna(subset=["latitude", "longitude"]).head(limit)
    return [
        {
            "id_mutation": str(r.id_mutation),
            "nom_commune": r.nom_commune,
            "type": r.type,
            "prix": _nombre(r.valeur_fonciere),
            "surface": _nombre(r.surface_reelle_bati),
            "prix_m2": _nombre(r.prix_m2),
            "nombre_pieces": _nombre(r.nombre_pieces_principales),
            "date": str(r.date_mutation.date()) if pd.notna(r.date_mutation) else None,
            "latitude": float(r.latitude),
            "longitude": float(r.longitude),
        }
        for r in df.itertuples()
    ]


def bien(id_mutation: str) -> dict | None:
    """Une vente + médiane €/m² des ventes de même type dans la même commune ; None si inconnue."""
    df = charger()
    lignes = df[df["id_mutation"].astype(str) == id_mutation]
    if lignes.empty:
        return None
    r = lignes.iloc[0]
    voisines = df[(df["code_commune"] == r.code_commune) & (df["type"] == r.type)]
    med = _nombre(voisines["prix_m2"].median())
    prix_m2 = _nombre(r.prix_m2)
    return {
        "id_mutation": str(r.id_mutation),
        "date_mutation": str(r.date_mutation.date()) if pd.notna(r.date_mutation) else None,
        "annee": None if pd.isna(r.annee) else int(r.annee),
        "valeur_fonciere": _nombre(r.valeur_fonciere),
        "type": r.type,
        "surface_reelle_bati": _nombre(r.surface_reelle_bati),
        "nombre_pieces_principales": _nombre(r.nombre_pieces_principales),
        "prix_m2": prix_m2,
        "surface_terrain": _nombre(r.surface_terrain),
        "code_commune": r.code_commune,
        "nom_commune": r.nom_commune,
        "code_postal": None if pd.isna(r.code_postal) else str(r.code_postal),
        "section": None if pd.isna(r.section) else str(r.section),
        "longitude": _nombre(r.longitude),
        "latitude": _nombre(r.latitude),
        "prix_m2_median_commune": med,
        "ecart_pct": None if med is None or prix_m2 is None or med == 0 else round((prix_m2 / med - 1) * 100, 1),
    }


def resumer_ia(agregat: dict) -> str:
    """Appelle n'importe quelle IA compatible OpenAI pour resumer l'agregat.
    Variables d'env : IA_URL, IA_KEY, IA_MODEL."""
    url = os.environ.get("IA_URL")
    key = os.environ.get("IA_KEY")
    model = os.environ.get("IA_MODEL", "ia")
    if not url or not key:
        return "Couche IA non configuree : definissez IA_URL et IA_KEY."
    consigne = (
        "Resume ce tableau en 3 phrases, en francais, sans inventer de chiffre. "
        "Ne donne que le texte du resume, sans preamble."
    )
    donnees = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": consigne},
                {"role": "user", "content": json.dumps(agregat, ensure_ascii=False)},
            ],
            "temperature": 0,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=donnees,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        return f"Erreur IA : {type(exc).__name__}"
