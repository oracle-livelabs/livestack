import contextvars
import json
import os
import re
import time
from datetime import date, datetime

import oracledb
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request

load_dotenv()

app = Flask(__name__)

TRUTHY_FLAGS = {"1", "true", "yes", "on"}
XRAY_RESPONSE_HEADER = "x-demo-xray"
XRAY_RESPONSE_HEADER_MAX_CHARS = 7000
xray_events_ctx = contextvars.ContextVar("xray_events_ctx", default=None)

CREATE_LLM_CACHE_SQL = """
CREATE TABLE IF NOT EXISTS llm_cache (
    cache_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_desc CLOB,
    llm_response CLOB,
    embedding VECTOR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

EMBEDDING_SQL = """
SELECT DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(
    :product_desc,
    JSON('{"provider":"database", "model":"demo_model"}')
) AS embedding
FROM dual
"""

SEMANTIC_CACHE_SEARCH_SQL = """
SELECT cache_id,
       TO_CHAR(product_desc) AS product_desc_str,
       TO_CHAR(llm_response) AS llm_response_str,
       vector_distance(embedding, :input_embedding, COSINE) AS similarity
FROM llm_cache
WHERE vector_distance(embedding, :input_embedding, COSINE) < :threshold
ORDER BY vector_distance(embedding, :input_embedding, COSINE)
FETCH FIRST 1 ROWS ONLY
"""

LLM_CACHE_INSERT_SQL = """
INSERT INTO llm_cache (product_desc, llm_response, embedding)
VALUES (:product_desc, :llm_response, :embedding)
"""

PRODUCT_SEARCH_SQL = """
SELECT p.PROD_ID, p.PROD_DESC, p.PROD_CATEGORY_DESC, p.PROD_LIST_PRICE
FROM products_vector pv
JOIN products p ON pv.PROD_ID = p.PROD_ID
WHERE vector_distance(
    pv.EMBEDDING,
    DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(:search_value, JSON('{"provider":"database", "model":"demo_model"}')),
    COSINE
) < 0.7
ORDER BY vector_distance(
    pv.EMBEDDING,
    DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(:search_value, JSON('{"provider":"database", "model":"demo_model"}')),
    COSINE
)
FETCH FIRST 8 ROWS ONLY
"""

XRAY_PROFILE = {
    "title": "Storefront: Oracle AI Database X-Ray",
    "caption": "Observe vector search, semantic cache lookups, and Oracle AI Database-backed response generation without leaving the storefront.",
    "features": [
        "Oracle AI Database generates shopper and cache embeddings with the in-database `demo_model` model.",
        "Oracle AI Vector Search ranks product matches and semantic-cache candidates directly in SQL.",
        "The x-ray terminal captures SQL, bind values, cache decisions, and request timing for live demo flows.",
    ],
    "baseline": {
        "label": "Storefront baseline",
        "dbCommand": "POST / for vector search or POST /get_product_info for semantic-cache lookup.",
        "dbActivity": "Run a product search or open a product insight modal to trace live Oracle AI Database activity.",
    },
    "searchDbCommand": (
        "SELECT p.PROD_ID, p.PROD_DESC, p.PROD_CATEGORY_DESC, p.PROD_LIST_PRICE "
        "FROM products_vector JOIN products ORDER BY vector_distance(...) FETCH FIRST 8 ROWS ONLY"
    ),
    "productInfoDbCommand": (
        "SELECT DBMS_VECTOR_CHAIN.UTL_TO_EMBEDDING(...); "
        "SELECT ... FROM llm_cache ORDER BY vector_distance(...); "
        "INSERT INTO llm_cache (...) VALUES (...)"
    ),
}


def get_connection():
    pw = os.getenv("DBPASSWORD")
    connection = oracledb.connect(user="sh", password=pw, dsn="aidb/freepdb1")
    return connection


def truthy_flag(value):
    return isinstance(value, str) and value.strip().lower() in TRUTHY_FLAGS


def xray_requested(payload=None):
    if truthy_flag(request.headers.get(XRAY_RESPONSE_HEADER)) or truthy_flag(request.values.get("xray")):
        return True
    if isinstance(payload, dict):
        marker = payload.get("_xray")
        if isinstance(marker, bool):
            return marker
        if truthy_flag(marker):
            return True
    return False


def sanitize_xray_value(value, *, max_len=700, depth=0):
    if depth > 3:
        return "<depth-limit>"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, str):
        return value if len(value) <= max_len else value[:max_len] + "...<truncated>"
    if isinstance(value, dict):
        out = {}
        for idx, (key, item) in enumerate(value.items()):
            if idx >= 15:
                out["..."] = f"+{len(value) - 15} keys"
                break
            out[str(key)] = sanitize_xray_value(item, max_len=max_len, depth=depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        items = [sanitize_xray_value(item, max_len=max_len, depth=depth + 1) for item in list(value)[:8]]
        if len(value) > 8:
            items.append(f"... +{len(value) - 8} items")
        return items
    return sanitize_xray_value(str(value), max_len=max_len, depth=depth + 1)


def compact_sql(sql):
    return re.sub(r"\s+", " ", (sql or "").strip())


def xray_binds_preview(binds):
    if not isinstance(binds, dict):
        return binds or {}
    preview = {}
    for key, value in binds.items():
        if key in {"embedding", "input_embedding"}:
            preview[key] = "<generated-vector>"
        else:
            preview[key] = value
    return preview


def push_xray_event(event_type, **fields):
    events = xray_events_ctx.get()
    if events is None:
        return
    payload = {
        "type": event_type,
        "at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }
    payload.update({key: sanitize_xray_value(value) for key, value in fields.items()})
    events.append(payload)


def xray_capture_start(enabled):
    token = xray_events_ctx.set([] if enabled else None)
    started_at = time.perf_counter()
    return token, started_at


def xray_try_reset(token):
    try:
        xray_events_ctx.reset(token)
    except Exception:
        xray_events_ctx.set(None)


def xray_capture_payload(token, started_at):
    events = xray_events_ctx.get()
    xray_try_reset(token)
    if events is None:
        return None
    return {
        "elapsed_ms": round((time.perf_counter() - started_at) * 1000),
        "events": events,
    }


def xray_header_value(xray_payload):
    try:
        raw = json.dumps(xray_payload, separators=(",", ":"))
    except Exception:
        return ""
    if len(raw) <= XRAY_RESPONSE_HEADER_MAX_CHARS:
        return raw
    events = xray_payload.get("events") if isinstance(xray_payload, dict) else []
    event_list = events if isinstance(events, list) else []
    summary = {
        "elapsed_ms": xray_payload.get("elapsed_ms") if isinstance(xray_payload, dict) else None,
        "event_count": len(event_list),
        "events": event_list[:4],
        "truncated": True,
    }
    try:
        return json.dumps(summary, separators=(",", ":"))
    except Exception:
        return ""


def jsonify_with_xray(payload, token, started_at, status_code=200):
    body = dict(payload)
    xray_payload = xray_capture_payload(token, started_at)
    if xray_payload is not None:
        body["_xray"] = xray_payload
    response = jsonify(body)
    response.status_code = status_code
    if xray_payload is not None:
        header_value = xray_header_value(xray_payload)
        if header_value:
            response.headers[XRAY_RESPONSE_HEADER] = header_value
    return response


def execute_sql(cursor, sql, binds=None):
    if binds:
        cursor.execute(sql, binds)
    else:
        cursor.execute(sql)


def db_fetchone(cursor, sql, binds=None, preview=None):
    push_xray_event("db_query", sql=compact_sql(sql), binds=xray_binds_preview(binds))
    execute_sql(cursor, sql, binds)
    row = cursor.fetchone()
    result_preview = preview
    if result_preview is None:
        result_preview = [] if row is None else [row]
    push_xray_event("db_result", row_count=0 if row is None else 1, preview=result_preview)
    return row


def db_fetchall(cursor, sql, binds=None, preview=None):
    push_xray_event("db_query", sql=compact_sql(sql), binds=xray_binds_preview(binds))
    execute_sql(cursor, sql, binds)
    rows = cursor.fetchall()
    result_preview = preview if preview is not None else rows[:2]
    push_xray_event("db_result", row_count=len(rows), preview=result_preview)
    return rows


def db_execute(cursor, sql, binds=None):
    push_xray_event("db_exec", sql=compact_sql(sql), binds=xray_binds_preview(binds))
    execute_sql(cursor, sql, binds)
    push_xray_event("db_exec_result", row_count=cursor.rowcount)


def create_llm_cache_table():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        db_execute(cursor, CREATE_LLM_CACHE_SQL)
        conn.commit()
    except Exception as exc:
        print(f"Error: {exc}")
    finally:
        cursor.close()
        conn.close()


def check_semantic_cache(product_desc, similarity_threshold):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        input_embedding_row = db_fetchone(
            cursor,
            EMBEDDING_SQL,
            {"product_desc": product_desc},
            preview=[{"embedding": "<generated-vector>"}],
        )
        input_embedding = input_embedding_row[0] if input_embedding_row else None

        if input_embedding is None:
            push_xray_event("cache_lookup_error", reason="embedding_not_generated")
            return None

        result = db_fetchone(
            cursor,
            SEMANTIC_CACHE_SEARCH_SQL,
            {
                "input_embedding": input_embedding,
                "threshold": 1 - similarity_threshold,
            },
        )
    finally:
        cursor.close()
        conn.close()

    if result:
        payload = {
            "cache_id": result[0],
            "original_product_desc": result[1],
            "llm_response": result[2],
            "similarity_score": 1 - result[3],
            "cached": True,
        }
        push_xray_event(
            "cache_hit",
            cache_id=payload["cache_id"],
            similarity_score=round(payload["similarity_score"], 4),
        )
        return payload

    push_xray_event("cache_miss", similarity_threshold=similarity_threshold)
    return None


def store_llm_response(product_desc, llm_response):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        embedding_row = db_fetchone(
            cursor,
            EMBEDDING_SQL,
            {"product_desc": product_desc},
            preview=[{"embedding": "<generated-vector>"}],
        )
        embedding = embedding_row[0] if embedding_row else None

        db_execute(
            cursor,
            LLM_CACHE_INSERT_SQL,
            {
                "product_desc": product_desc,
                "llm_response": llm_response,
                "embedding": embedding,
            },
        )

        conn.commit()
        push_xray_event("cache_store", product_desc=product_desc)
    finally:
        cursor.close()
        conn.close()


def create_llm(product_desc):
    try:
        payload = {
            "model": "llama3.2",
            "prompt": (
                "Which are two cartoon figures or Star Wars characters that could be related to this product. "
                "If possible name 2 but only the names. Comma-separated. Again, please return only the names "
                f"and no further explanations: {product_desc}"
            ),
            "stream": False,
        }

        push_xray_event("llm_request", model=payload["model"], product_desc=product_desc)

        response = requests.post(
            "http://ollama:11434/api/generate",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )

        if response.status_code == 200:
            result = response.json()
            generated = result.get("response", "No response generated")
            push_xray_event("llm_response", status_code=200, response=generated)
            return generated

        push_xray_event("llm_response", status_code=response.status_code, error="Ollama API error")
        return f"Ollama API error: {response.status_code}"

    except requests.exceptions.RequestException as exc:
        push_xray_event("llm_response", status_code="request-error", error=str(exc))
        return f"Connection error: {str(exc)}"


def get_llm_response(product_desc, similarity_threshold):
    cached_result = check_semantic_cache(product_desc, similarity_threshold)

    if cached_result:
        return {
            "response": cached_result["llm_response"],
            "cached": True,
            "cache_source": "semantic",
            "similarity_score": cached_result["similarity_score"],
            "original_query": cached_result["original_product_desc"],
        }

    llm_response = create_llm(product_desc)

    if not llm_response.startswith("Ollama API error") and not llm_response.startswith("Connection error"):
        store_llm_response(product_desc, llm_response)

    return {
        "response": llm_response,
        "cached": False,
        "cache_source": "fresh",
    }


@app.route("/", methods=["GET", "POST"])
def index():
    search_query = request.form.get("search", "")
    products = []
    enabled = xray_requested()
    token, started_at = xray_capture_start(enabled)
    initial_xray_event = None

    try:
        if search_query:
            conn = get_connection()
            cursor = conn.cursor()
            try:
                products = db_fetchall(cursor, PRODUCT_SEARCH_SQL, {"search_value": search_query})
            finally:
                cursor.close()
                conn.close()

            push_xray_event("search_results", query=search_query, product_count=len(products))
            initial_xray_event = {
                "label": "Vector product search",
                "dbCommand": XRAY_PROFILE["searchDbCommand"],
                "dbActivity": (
                    f"Ranked up to 8 catalog products that are semantically closest to the shopper query "
                    f"'{search_query}'."
                ),
            }

        initial_xray = xray_capture_payload(token, started_at)
        return render_template(
            "index.html",
            products=products,
            search_query=search_query,
            xray_profile=XRAY_PROFILE,
            xray_enabled=enabled,
            initial_xray=initial_xray,
            initial_xray_event=initial_xray_event,
        )
    except Exception:
        xray_try_reset(token)
        raise


@app.route("/get_product_info", methods=["POST"])
def get_product_info():
    data = request.get_json(silent=True) or {}
    enabled = xray_requested(data)
    token, started_at = xray_capture_start(enabled)

    try:
        product_desc = data.get("product_desc", "")
        similarity_threshold = 0.66

        if not product_desc:
            return jsonify_with_xray({"error": "Product description is required"}, token, started_at, 400)

        push_xray_event("product_lookup", product_desc=product_desc, similarity_threshold=similarity_threshold)
        result = get_llm_response(product_desc, similarity_threshold)
        return jsonify_with_xray(result, token, started_at)
    except Exception as exc:
        print(f"Unexpected error in get_product_info: {exc}")
        return jsonify_with_xray({"error": str(exc)}, token, started_at, 500)


@app.route("/clear_cache", methods=["GET", "POST"])
def clear_cache():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM llm_cache")
        conn.commit()
    finally:
        cursor.close()
        conn.close()

    return redirect("/")


@app.route("/buy", methods=["POST"])
def buy():
    selected_products = request.form.getlist("selected_products")
    return render_template("confirmation.html", products=selected_products)


print("http://" + os.getenv("PUBLIC_IP") + ":5000")

create_llm_cache_table()

if __name__ == "__main__":
    app.debug = True
    app.run(
        host="0.0.0.0",
        port=8181,
    )
