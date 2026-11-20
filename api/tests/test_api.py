from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_kpis_maison():
    r = client.get("/kpis", params={"type": "Maison"})
    assert r.status_code == 200
    assert r.json()["n_ventes"] > 0


def test_kpis_annee():
    r = client.get("/kpis", params={"type": "Maison", "annee": 2024})
    assert r.status_code == 200
    assert r.json()["n_ventes"] >= 0


def test_kpis_budget_max():
    r = client.get("/kpis", params={"type": "Maison", "budget_max": 250000})
    assert r.status_code == 200
    assert r.json()["n_ventes"] >= 0


def test_kpis_annee_et_budget():
    r = client.get(
        "/kpis", params={"type": "Maison", "annee": 2024, "budget_max": 300000}
    )
    assert r.status_code == 200
    assert r.json()["n_ventes"] >= 0


def test_communes_triees_et_min_ventes():
    lignes = client.get("/communes", params={"min_ventes": 30}).json()
    prix = [c["prix_m2_median"] for c in lignes]
    assert prix == sorted(prix, reverse=True)
    assert all(c["n"] >= 30 for c in lignes)


def test_communes_annee():
    lignes = client.get(
        "/communes", params={"annee": 2024, "min_ventes": 30}
    ).json()
    assert all(c["n"] >= 30 for c in lignes)


def test_evolution_triee():
    annees = [e["annee"] for e in client.get("/evolution").json()]
    assert annees == sorted(annees)


def test_type_invalide():
    assert client.get("/kpis", params={"type": "Chateau"}).status_code == 422


def test_points_geo():
    r = client.get("/points", params={"type": "Maison", "limit": 10})
    assert r.status_code == 200
    pts = r.json()
    assert len(pts) > 0
    assert all("latitude" in p and "longitude" in p for p in pts)
    assert all(isinstance(p["latitude"], float) and isinstance(p["longitude"], float) for p in pts)


def test_points_annee_filtre():
    r = client.get("/points", params={"type": "Maison", "annee": 2024, "limit": 5})
    assert r.status_code == 200


def test_resume_sans_cle():
    r = client.post("/resume", json={"kpis": {}, "communes": []})
    assert r.status_code == 200
    assert "resume" in r.json()
    assert "IA non configuree" in r.json()["resume"]
