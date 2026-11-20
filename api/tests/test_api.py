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
