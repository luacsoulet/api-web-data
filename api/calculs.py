import json
import os
import re
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).parent / "data" / "biens.parquet"
PISCINES = Path(__file__).parent / "data" / "piscines.parquet"
COMMUNES = Path(__file__).parent / "data" / "communes.geojson"
ADRESSES = Path(__file__).parent / "data" / "adresses.parquet"
EQUIPEMENTS = Path(__file__).parent / "data" / "equipements.geojson"
COMMUNES_INFOS = Path(__file__).parent / "data" / "communes_infos.parquet"
BIENS_COMPLEMENTS = Path(__file__).parent / "data" / "biens_complements.parquet"


@lru_cache
def charger() -> pd.DataFrame:
    return pd.read_parquet(DATA)


@lru_cache
def _infos() -> pd.DataFrame:
    """Compléments communaux, indexés par code ; vide si le fichier manque."""
    return pd.read_parquet(COMMUNES_INFOS).set_index("code_commune") if COMMUNES_INFOS.exists() else pd.DataFrame()


@lru_cache
def _complements() -> pd.DataFrame:
    return pd.read_parquet(BIENS_COMPLEMENTS).drop_duplicates("id_mutation").set_index("id_mutation") if BIENS_COMPLEMENTS.exists() else pd.DataFrame()


def _ligne(df: pd.DataFrame, cle: str) -> dict:
    """Ligne d'un DataFrame indexé -> dict JSON (NaN -> null), {} si absente."""
    if cle not in df.index:
        return {}
    return json.loads(df.loc[[cle]].to_json(orient="records", force_ascii=False))[0]


@lru_cache
def contours() -> dict:
    return json.loads(COMMUNES.read_text(encoding="utf-8"))


ALEAS = ["faible", "moyen", "fort"]
MINIMA = {
    "medecins_min": "nb_medecins_generalistes_1km",
    "ecoles_min": "nb_ecoles_1km",
    "commerces_min": "nb_commerces_alimentaires_1km",
}


def filtrer(f: dict) -> pd.DataFrame:
    """f = filtres du contrat v3 (voir main.filtres). construit_apres inclus, construit_avant exclu."""
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
    if f["piscine"]:
        m &= df["piscine"]
    if f["dpe"]:
        m &= df["dpe_classe"].isin(f["dpe"])
    if f["argile_max"]:
        rang = df["alea_argile"].map(ALEAS.index, na_action="ignore")
        m &= rang <= ALEAS.index(f["argile_max"])  # inconnu (NaN) exclu
    if f["hors_inondable"]:
        m &= df["zone_inondable_scenario"].isna()
    if f["hors_nappe"]:
        m &= df["sensibilite_nappe"] != "debordement_nappe"
    if f["materiau"]:
        m &= df["bat_materiau_murs"].str.contains(
            f["materiau"], case=False, regex=False, na=False
        )
    if f["construit_apres"] is not None:
        m &= df["bat_annee_construction"] >= f["construit_apres"]
    if f["construit_avant"] is not None:
        m &= df["bat_annee_construction"] < f["construit_avant"]
    for cle, col in MINIMA.items():
        if f[cle] is not None:
            m &= df[col] >= f[cle]
    if f["gare_max_m"] is not None:
        m &= df["dist_gare_proche_m"] <= f["gare_max_m"]
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
    "avec_dependance", "piscine", "dpe_classe", "alea_argile", "zone_inondable_scenario",
    "bat_annee_construction",
]  # fmt: skip


def _points(df: pd.DataFrame, props: list[str] = PROPS_VENTE) -> list[dict]:
    coords = df[["longitude", "latitude"]].to_numpy().tolist()
    return [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": c},
            "properties": p,
        }
        for c, p in zip(coords, _records(df[props]))
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
        "infos": _ligne(_infos(), code),
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
    "avec_dependance", "avec_jardin", "avec_eau", "longitude", "latitude", "piscine",
    "dpe_classe", "alea_argile", "zone_inondable_scenario", "bat_annee_construction",
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


def attention(r: dict) -> list[dict]:
    """Points à vérifier avant d'acheter, à partir des colonnes de biens.parquet (valeurs manquantes ignorées)."""
    out = []

    def ajout(facteur, niveau, texte):
        out.append({"facteur": facteur, "niveau": niveau, "texte": texte})

    def v(cle):
        x = r.get(cle)
        return None if x is None or (not isinstance(x, str) and pd.isna(x)) else x

    if v("alea_argile") == "fort":
        ajout("alea_argile", "alerte", "Aléa argile fort : risque de fissures (retrait-gonflement), faire vérifier fondations et murs.")  # fmt: skip
    elif v("alea_argile") == "moyen":
        ajout("alea_argile", "vigilance", "Aléa argile moyen : surveiller les fissures, étude de sol conseillée avant travaux.")  # fmt: skip
    zone = v("zone_inondable_scenario")
    if zone:
        h = v("hauteur_inondation_classe")
        nom = {"frequent": "crue fréquente", "moyen": "crue moyenne (centennale)", "extreme": "crue extrême"}[zone]  # fmt: skip
        ajout("zone_inondable_scenario", "vigilance" if zone == "extreme" else "alerte",
              f"Zone inondable de la Loire ({nom}{f', hauteur {h}' if h else ''}) : lire l'état des risques, vérifier l'assurance.")  # fmt: skip
    if v("sensibilite_nappe") == "debordement_nappe":
        ajout("sensibilite_nappe", "vigilance", "Débordement de nappe possible : vérifier l'humidité et le sous-sol.")  # fmt: skip
    elif v("sensibilite_nappe") == "inondation_cave":
        ajout("sensibilite_nappe", "info", "Remontée de nappe possible dans les caves et sous-sols.")  # fmt: skip
    dpe = v("dpe_classe")
    if dpe in ("F", "G"):
        ajout("dpe_classe", "alerte", f"DPE {dpe} (passoire thermique) : location interdite dès {'2025' if dpe == 'G' else '2028'}, rénovation à chiffrer.")  # fmt: skip
    elif dpe == "E":
        ajout("dpe_classe", "vigilance", "DPE E : location interdite à partir de 2034, isolation à prévoir.")  # fmt: skip
    elif dpe is None:
        ajout("dpe_classe", "info", "Aucun DPE retrouvé pour ce bâtiment : le demander au vendeur.")  # fmt: skip
    bruit = v("bruit_lden_max_db")
    if bruit is not None and bruit >= 65:
        ajout("bruit_lden_max_db", "alerte", f"Bruit routier ou ferroviaire élevé ({bruit:.0f} dB Lden).")  # fmt: skip
    elif bruit is not None and bruit >= 55:
        ajout("bruit_lden_max_db", "info", f"Exposition au bruit modérée ({bruit:.0f} dB Lden).")  # fmt: skip
    if v("icpe_seveso_1km"):
        ajout("icpe_seveso_1km", "alerte", "Site industriel Seveso à moins de 1 km.")  # fmt: skip
    casias = v("distance_site_casias_m")
    if casias is not None and casias < 200:
        ajout("distance_site_casias_m", "vigilance", f"Ancien site industriel (CASIAS) à {casias:.0f} m : pollution des sols possible.")  # fmt: skip
    if v("perimetre_mh_500m"):
        ajout("perimetre_mh_500m", "info", "Périmètre d'un monument historique : travaux extérieurs soumis à l'avis de l'architecte des Bâtiments de France.")  # fmt: skip
    an = v("bat_annee_construction")
    # seuils légaux : CREP plomb (permis avant 1949), repérage amiante (permis avant juillet 1997)
    if an is not None and an < 1949:
        ajout("bat_annee_construction", "vigilance", f"Construit en {an:.0f} (avant 1949) : diagnostics plomb et amiante obligatoires.")  # fmt: skip
    elif an is not None and an < 1997:
        ajout("bat_annee_construction", "info", f"Construit en {an:.0f} (avant 1997) : diagnostic amiante obligatoire.")  # fmt: skip
    if v("piscine"):
        ajout("piscine", "info", "Piscine : dispositif de sécurité obligatoire, entretien et taxe foncière plus élevée.")  # fmt: skip
    return out


def _piscines(parcelles: list[str]) -> dict:
    df = pd.read_parquet(PISCINES, filters=[("id_parcelle", "in", parcelles)])
    features = [
        {
            "type": "Feature",
            # WKT POLYGON ((x y, ...), (trou)) -> anneaux GeoJSON (le prétraitement ne produit que des POLYGON)
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[float(n) for n in pt.split()] for pt in anneau.split(",")]
                    for anneau in re.findall(r"\(([^()]+)\)", r.geometrie_wkt)
                ],
            },
            "properties": {"id_parcelle": r.id_parcelle, "surface_m2": r.surface_m2},
        }
        for r in df.itertuples()
    ]
    return {"type": "FeatureCollection", "features": features}


def bien(id_mutation: str) -> dict | None:
    df = charger()
    ligne = df[df["id_mutation"] == id_mutation]
    if ligne.empty:
        return None
    r = _records(ligne)[0]
    parcelles = r["parcelles"].split(";") if r["parcelles"] else []
    voisines = df[(df["code_commune"] == r["code_commune"]) & (df["type"] == r["type"])]
    med = _nombre(voisines["prix_m2"].median())
    prix_m2 = r["prix_m2"]
    return {
        **r,
        **{k: v for k, v in _ligne(_complements(), id_mutation).items() if k not in r or r[k] is None},
        "prix_m2_median_commune": med,
        "ecart_pct": None if med is None or prix_m2 is None or med == 0 else round((prix_m2 / med - 1) * 100, 1),
        "parcelles": parcelles,
        "piscines": _piscines(parcelles),
        "attention": attention(r),
    }


def _distance(lon: pd.Series, lat: pd.Series, longitude: float, latitude: float) -> pd.Series:  # fmt: skip
    """Distance en mètres ; approximation plane (équirectangulaire), suffisante à l'échelle du Loiret."""
    dx = (lon - longitude) * 111_320 * np.cos(np.radians(latitude))
    return np.hypot(dx, (lat - latitude) * 110_540)


COLS_CONTEXTE = [
    "code_commune", "nom_commune", "alea_argile", "zone_inondable_scenario",
    "hauteur_inondation_classe", "sensibilite_nappe", "bruit_lden_max_db", "bruit_source",
    "distance_mh_m", "perimetre_mh_500m", "icpe_seveso_1km", "distance_site_casias_m",
    "nb_ecoles_1km", "dist_ecole_proche_m", "nb_colleges_lycees_1km",
    "nb_medecins_generalistes_1km", "nb_pharmacies_1km", "nb_commerces_alimentaires_1km",
    "dist_commerce_alimentaire_proche_m", "nb_gares_1km", "dist_gare_proche_m",
    "niveau_vie_moyen_carreau",
]  # fmt: skip
VOISINAGE_M = 150


def contexte(longitude: float, latitude: float) -> dict:
    """Valeurs de la vente la plus proche à < 150 m (sinon null) ; commune de la vente la plus proche à < 5 km."""
    df = charger().dropna(subset=["longitude", "latitude"])
    d = _distance(df["longitude"], df["latitude"], longitude, latitude)
    i = d.idxmin()
    vide = dict.fromkeys(COLS_CONTEXTE)
    # shortcut: commune = celle de la vente la plus proche, pas un test point-dans-polygone ; peut se tromper en limite de commune
    if d[i] > 5000:
        return vide | {"distance_m": None}
    vals = json.loads(df.loc[[i], COLS_CONTEXTE].to_json(orient="records"))[0]
    if d[i] > VOISINAGE_M:
        vals = vide | {c: vals[c] for c in ("code_commune", "nom_commune")}
    return vals | {"distance_m": round(float(d[i]))}


def valeurs_commune(code: str) -> dict:
    """Valeurs typiques de la commune : médiane (numérique) ou valeur la plus fréquente, null compris."""
    df = charger()
    df = df.loc[df["code_commune"] == code, COLS_CONTEXTE[2:]]
    out = {}
    for c in df.columns:
        # bruit absent = hors carte de bruit (< 55 dB), pas inconnu
        s = df[c].fillna(50) if c == "bruit_lden_max_db" else df[c]
        if pd.api.types.is_bool_dtype(s):
            out[c] = bool(s.mean() >= 0.5) if len(s) else False
        elif pd.api.types.is_numeric_dtype(s):
            out[c] = _nombre(s.median())
        else:
            mode = s.value_counts(dropna=False).index[0]
            out[c] = None if not isinstance(mode, str) and pd.isna(mode) else mode
    return out


def normaliser(s: pd.Series) -> pd.Series:
    """Minuscules, sans accents, ponctuation -> espace : même règle pour l'index d'adresses et la requête."""
    s = s.str.normalize("NFKD").str.encode("ascii", "ignore").str.decode("ascii")
    return s.str.lower().str.replace(r"[^a-z0-9]+", " ", regex=True).str.strip()


@lru_cache
def index_adresses() -> pd.DataFrame:
    return pd.read_parquet(ADRESSES)


def adresses(q: str, limit: int = 8) -> list[dict]:
    mots = normaliser(pd.Series([q]))[0].split()
    if not mots:
        return []
    df = index_adresses()
    s = df["recherche"]
    # mots complets, sauf le dernier encore en cours de frappe (début de mot)
    m = s.str.contains(f" {mots[-1]}", regex=False)
    for mot in mots[:-1]:
        m &= s.str.contains(f" {mot} ", regex=False)
    return [
        {
            "libelle": r.libelle,
            "code_insee": r.code_insee,
            "longitude": round(float(r.lon), 6),
            "latitude": round(float(r.lat), 6),
        }
        for r in df[m].head(limit).itertuples()
    ]


FAMILLES = ["ecole", "college_lycee", "medecin", "pharmacie", "commerce_alimentaire", "gare"]  # fmt: skip


@lru_cache
def equipements() -> pd.DataFrame:
    fc = json.loads(EQUIPEMENTS.read_text(encoding="utf-8"))
    return pd.DataFrame(
        {
            "famille": f["properties"]["famille"],
            "nom": f["properties"].get("nom"),
            "lon": f["geometry"]["coordinates"][0],
            "lat": f["geometry"]["coordinates"][1],
        }
        for f in fc["features"]
    )


def _equipements(longitude: float, latitude: float, rayon_m: int) -> list[dict]:
    """Par famille : nombre dans le rayon, et le plus proche (même hors du rayon)."""
    eq = equipements()
    eq = eq.assign(d=_distance(eq["lon"], eq["lat"], longitude, latitude))
    out = []
    for fam in FAMILLES:
        g = eq[eq["famille"] == fam]
        p = g.loc[g["d"].idxmin()] if len(g) else None
        proche = None if p is None else {"nom": p["nom"], "distance_m": round(float(p["d"]))}  # fmt: skip
        out.append({"famille": fam, "n": int((g["d"] <= rayon_m).sum()), "plus_proche": proche})  # fmt: skip
    return out


MAX_AUTOUR = 2000


def autour(f: dict, longitude: float, latitude: float, rayon_m: int) -> dict:
    df = filtrer(f).dropna(subset=["longitude", "latitude"])
    d = _distance(df["longitude"], df["latitude"], longitude, latitude)
    df = df.assign(distance_m=d.round()).loc[d <= rayon_m]
    recentes = df.sort_values("date_mutation", ascending=False).head(MAX_AUTOUR)
    return {
        "ventes": {
            "type": "FeatureCollection",
            "total": len(df),
            "features": _points(recentes, PROPS_VENTE + ["distance_m"]),
        },
        "stats": {
            **_medianes(df),
            "par_type": {t: _medianes(g) for t, g in df.groupby("type")},
        },
        "point": contexte(longitude, latitude),
        "equipements": _equipements(longitude, latitude, rayon_m),
    }
