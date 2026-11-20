"""Prépare les données de l'appli (contrat v3, section « Données (T0) »).

Lancer depuis api/ (geopandas n'est volontairement PAS une dépendance du projet) :
    uv run --with geopandas --with pyogrio --with shapely --with scipy --with pyproj python -I prepare_biens.py

Sorties : api/data/biens.parquet, api/data/piscines.parquet,
          web/public/couches/{argile,inondation,nappes,equipements}.geojson
Les données brutes sont lues, jamais exécutées.
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from pyproj import Transformer
from scipy.spatial import cKDTree

DATA = Path("/Users/luacsoulet/Desktop/Cours/api-web-data")
BRUT, GROUPE = DATA / "donnees-brutes", DATA / "donnees-groupees"
RACINE = Path(__file__).resolve().parent.parent
OUT_API, OUT_COUCHES = RACINE / "api/data", RACINE / "web/public/couches"
OUT_COUCHES.mkdir(parents=True, exist_ok=True)
TOL_M, MAX_MO = (
    15,
    6,
)  # tolérance de simplification (m, Lambert-93) et taille max par couche

# --- BPE : familles d'équipements (codes TYPEQU, cf. donnees-groupees/scripts/quartier.py) ---
FAMILLES = {
    "ecole": ["C107", "C108", "C109"],
    "college_lycee": ["C201", "C301", "C302", "C303"],
    "medecin": ["D265"],
    "pharmacie": ["D307"],
    "commerce_alimentaire": ["B104", "B201", "B202", "B204", "B206", "B207"],
    "gare": ["E107", "E108", "E109"],
}
bpe = pd.read_csv(
    BRUT / "bpe-2025/bpe25_45.csv",
    sep=";",
    dtype=str,
    usecols=["TYPEQU", "NOMRS", "LAMBERT_X", "LAMBERT_Y", "EPSG"],
)
assert (bpe.EPSG == "2154").all()
bpe = bpe.dropna(subset=["LAMBERT_X", "LAMBERT_Y"]).assign(
    x=lambda d: d.LAMBERT_X.astype(float), y=lambda d: d.LAMBERT_Y.astype(float)
)


def ecrire(gdf, nom):
    """Écrit un GeoJSON WGS84 arrondi à 5 décimales et vérifie < MAX_MO Mo."""
    p = OUT_COUCHES / nom
    gdf.to_crs(4326).to_file(p, driver="GeoJSON", COORDINATE_PRECISION=5)
    mo = p.stat().st_size / 1e6
    print(f"{nom}: {len(gdf)} entités, {mo:.2f} Mo")
    assert mo < MAX_MO, f"{nom} trop lourd ({mo:.1f} Mo), augmenter TOL_M"


# --- 1. biens.parquet ---
b = pd.read_parquet(GROUPE / "biens_45.parquet")
b = b.drop(
    columns=[
        "adresse",
        "adresse_code_voie",
        "methode_batiment",
        "dpe_source",
        "dpe_classe_conso_2012",
        "bdnb_alea_debordement",
        "hauteur_inondation_max_m",
        "parcelle_trouvee",
    ]
)
# contrat : alea_argile faible|moyen|fort ; zone_inondable_scenario null = hors zone (« aucun » = dans le TRI mais non inondé)
b["alea_argile"] = b.alea_argile.replace("faible_ou_nul", "faible")
b["zone_inondable_scenario"] = b.zone_inondable_scenario.replace("aucun", None)
for c in [
    "piscine",
    "avec_dependance",
    "avec_jardin",
    "avec_eau",
    "icpe_seveso_1km",
    "perimetre_mh_500m",
]:
    b[c] = b[c].fillna(False).astype(bool)
gares = bpe[bpe.TYPEQU.isin(FAMILLES["gare"])]
ok = (b.longitude.notna() & b.latitude.notna()).values
x, y = Transformer.from_crs(4326, 2154, always_xy=True).transform(
    b.longitude.values[ok], b.latitude.values[ok]
)
b["dist_gare_proche_m"] = np.nan
b.loc[ok, "dist_gare_proche_m"] = (
    cKDTree(gares[["x", "y"]].values).query(np.c_[x, y])[0].round(0)
)
b.to_parquet(OUT_API / "biens.parquet", index=False)

# --- 2. piscines.parquet : jointure spatiale avec les parcelles cadastrales ---
pis = gpd.read_file(BRUT / "piscines-45/piscines_45.geojson", engine="pyogrio").to_crs(
    2154
)
pis["geometry"] = pis.geometry.make_valid()
need = set(
    b.parcelles.fillna(b.id_parcelle).str.split(";").explode().str.strip()
)  # seules les parcelles des ventes
par = gpd.read_file(
    "/vsigzip/" + str(BRUT / "cadastre-etalab-45/cadastre-45-parcelles.json.gz"),
    engine="pyogrio",
    use_arrow=True,
)
par = par[par["id"].isin(need)].to_crs(2154)[["id", "geometry"]]
par["geometry"] = par.geometry.make_valid()
j = gpd.sjoin(
    pis[["surface_m2", "longitude", "latitude", "geometry"]],
    par,
    predicate="intersects",
)
j = j[~j.index.duplicated()]  # une piscine à cheval sur 2 parcelles : première trouvée
geo = gpd.GeoSeries(j.geometry.simplify(0.5).values, crs=2154).to_crs(4326)
p = pd.DataFrame(
    {
        "id_parcelle": j["id"].values,
        "surface_m2": j.surface_m2.values,
        "longitude": j.longitude.values,
        "latitude": j.latitude.values,
        "geometrie_wkt": shapely.to_wkt(geo.values, rounding_precision=6),
    }
)
p.to_parquet(OUT_API / "piscines.parquet", index=False)
print(f"piscines: {len(pis)} brutes, {len(p)} rattachées à une parcelle de vente")


# --- 3. couches carte ---
def lire(chemin):
    return gpd.read_file(chemin, engine="pyogrio").to_crs(2154)


def fusion(g, col):
    """Une géométrie par valeur de col, simplifiée en Lambert-93."""
    g = (
        g[[col, "geometry"]]
        .assign(geometry=g.geometry.make_valid())
        .dissolve(col)
        .reset_index()
    )
    g["geometry"] = g.geometry.simplify(TOL_M)
    return g[~g.geometry.is_empty]


a = lire(
    "/vsizip/" + str(BRUT / "rga-2025/AleaRG_2025_45_L93.zip/AleaRG_2025_45_L93.shp")
)
a["alea"] = a.niveau.map({2: "moyen", 3: "fort"})
ecrire(fusion(a.dropna(subset=["alea"]), "alea"), "argile.geojson")

n = lire(
    "/vsizip/" + str(BRUT / "remontees-nappes/Dept_45.zip/VECTEUR/Re_Nappe_fr.shp")
)
n["sensibilite"] = n.gridcode.map(
    {1: "inondation_cave", 2: "debordement_nappe"}
)  # 0 = aucune : exclu
ecrire(fusion(n.dropna(subset=["sensibilite"]), "sensibilite"), "nappes.geojson")

T = "/vsizip/" + str(
    BRUT
    / "tri-2020/tri_2020_sig_di_45.zip/tri_2020_sig_di_45/FRG_TRI_ORLEANS/n_tri_orleans_"
)
z = pd.concat(
    [
        lire(T + f"inondable_01_{c}_s_045.shp").assign(scenario=s)
        for c, s in [("01for", "frequent"), ("02moy", "moyen"), ("04fai", "extreme")]
    ]
)
ecrire(fusion(z, "scenario"), "inondation.geojson")

e = pd.concat(
    [bpe[bpe.TYPEQU.isin(c)].assign(famille=f) for f, c in FAMILLES.items()]
).drop_duplicates(["x", "y", "famille", "NOMRS"])
e = gpd.GeoDataFrame(
    {"famille": e.famille.values, "nom": e.NOMRS.str.title().values},
    geometry=gpd.points_from_xy(e.x, e.y),
    crs=2154,
)
ecrire(e, "equipements.geojson")
print(e.famille.value_counts().to_dict())
