from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_kpis_maison():
    r = client.get("/kpis", params={"type": "Maison"})
    assert r.status_code == 200
    assert r.json()["n_ventes"] > 0


def test_communes_triees_et_min_ventes():
    lignes = client.get("/communes", params={"min_ventes": 30}).json()
    prix = [c["prix_m2_median"] for c in lignes]
    assert prix == sorted(prix, reverse=True)
    assert all(c["n"] >= 30 for c in lignes)


def test_evolution_triee():
    annees = [e["annee"] for e in client.get("/evolution").json()]
    assert annees == sorted(annees)


def test_type_invalide():
    assert client.get("/kpis", params={"type": "Chateau"}).status_code == 422


def test_budget_max_reduit_n_ventes():
    tout = client.get("/kpis").json()["n_ventes"]
    assert client.get("/kpis", params={"budget_max": 150_000}).json()["n_ventes"] < tout


def test_annees_inversees_422():
    r = client.get("/kpis", params={"annee_min": 2025, "annee_max": 2022})
    assert r.status_code == 422


def test_carte_325_communes():
    carte = client.get("/carte", params={"budget_max": 100_000}).json()
    assert len(carte["features"]) == 325
    vides = [f["properties"] for f in carte["features"] if f["properties"]["n"] == 0]
    assert all(p["prix_m2_median"] is None for p in vides)


def test_ventes_points_et_total():
    r = client.get("/ventes", params={"limit": 50}).json()
    assert 0 < len(r["features"]) <= 50 and r["total"] >= len(r["features"])
    f = r["features"][0]
    assert f["geometry"]["type"] == "Point" and "prix_m2" in f["properties"]
    dates = [f["properties"]["date_mutation"] for f in r["features"]]
    assert dates == sorted(dates, reverse=True)


def test_commune_et_404():
    c = client.get("/communes/45234").json()
    assert c["code_commune"] == "45234" and c["n"] > 0
    assert client.get("/communes/99999").status_code == 404


def test_sections_et_ventes_commune():
    s = client.get("/communes/45234/sections").json()
    assert s and {"section", "n", "prix_m2_median", "valeur_median"} <= s[0].keys()
    v = client.get("/communes/45234/ventes", params={"limit": 5}).json()
    assert len(v) == 5 and len(v[0]["date_mutation"]) == 10
    assert {"avec_eau", "longitude", "surface_terrain"} <= v[0].keys()


def test_estimation():
    p = {"type": "Maison", "code_commune": "45234", "surface": 100, "pieces": 5}
    e = client.get("/estimation", params=p).json()
    assert e["mae"] > 0
    assert e["fourchette_basse"] < e["prix_estime"] < e["fourchette_haute"]
    assert e["verdict"] is None
    e = client.get("/estimation", params={**p, "prix_demande": 5_000_000}).json()
    assert e["verdict"] == "au-dessus"
    p["code_commune"] = "99999"
    assert client.get("/estimation", params=p).status_code == 404


def test_estimation_comparables_ventes():
    p = {"type": "Maison", "code_commune": "45232", "surface": 100, "pieces": 4}
    e = client.get("/estimation", params=p).json()
    c = e["comparables_ventes"]
    assert c["type"] == "FeatureCollection"
    assert len(c["features"]) <= min(300, e["comparables"]["n"])
    assert all(f["geometry"]["type"] == "Point" for f in c["features"])


def test_surface_max_reduit_n_ventes():
    tout = client.get("/kpis").json()["n_ventes"]
    assert client.get("/kpis", params={"surface_max": 80}).json()["n_ventes"] < tout


def test_surfaces_inversees_422():
    r = client.get("/kpis", params={"surface_min": 100, "surface_max": 50})
    assert r.status_code == 422


def test_evolution_tranches():
    r = client.get("/evolution/tranches", params={"type": "Tous"})
    assert r.status_code == 200
    lignes = r.json()
    ordre = ["moins de 50 m²", "50 à 80 m²", "80 à 120 m²", "120 m² et plus"]
    assert list(dict.fromkeys(x["tranche"] for x in lignes)) == ordre
    assert {x["annee"] for x in lignes} == set(range(2021, 2026))
    assert all(x["n"] >= 1 and "prix_m2_median" in x for x in lignes)


def test_tranches_bornees_par_le_filtre_surface():
    # filtre 50-120 m² : pas de courbe « moins de 50 » ni « 120 et plus » faite de bornes seules
    params = {"type": "Tous", "surface_min": 50, "surface_max": 120}
    lignes = client.get("/evolution/tranches", params=params).json()
    assert {x["tranche"] for x in lignes} == {"50 à 80 m²", "80 à 120 m²"}


def test_points_geo():
    r = client.get("/points", params={"type": "Maison", "limit": 10})
    assert r.status_code == 200
    pts = r.json()
    assert len(pts) > 0
    assert all(isinstance(p["latitude"], float) and isinstance(p["longitude"], float) for p in pts)


def test_points_annee_filtre():
    assert client.get("/points", params={"type": "Maison", "annee": 2024, "limit": 5}).status_code == 200


def test_resume_sans_cle():
    r = client.post("/resume", json={"kpis": {}, "communes": []})
    assert r.status_code == 200
    assert "IA non configuree" in r.json()["resume"]


def test_kpis_annee():
    r = client.get("/kpis", params={"type": "Maison", "annee": 2024})
    assert r.status_code == 200
    assert r.json()["n_ventes"] > 0


def test_kpis_budget_max():
    r = client.get("/kpis", params={"type": "Maison", "budget_max": 250000})
    assert r.status_code == 200
    assert r.json()["n_ventes"] > 0


def test_kpis_annee_et_budget():
    r = client.get("/kpis", params={"type": "Maison", "annee": 2024, "budget_max": 300000})
    assert r.status_code == 200
    assert r.json()["n_ventes"] > 0


def test_communes_annee():
    lignes = client.get("/communes", params={"annee": 2024, "min_ventes": 30}).json()
    assert all(c["n"] >= 30 for c in lignes)


def test_annee_equivaut_annee_min_max():
    a = client.get("/kpis", params={"annee": 2024}).json()["n_ventes"]
    b = client.get("/kpis", params={"annee_min": 2024, "annee_max": 2024}).json()["n_ventes"]
    assert a == b


def test_bien_connu_et_inconnu():
    pt = client.get("/points", params={"limit": 1}).json()[0]
    r = client.get(f"/bien/{pt['id_mutation']}")
    assert r.status_code == 200
    b = r.json()
    assert b["id_mutation"] == pt["id_mutation"]
    assert b["nom_commune"] == pt["nom_commune"]
    assert "prix_m2_median_commune" in b and "ecart_pct" in b
    assert client.get("/bien/inconnu").status_code == 404
