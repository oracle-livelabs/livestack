FROM docker.io/python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "pyiceberg[pyarrow,s3fs]==0.11.1"

WORKDIR /workspace/seeder
COPY seed_product_master.py /workspace/seeder/seed_product_master.py

ENTRYPOINT ["python", "/workspace/seeder/seed_product_master.py"]
