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
    assert {x["annee"] for x in lignes} == set(range(2021, 2027))
    assert all(x["n"] >= 1 and "prix_m2_median" in x for x in lignes)


def test_tranches_bornees_par_le_filtre_surface():
    # filtre 50-120 m² : pas de courbe « moins de 50 » ni « 120 et plus » faite de bornes seules
    params = {"type": "Tous", "surface_min": 50, "surface_max": 120}
    lignes = client.get("/evolution/tranches", params=params).json()
    assert {x["tranche"] for x in lignes} == {"50 à 80 m²", "80 à 120 m²"}


def test_filtres_v3_reduisent_n_ventes():
    tout = client.get("/kpis", params={"type": "Tous"}).json()["n_ventes"]
    for p in [
        {"piscine": True},
        [("dpe", "F"), ("dpe", "G")],
        {"hors_inondable": True},
        {"argile_max": "moyen", "hors_nappe": True},
        {"medecins_min": 2, "gare_max_m": 2000, "materiau": "pierre"},
        {"construit_apres": 1950, "construit_avant": 2000, "ecoles_min": 1},
    ]:
        q = [("type", "Tous"), *(p.items() if isinstance(p, dict) else p)]
        n = client.get("/kpis", params=q).json()["n_ventes"]
        assert 0 < n < tout, p
    assert client.get("/kpis", params={"dpe": "H"}).status_code == 422


def test_ventes_proprietes_v3():
    f = client.get("/ventes", params={"limit": 1}).json()["features"][0]
    attendues = {"piscine", "dpe_classe", "alea_argile", "bat_annee_construction"}
    assert attendues <= f["properties"].keys()


def test_bien_fiche_et_404():
    b = client.get("/biens/2021-789576").json()
    assert len(b["parcelles"]) == 11 and b["piscines"]["features"]
    assert b["piscines"]["features"][0]["geometry"]["type"] == "Polygon"
    assert all(a["niveau"] in {"info", "vigilance", "alerte"} for a in b["attention"])
    assert "adresse" not in b
    assert client.get("/biens/inconnu").status_code == 404


def test_estimation_risques_et_marge():
    p = {"type": "Maison", "code_commune": "45234", "surface": 100, "pieces": 5}
    risques = {**p, "alea_argile": "fort", "zone_inondable": "frequent", "dpe": "G"}
    e = client.get("/estimation", params=risques).json()
    impacts = {f["facteur"]: f["impact_eur"] for f in e["facteurs"]}
    assert impacts["alea_argile"] <= 0 and impacts["zone_inondable_scenario"] <= 0
    assert min(impacts.values()) < 0
    assert e["marge_negociation"]["haute_eur"] > 0
    assert {a["facteur"] for a in e["a_verifier"]} >= {"alea_argile", "dpe_classe"}
    sain = {**p, "alea_argile": "faible", "zone_inondable": "aucune", "dpe": "D"}
    assert (
        client.get("/estimation", params=sain).json()["prix_estime"] > e["prix_estime"]
    )


def test_contexte_orleans():
    c = client.get("/contexte", params={"longitude": 1.909, "latitude": 47.902}).json()
    assert c["code_commune"] == "45234" and c["distance_m"] is not None
    assert client.get("/contexte", params={"longitude": 1.9}).status_code == 422
