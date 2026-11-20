"""Formes réelles (cadastre Etalab) d'une vente : parcelles, bâtiments, piscines en mètres locaux."""
import gzip
import json
import math
import os
import re
import threading
from functools import lru_cache
from pathlib import Path

import httpx

CACHE = Path(__file__).parent / "data" / "cadastre"
URL = "https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/{dep}/{insee}/cadastre-{insee}-{couche}.json.gz"


def _anneaux(geom: dict | None) -> list[list[list[float]]]:
    """Anneaux extérieurs d'un Polygon / MultiPolygon GeoJSON."""
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return geom["coordinates"][:1]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def _features(insee: str, couche: str) -> list[dict] | None:
    fichier = CACHE / f"{insee}-{couche}.json.gz"
    try:
        for _ in range(2):
            if not fichier.exists():
                r = httpx.get(URL.format(dep=insee[:2], insee=insee, couche=couche), timeout=20, follow_redirects=True)
                r.raise_for_status()
                CACHE.mkdir(parents=True, exist_ok=True)
                tmp = fichier.with_name(f"{fichier.name}.{os.getpid()}.{threading.get_ident()}.tmp")
                tmp.write_bytes(r.content)
                os.replace(tmp, fichier)
            try:
                return json.loads(gzip.decompress(fichier.read_bytes()))["features"]
            except Exception:
                fichier.unlink(missing_ok=True)  # fichier corrompu : un seul nouveau téléchargement
        return None
    except Exception:
        return None


@lru_cache(maxsize=8)
def _commune(insee: str) -> tuple[dict, list[dict]] | None:
    """({id parcelle: anneaux}, bâtiments [{type, anneau}])  ; lève RuntimeError si téléchargement impossible (non mis en cache)."""
    parcelles, batiments = _features(insee, "parcelles"), _features(insee, "batiments")
    if parcelles is None or batiments is None:
        raise RuntimeError("cadastre indisponible")  # une exception n'est pas mise en cache par lru_cache
    return (
        {f["properties"]["id"]: _anneaux(f["geometry"]) for f in parcelles},
        [{"type": f["properties"].get("type"), "anneau": a} for f in batiments for a in _anneaux(f["geometry"])],
    )


def point_dans_polygone(x: float, y: float, anneau: list[list[float]]) -> bool:
    """Lancer de rayon (anneau ouvert ou fermé)."""
    dedans = False
    for (x1, y1), (x2, y2) in zip(anneau, anneau[1:] + anneau[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            dedans = not dedans
    return dedans


def centroide(anneau: list[list[float]]) -> tuple[float, float]:
    """Moyenne des sommets (suffit pour tester l'appartenance d'un petit bâtiment)."""
    return sum(p[0] for p in anneau) / len(anneau), sum(p[1] for p in anneau) / len(anneau)


def projeter(anneau: list[list[float]], lon0: float, lat0: float) -> list[list[float]]:
    k = math.cos(math.radians(lat0)) * 111_320
    return [[round((p[0] - lon0) * k, 2), round((p[1] - lat0) * 110_540, 2)] for p in anneau]


def geometrie(code_commune: str, parcelles: list[str], piscines: dict | None = None) -> dict | None:
    if not re.fullmatch(r"\d{5}|2[AB]\d{3}", str(code_commune)):
        return None
    try:
        donnees = _commune(code_commune)
    except Exception:
        return None
    par_id, tous = donnees
    anneaux = [a for p in parcelles for a in par_id.get(p, [])]
    if not anneaux:
        return None
    pts = [p for a in anneaux for p in a]
    lon0, lat0 = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    bats = [
        {"type": "leger" if str(b["type"]) == "02" else "dur", "anneau": projeter(b["anneau"], lon0, lat0)}
        for b in tous
        if any(point_dans_polygone(*centroide(b["anneau"]), a) for a in anneaux)
    ]
    pisc = [projeter(a, lon0, lat0) for f in (piscines or {}).get("features", []) for a in _anneaux(f["geometry"])]
    return {"parcelles": [projeter(a, lon0, lat0) for a in anneaux], "batiments": bats, "piscines": pisc}
