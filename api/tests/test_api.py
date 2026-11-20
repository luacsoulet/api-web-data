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
