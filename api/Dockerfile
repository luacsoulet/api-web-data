FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.8 /uv /bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dépendances d'abord : la couche reste en cache tant que uv.lock ne change pas
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

COPY calculs.py main.py modele.py ./
COPY data/ data/
# Modèle entraîné au build, jamais à chaque requête
RUN /app/.venv/bin/python modele.py

RUN useradd --create-home app
USER app
EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
