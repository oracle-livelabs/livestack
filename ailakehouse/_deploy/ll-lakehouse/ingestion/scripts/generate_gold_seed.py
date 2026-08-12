#!/usr/bin/env python3
"""
Generate the pg-stack seed set from the canonical gold-data CSV exports.

The app keeps the original PeakGear LiveStack schema so the existing routes,
pages, OML demos, graph demos, and agent workflows continue to run. This script
maps the larger gold lakehouse exports into that runtime schema and stores every
derived data set back under pg-stack/gold-data/pg-derived.
"""

from __future__ import annotations

import csv
import json
import math
import random
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


STACK_DIR = Path(__file__).resolve().parents[1]
ROOT = STACK_DIR.parent
GOLD_DIR = STACK_DIR / "gold-data"
DERIVED_DIR = GOLD_DIR / "pg-derived"
DATA_DIR = STACK_DIR / "db" / "data"

ORDER_LIMIT = 5000
ITEM_LIMIT = 8500
PRODUCT_LIMIT = 650
SOCIAL_POST_LIMIT = 420
FORECAST_PRODUCT_LIMIT = 160

random.seed(20260507)


def read_csv(name: str):
    with (GOLD_DIR / name).open(newline="", encoding="utf-8-sig") as fh:
        yield from csv.DictReader(fh)


def write_csv(name: str, rows: list[dict], fieldnames: list[str]) -> None:
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    with (DERIVED_DIR / name).open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def clean(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def to_int(value, default=0) -> int:
    try:
        return int(float(clean(value)))
    except (TypeError, ValueError):
        return default


def to_float(value, default=0.0) -> float:
    try:
        if clean(value) == "":
            return default
        return float(clean(value))
    except (TypeError, ValueError):
        return default


def parse_dt(value: str) -> datetime:
    raw = clean(value)
    if not raw:
        return datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    raw = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)


def sql_str(value) -> str:
    text = clean(value).replace("\x00", "")
    return "'" + text.replace("'", "''") + "'"


def sql_clob(value) -> str:
    return f"TO_CLOB({sql_str(value)})"


def sql_num(value, default=0) -> str:
    number = to_float(value, default)
    if math.isfinite(number):
        return f"{number:.6f}".rstrip("0").rstrip(".")
    return str(default)


def sql_int(value, default=0) -> str:
    return str(to_int(value, default))


def sql_ts(value) -> str:
    dt = value if isinstance(value, datetime) else parse_dt(value)
    return "TO_TIMESTAMP(" + sql_str(dt.strftime("%Y-%m-%d %H:%M:%S")) + ", 'YYYY-MM-DD HH24:MI:SS')"


def sql_date(value) -> str:
    dt = value if isinstance(value, datetime) else parse_dt(value)
    return "TO_DATE(" + sql_str(dt.strftime("%Y-%m-%d")) + ", 'YYYY-MM-DD')"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "gold"


def split_name(name: str) -> tuple[str, str]:
    parts = [p for p in clean(name).split() if p]
    if not parts:
        return "Gold", "Customer"
    if len(parts) == 1:
        return parts[0], "Customer"
    return parts[0], " ".join(parts[1:])


def tier_from_loyalty(value: str) -> str:
    value = clean(value).upper()
    if value in {"PLATINUM", "DIAMOND"}:
        return "vip"
    if value == "GOLD":
        return "preferred"
    if value in {"SILVER", "BRONZE"}:
        return "standard"
    return "new"


def center_type(store_type: str) -> str:
    value = clean(store_type).upper()
    if value in {"MEGA", "FLAGSHIP"}:
        return "store"
    if value in {"DC", "DISTRIBUTION"}:
        return "distribution"
    if value in {"MICRO"}:
        return "micro"
    return "store"


def order_status(txn_id: str, returned_txns: set[str]) -> str:
    if txn_id in returned_txns:
        return "returned"
    statuses = ["completed", "completed", "completed", "processing", "routed", "confirmed"]
    return statuses[to_int(txn_id) % len(statuses)]


def shipment_status(status: str) -> str:
    return {
        "completed": "completed",
        "returned": "exception",
        "cancelled": "exception",
        "processing": "packed",
        "routed": "in_transit",
        "confirmed": "preparing",
        "pending": "preparing",
    }.get(status, "completed")


def product_brand(product_name: str, category: str) -> str:
    first = clean(product_name).split(" ")[0] if clean(product_name) else ""
    if first and not first.isdigit():
        return first
    return clean(category).replace("_", " ").title() or "PeakGear"


def parse_store_geo() -> dict[int, tuple[float, float]]:
    geos = {}
    for row in read_csv("STORE_GEOCODE.csv"):
        try:
            payload = json.loads(row["LOCATION_GEO"])
            lon, lat = payload["point"]["directposition"]
            geos[to_int(row["STORE_SK"])] = (float(lat), float(lon))
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
    return geos


def load_dimensions():
    products = {}
    for row in read_csv("DIM_PRODUCT.csv"):
        source_id = to_int(row.get("SOURCE_PRODUCT_ID"))
        product_sk = to_int(row.get("PRODUCT_SK"))
        row["_PRODUCT_ID"] = source_id or product_sk
        if source_id:
            products[source_id] = row
        if product_sk:
            products.setdefault(product_sk, row)

    customers = {}
    for row in read_csv("DIM_CUSTOMER.csv"):
        source_id = to_int(row.get("SOURCE_CUSTOMER_ID"))
        customer_sk = to_int(row.get("CUSTOMER_SK"))
        row["_CUSTOMER_ID"] = source_id or customer_sk
        if source_id:
            customers[source_id] = row
        if customer_sk:
            customers.setdefault(customer_sk, row)

    store_geo = parse_store_geo()
    addresses = {to_int(r["STORE_SK"]): r for r in read_csv("STORE_ADDRESS.csv")}
    stores = {}
    for row in read_csv("DIM_STORE.csv"):
        sid = to_int(row["STORE_SK"])
        lat, lon = store_geo.get(sid, (39.5 + sid * 0.01, -98.5 - sid * 0.01))
        row["_LAT"] = lat
        row["_LON"] = lon
        row["_ADDRESS"] = addresses.get(sid, {})
        stores[sid] = row

    return products, customers, stores


def select_sales(products, stores):
    selected = []
    txns = set()
    product_ids = set()
    customer_ids = set()
    for row in read_csv("FACT_SALES.csv"):
        product_id = to_int(row["PRODUCT_ID"])
        store_id = to_int(row["STORE_ID"])
        customer_id = to_int(row["CUSTOMER_ID"])
        txn_id = clean(row["TXN_ID"])
        if product_id not in products or store_id not in stores or not txn_id:
            continue
        if txn_id not in txns and len(txns) >= ORDER_LIMIT:
            continue
        if product_id not in product_ids and len(product_ids) >= PRODUCT_LIMIT:
            continue
        selected.append(row)
        txns.add(txn_id)
        product_ids.add(product_id)
        customer_ids.add(customer_id)
        if len(selected) >= ITEM_LIMIT and len(txns) >= ORDER_LIMIT:
            break
    return selected, txns, product_ids, customer_ids


def derive_products(products, selected_product_ids):
    manual_ids = {to_int(r["PRODUCT_ID"]) for r in read_csv("PRODUCT_MANUALS_SOURCE.csv")}
    selected_product_ids = {
        products[pid]["_PRODUCT_ID"]
        for pid in selected_product_ids
        if pid in products
    } | {
        products[pid]["_PRODUCT_ID"]
        for pid in manual_ids
        if pid in products
    }
    for pid in sorted({row["_PRODUCT_ID"] for row in products.values() if row.get("_PRODUCT_ID")}):
        if len(selected_product_ids) >= PRODUCT_LIMIT:
            break
        if pid in products:
            selected_product_ids.add(pid)

    product_rows = []
    brand_names = {}
    for gold_id in sorted(selected_product_ids):
        src = products[gold_id]
        brand = product_brand(src["PRODUCT_NAME"], src["CATEGORY"])
        brand_names.setdefault(brand, len(brand_names) + 1)
        app_id = len(product_rows) + 1
        category = clean(src["CATEGORY"]).replace("_", " ").title() or "Uncategorized"
        product_rows.append({
            "product_id": app_id,
            "gold_product_id": gold_id,
            "product_sk": to_int(src.get("PRODUCT_SK"), gold_id),
            "source_product_id": to_int(src.get("SOURCE_PRODUCT_ID"), gold_id),
            "brand_id": brand_names[brand],
            "sku": clean(src["SKU"]) or f"SKU-{gold_id}",
            "product_name": clean(src["PRODUCT_NAME"]) or f"Gold Product {gold_id}",
            "description": (
                f"Gold catalog product {gold_id} sourced from {clean(src['SOURCE_SYSTEM']) or 'gold-data'} "
                f"in the {category} category."
            ),
            "category": category,
            "subcategory": clean(src["SOURCE_SYSTEM"]) or "Gold Lakehouse",
            "unit_price": round(to_float(src["CURRENT_RETAIL_PRICE"], 25), 2),
            "unit_cost": round(to_float(src["CURRENT_COST_PRICE"], 10), 2),
            "weight_kg": round(0.35 + (gold_id % 80) / 20, 3),
            "launch_date": parse_dt(src["INSERT_DT"]).date().isoformat(),
            "tags": f"gold-data,{slugify(category)},{clean(src['SOURCE_SYSTEM']) or 'source'}",
        })

    brand_rows = []
    cities = [
        ("Denver", 39.7392, -104.9903), ("Seattle", 47.6062, -122.3321),
        ("Austin", 30.2672, -97.7431), ("Chicago", 41.8781, -87.6298),
        ("Portland", 45.5152, -122.6784), ("Atlanta", 33.749, -84.388),
    ]
    for brand, brand_id in sorted(brand_names.items(), key=lambda kv: kv[1]):
        city, lat, lon = cities[(brand_id - 1) % len(cities)]
        brand_rows.append({
            "brand_id": brand_id,
            "brand_name": brand,
            "brand_slug": slugify(brand),
            "brand_category": "Gold Product Line",
            "headquarters_city": city,
            "headquarters_lat": lat,
            "headquarters_lon": lon,
            "founded_year": 1985 + (brand_id % 35),
            "annual_revenue": 25_000_000 + brand_id * 1_750_000,
            "social_tier": ["standard", "premium", "emerging", "luxury"][brand_id % 4],
        })
    return brand_rows, product_rows


def derive_centers(stores):
    rows = []
    for sid, row in sorted(stores.items()):
        addr = row.get("_ADDRESS", {})
        rows.append({
            "center_id": sid,
            "center_name": f"PeakGear {clean(addr.get('CITY')) or clean(row['LOCATION']).split(',')[0]} Store {sid:03d}",
            "center_type": center_type(row["STORE_TYPE"]),
            "address_line1": clean(addr.get("STREET")) or clean(row["LOCATION"]).split(",")[0],
            "city": clean(addr.get("CITY")) or clean(row["LOCATION"]).split(",")[0],
            "state_province": clean(addr.get("REGION")) or "US",
            "postal_code": clean(addr.get("POSTAL_CODE")) or "00000",
            "country": clean(addr.get("COUNTRY_CODE")) or "US",
            "latitude": row["_LAT"],
            "longitude": row["_LON"],
            "capacity_units": 75_000 + sid * 1500,
            "current_load_pct": 35 + (sid % 45),
        })
    return rows


def derive_customers(customers, stores, selected_customer_ids, sales_rows):
    by_customer_store = {}
    for row in sales_rows:
        by_customer_store.setdefault(to_int(row["CUSTOMER_ID"]), to_int(row["STORE_ID"]))

    rows = []
    for gold_id in sorted(selected_customer_ids):
        src = customers.get(gold_id, {})
        store = stores.get(by_customer_store.get(gold_id)) or next(iter(stores.values()))
        first, last = split_name(src.get("CUSTOMER_NAME") or f"Gold Customer {gold_id}")
        email = clean(src.get("EMAIL")) or f"gold.customer.{gold_id}@peakgear.example"
        lat = float(store["_LAT"]) + random.uniform(-0.35, 0.35)
        lon = float(store["_LON"]) + random.uniform(-0.35, 0.35)
        rows.append({
            "customer_id": len(rows) + 1,
            "gold_customer_id": gold_id,
            "email": email.lower(),
            "first_name": first,
            "last_name": last,
            "city": clean(store.get("_ADDRESS", {}).get("CITY")) or "Gold Metro",
            "state_province": clean(store.get("_ADDRESS", {}).get("REGION")) or "US",
            "postal_code": clean(store.get("_ADDRESS", {}).get("POSTAL_CODE")) or "00000",
            "country": "US",
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "customer_tier": tier_from_loyalty(src.get("LOYALTY_TIER")),
            "lifetime_value": round(max(to_float(src.get("INCOME"), 0) * 0.04, 100), 2),
        })
    return rows


def derive_orders(sales_rows, product_rows, customer_rows, returns_txns):
    product_map = {}
    for r in product_rows:
        for key in (r["gold_product_id"], r["product_sk"], r["source_product_id"]):
            product_map[key] = r["product_id"]
    product_by_id = {r["product_id"]: r for r in product_rows}
    product_ids = [r["product_id"] for r in product_rows]
    products_by_category = defaultdict(list)
    for r in product_rows:
        products_by_category[r["category"]].append(r["product_id"])
    customer_map = {r["gold_customer_id"]: r["customer_id"] for r in customer_rows}
    customer_by_id = {r["customer_id"]: r for r in customer_rows}
    orders = {}
    order_items = []
    order_product_ids = defaultdict(set)

    def choose_distinct_product(source_product_id, order_id):
        product_id = product_map[source_product_id]
        used = order_product_ids[order_id]
        if product_id not in used:
            return product_id

        # The gold sales export repeats one product across multi-row transactions.
        # Rotate duplicate line items to nearby catalog products so carts look realistic.
        category = product_by_id[product_id]["category"]
        candidates = products_by_category.get(category, []) + product_ids
        start = (order_id + product_id + len(used)) % len(candidates)
        for offset in range(len(candidates)):
            candidate = candidates[(start + offset) % len(candidates)]
            if candidate not in used:
                return candidate
        return product_id

    def choose_line_quantity(raw_qty, order_id, product_id, line_index):
        qty = min(max(to_int(raw_qty, 1), 1), 4)
        if qty > 1:
            return qty

        seed = (order_id * 17 + product_id * 31 + line_index * 7) % 20
        if seed in {0, 1, 2, 3}:
            return 2
        if seed in {4, 5}:
            return 3
        if seed == 6:
            return 4
        return 1

    for row in sales_rows:
        txn_id = clean(row["TXN_ID"])
        if txn_id not in orders:
            oid = len(orders) + 1
            cid = customer_map[to_int(row["CUSTOMER_ID"])]
            created = parse_dt(row["TXN_TIMESTAMP"])
            status = order_status(txn_id, returns_txns)
            cust = customer_by_id[cid]
            orders[txn_id] = {
                "order_id": oid,
                "gold_txn_id": txn_id,
                "customer_id": cid,
                "order_status": status,
                "order_total": 0,
                "shipping_cost": round(5 + (oid % 9) * 1.35, 2),
                "fulfillment_center_id": to_int(row["STORE_ID"], 1),
                "shipping_lat": cust["latitude"],
                "shipping_lon": cust["longitude"],
                "estimated_delivery": (created + timedelta(days=3 + oid % 5)).date().isoformat(),
                "actual_delivery": (created + timedelta(days=4 + oid % 6)).date().isoformat() if status == "completed" else "",
                "social_source_id": "",
                "demand_score": round(45 + (oid % 55), 2),
                "created_at": created,
            }
        order = orders[txn_id]
        source_product_id = to_int(row["PRODUCT_ID"])
        line_index = len(order_product_ids[order["order_id"]])
        product_id = choose_distinct_product(source_product_id, order["order_id"])
        order_product_ids[order["order_id"]].add(product_id)
        qty = choose_line_quantity(row.get("QTY_SOLD"), order["order_id"], product_id, line_index)
        if product_id == product_map[source_product_id]:
            price = round(to_float(row["UNIT_RETAIL_PRICE"], product_by_id[product_id]["unit_price"]), 2)
        else:
            price = round(float(product_by_id[product_id]["unit_price"]), 2)
        order["order_total"] += qty * price
        order_items.append({
            "item_id": len(order_items) + 1,
            "order_id": order["order_id"],
            "product_id": product_id,
            "quantity": qty,
            "unit_price": price,
            "fulfilled_from": order["fulfillment_center_id"],
        })
    return list(orders.values()), order_items


def derive_inventory(product_rows):
    product_map = {}
    for r in product_rows:
        for key in (r["gold_product_id"], r["product_sk"], r["source_product_id"]):
            product_map[key] = r["product_id"]
    latest = {}
    for row in read_csv("FACT_INVENTORY_MOVEMENT.csv"):
        gold_product = to_int(row["PRODUCT_ID"])
        if gold_product not in product_map:
            continue
        key = (product_map[gold_product], to_int(row["STORE_ID"], 1))
        snap = parse_dt(row["SNAPSHOT_DATE"])
        if key not in latest or snap > latest[key][0]:
            latest[key] = (snap, row)
    rows = []
    for (product_id, center_id), (snap, row) in sorted(latest.items()):
        qoh = max(to_int(row["STOCK_ON_HAND"], 0), 0)
        reorder = max(to_int(row["REORDER_LEVEL"], 25), 10)
        rows.append({
            "inventory_id": len(rows) + 1,
            "product_id": product_id,
            "center_id": center_id,
            "quantity_on_hand": qoh,
            "quantity_reserved": min(qoh, 5 + product_id % 18),
            "quantity_incoming": max(reorder * 3 - qoh, 0),
            "reorder_point": reorder,
            "reorder_qty": max(reorder * 4, 80),
            "last_restock_date": snap.date().isoformat(),
        })
    existing = {(r["product_id"], r["center_id"]) for r in rows}
    for product in product_rows:
        for center_id in range(1, 6):
            key = (product["product_id"], center_id)
            if key in existing:
                continue
            rows.append({
                "inventory_id": len(rows) + 1,
                "product_id": product["product_id"],
                "center_id": center_id,
                "quantity_on_hand": 80 + (product["product_id"] * center_id) % 240,
                "quantity_reserved": (product["product_id"] + center_id) % 25,
                "quantity_incoming": 50 + (product["product_id"] % 70),
                "reorder_point": 40,
                "reorder_qty": 160,
                "last_restock_date": "2026-05-01",
            })
            existing.add(key)
    return rows[:6000]


def derive_signals(product_rows):
    vendors = list(read_csv("DIM_VENDOR.csv"))[:30]
    influencers = []
    platforms = ["twitter", "threads", "youtube", "instagram", "tiktok"]
    for idx, vendor in enumerate(vendors, start=1):
        name = clean(vendor["VENDOR_NAME"]) or f"Gold Signal Source {idx}"
        influencers.append({
            "influencer_id": idx,
            "handle": f"@{slugify(name).replace('-', '_')}_{idx:02d}",
            "display_name": name,
            "platform": platforms[idx % len(platforms)],
            "follower_count": 10_000 + idx * 7_500,
            "engagement_rate": round(0.015 + (idx % 12) / 500, 4),
            "influence_score": round(55 + (idx % 40), 2),
            "niche": "Supplier Feed",
            "city": ["Dallas", "Phoenix", "Seattle", "Atlanta", "Chicago"][idx % 5],
            "region": clean(vendor["REGION"]) or "NA",
            "country": "US",
            "is_verified": 1 if idx % 3 == 0 else 0,
        })

    manual_text = {}
    for row in read_csv("PRODUCT_VECTOR_STORE.csv"):
        pid = to_int(row["PRODUCT_ID"])
        manual_text.setdefault(pid, clean(row["CHUNK_TEXT"]).replace("\n", " ")[:420])

    posts = []
    mentions = []
    signal_base_time = datetime(2026, 5, 7, 8, 0)
    for product in product_rows[:SOCIAL_POST_LIMIT]:
        gold_id = product["gold_product_id"]
        source = influencers[(product["product_id"] - 1) % len(influencers)]
        text = manual_text.get(gold_id) or (
            f"Gold supplier feed shows active demand for {product['product_name']} in "
            f"{product['category']} with current retail price ${product['unit_price']}."
        )
        if len(text) < 120:
            text += f" Product {gold_id} remains part of the PeakGear gold-data catalog."
        post_id = len(posts) + 1
        hour_slot = (post_id * 5) % (24 * 7)
        age_hours = hour_slot + (post_id % 4) * 0.18
        daily_wave = 0.55 + 0.45 * math.sin((hour_slot % 24) / 24 * math.tau)
        campaign_wave = 0.65 + 0.35 * math.sin(hour_slot / (24 * 7) * math.tau * 5)
        burst_multiplier = 1 + daily_wave + campaign_wave
        if hour_slot in {14, 15, 16, 57, 58, 59, 111, 112, 113, 145, 146, 147}:
            burst_multiplier *= 3.0 + (post_id % 4) * 0.45
        elif hour_slot % 24 in {7, 8, 18, 19}:
            burst_multiplier *= 1.45 + (post_id % 3) * 0.2
        base_likes = 120 + ((product["product_id"] * 31 + post_id * 17) % 620)
        likes = int(base_likes * burst_multiplier)
        shares = max(8, int(likes * (0.12 + (post_id % 5) * 0.018)))
        comments = max(4, int(likes * (0.055 + (post_id % 4) * 0.012)))
        views = int(likes * (18 + (post_id % 9) * 3) + 1200)
        virality = min(99, 45 + int(burst_multiplier * 9) + (product["product_id"] * 7) % 30)
        momentum = "mega_viral" if likes >= 6000 or virality >= 94 else "viral" if likes >= 2600 or virality >= 82 else "rising" if likes >= 950 or virality >= 64 else "normal"
        posts.append({
            "post_id": post_id,
            "influencer_id": source["influencer_id"],
            "platform": source["platform"],
            "external_post_id": f"GOLD-SIGNAL-{gold_id}-{post_id}",
            "post_text": text,
            "posted_at": (signal_base_time - timedelta(hours=age_hours)).isoformat(),
            "likes_count": likes,
            "shares_count": shares,
            "comments_count": comments,
            "views_count": views,
            "sentiment_score": round(0.15 + (post_id % 8) / 20, 3),
            "virality_score": virality,
            "detected_products": str(product["product_id"]),
            "momentum_flag": momentum,
        })
        mentions.append({
            "mention_id": len(mentions) + 1,
            "post_id": post_id,
            "product_id": product["product_id"],
            "confidence_score": round(0.72 + (post_id % 20) / 100, 3),
            "mention_type": "semantic" if post_id % 2 else "direct",
        })
    return influencers, posts, mentions


def derive_forecasts(sales_rows, product_rows, centers):
    product_map = {}
    for r in product_rows:
        for key in (r["gold_product_id"], r["product_sk"], r["source_product_id"]):
            product_map[key] = r["product_id"]
    region_by_store = {r["center_id"]: r["state_province"] for r in centers}
    qty = Counter()
    for row in sales_rows:
        pid = product_map[to_int(row["PRODUCT_ID"])]
        region = region_by_store.get(to_int(row["STORE_ID"], 1), "US")
        qty[(pid, region)] += max(to_int(row["QTY_SOLD"], 1), 1)
    rows = []
    base_date = datetime(2026, 5, 8)
    for (pid, region), amount in qty.most_common(FORECAST_PRODUCT_LIMIT * 2):
        if len(rows) >= FORECAST_PRODUCT_LIMIT * 2:
            break
        predicted = max(12, int(amount * 1.25) + (pid % 14))
        rows.append({
            "forecast_id": len(rows) + 1,
            "product_id": pid,
            "region": region,
            "forecast_date": (base_date + timedelta(days=len(rows) % 21)).date().isoformat(),
            "predicted_demand": predicted,
            "confidence_low": max(predicted - 8, 1),
            "confidence_high": predicted + 14,
            "social_factor": round(1.0 + (pid % 35) / 100, 2),
            "model_version": "gold-data-v1",
            "explanation": json.dumps({"source": "FACT_SALES.csv", "signal": "derived gold forecast"}),
        })
    return rows


def derive_regions(centers):
    grouped = defaultdict(list)
    for c in centers:
        grouped[c["state_province"]].append(c)
    rows = []
    for region, members in sorted(grouped.items(), key=lambda kv: len(kv[1]), reverse=True)[:12]:
        lats = [float(m["latitude"]) for m in members]
        lons = [float(m["longitude"]) for m in members]
        rows.append({
            "region_id": len(rows) + 1,
            "region_name": f"{region} Gold Stores",
            "region_type": "state",
            "lon_min": min(lons) - 0.35,
            "lat_min": min(lats) - 0.35,
            "lon_max": max(lons) + 0.35,
            "lat_max": max(lats) + 0.35,
            "population": 750000 + len(members) * 210000,
            "avg_income": 62000 + len(members) * 1750,
            "social_density": round(8.5 + len(members) * 1.25, 2),
            "demand_index": min(95, 58 + len(members) * 4),
        })
    return rows


def derive_shipments(orders):
    rows = []
    for order in orders[:1600]:
        status = shipment_status(order["order_status"])
        created = order["created_at"]
        rows.append({
            "shipment_id": len(rows) + 1,
            "order_id": order["order_id"],
            "center_id": order["fulfillment_center_id"],
            "carrier": ["UPS", "FedEx", "USPS", "PeakGear Fleet"][order["order_id"] % 4],
            "tracking_number": f"PGGOLD{order['order_id']:08d}",
            "ship_status": status,
            "distance_km": round(18 + (order["order_id"] % 900) * 1.7, 2),
            "estimated_hours": round(2 + (order["order_id"] % 32) * 0.75, 2),
            "ship_cost": round(order["shipping_cost"] + (order["order_id"] % 7), 2),
            "routed_at": created + timedelta(hours=6),
            "completed_at": created + timedelta(days=4) if status == "completed" else None,
        })
    return rows


def derive_graph(influencers, brand_rows, mentions):
    connections = []
    for idx, inf in enumerate(influencers, start=1):
        target = influencers[(idx + 3) % len(influencers)]["influencer_id"]
        if inf["influencer_id"] == target:
            continue
        connections.append({
            "connection_id": len(connections) + 1,
            "from_influencer": inf["influencer_id"],
            "to_influencer": target,
            "connection_type": ["mentioned", "reshared", "inspired_by", "collaborates"][idx % 4],
            "strength": round(0.45 + (idx % 35) / 100, 3),
            "interaction_count": 3 + idx,
        })
    links = []
    for idx, brand in enumerate(brand_rows[: min(40, len(brand_rows))], start=1):
        inf = influencers[idx % len(influencers)]
        links.append({
            "link_id": len(links) + 1,
            "brand_id": brand["brand_id"],
            "influencer_id": inf["influencer_id"],
            "relationship_type": ["organic", "sponsored", "affiliate", "competitor_mention"][idx % 4],
            "post_count": 1 + idx % 12,
            "avg_engagement": round(0.02 + (idx % 16) / 200, 4),
            "revenue_attributed": round(2500 + idx * 430.5, 2),
        })
    return connections, links


def derive_returns(stores):
    entities = []
    relationships = []
    cases = []
    case_entities = []
    case_by_reason = {}
    entity_key_to_id = {}
    relationship_key_to_index = {}

    def add_entity(key, name, etype, score, region, city, channel, amount, count, confirmed=0):
        if key in entity_key_to_id:
            return entity_key_to_id[key]
        eid = len(entities) + 1
        entity_key_to_id[key] = eid
        level = "critical" if score >= 90 else "high" if score >= 75 else "medium" if score >= 45 else "low"
        entities.append({
            "entity_id": eid,
            "entity_key": key,
            "display_name": name,
            "entity_type": etype,
            "review_score": score,
            "review_level": level,
            "region": region,
            "city": city,
            "channel": channel,
            "total_amount": amount,
            "event_count": count,
            "is_confirmed_returns": confirmed,
        })
        return eid

    def add_case(reason, score):
        if reason in case_by_reason:
            return case_by_reason[reason]
        cid = len(cases) + 1
        case_by_reason[reason] = cid
        cases.append({
            "case_id": cid,
            "case_ref": f"CASE-GOLD-{cid:03d}",
            "case_type": reason.replace("_", " ").title(),
            "status": "escalated" if score >= 90 else "reviewing",
            "review_score": score,
            "loss_amount": 0,
            "event_count": 0,
        })
        return cid

    def add_relationship(from_id, to_id, rel_type, strength, amount):
        key = (from_id, to_id, rel_type)
        if key in relationship_key_to_index:
            relationship = relationships[relationship_key_to_index[key]]
            relationship["strength"] = max(relationship["strength"], round(strength, 3))
            relationship["event_count"] += 1
            relationship["total_amount"] = round(relationship["total_amount"] + amount, 2)
            return

        relationship_key_to_index[key] = len(relationships)
        relationships.append({
            "relationship_id": len(relationships) + 1,
            "from_entity": from_id,
            "to_entity": to_id,
            "relationship_type": rel_type,
            "strength": round(strength, 3),
            "event_count": 1,
            "total_amount": round(amount, 2),
        })

    for row in list(read_csv("RETURNS_AUDIT_BY_STORE.csv"))[:80]:
        store_id = to_int(row["STORE_ID"], 1)
        store = stores.get(store_id, {})
        addr = store.get("_ADDRESS", {})
        city = clean(addr.get("CITY")) or "Gold Store"
        region = clean(addr.get("REGION")) or "US"
        score = to_float(row["RISK_SCORE"], 50)
        reason = clean(row["RETURN_REASON"]) or "RETURN_REVIEW"
        amount = 150 + score * 12
        cid = add_case(reason, score)
        cases[cid - 1]["loss_amount"] += amount
        cases[cid - 1]["event_count"] += 1
        acct = add_entity(
            "ACCT-" + slugify(row["EMAIL"])[:42],
            f"{clean(row['EMAIL'])} Return Profile",
            "customer_account", score, region, city, "web", amount, 1, 1 if score >= 90 else 0,
        )
        receipt = add_entity(
            f"RECEIPT-{clean(row['TRANSACTION_ID'])}",
            f"Gold Transaction {clean(row['TRANSACTION_ID'])}",
            "receipt", score, region, city, "returns", amount, 1, 1 if score >= 90 else 0,
        )
        store_ent = add_entity(
            f"STORE-{store_id:03d}",
            f"PeakGear {city} Store {store_id:03d}",
            "store", max(score - 20, 35), region, city, "store", amount, 1, 0,
        )
        refund = add_entity(
            f"REFUND-{reason[:28]}",
            reason.replace("_", " ").title() + " Refund Pattern",
            "refund_method", score, region, city, "returns", amount, 1, 1 if score >= 90 else 0,
        )
        for to_id, rel_type, strength in [
            (receipt, "same_receipt", 0.90),
            (refund, "refund_method", 0.86),
            (store_ent, "store_origin", 0.70),
        ]:
            add_relationship(acct, to_id, rel_type, strength + min(score, 99) / 1000, amount)
        for eid, role in [(acct, "seed"), (receipt, "shared_order"), (refund, "refund_method"), (store_ent, "store")]:
            case_entities.append({
                "case_entity_id": len(case_entities) + 1,
                "case_id": cid,
                "entity_id": eid,
                "role": role,
                "evidence_score": score,
            })
    return entities, relationships, cases, case_entities


def sdo_point(lon, lat) -> str:
    return f"SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE({sql_num(lon)}, {sql_num(lat)}, NULL), NULL, NULL)"


def sdo_box(row) -> str:
    lon_min, lat_min, lon_max, lat_max = row["lon_min"], row["lat_min"], row["lon_max"], row["lat_max"]
    return (
        "SDO_GEOMETRY(2003, 4326, NULL, SDO_ELEM_INFO_ARRAY(1, 1003, 1), "
        f"SDO_ORDINATE_ARRAY({sql_num(lon_min)}, {sql_num(lat_min)}, {sql_num(lon_max)}, {sql_num(lat_min)}, "
        f"{sql_num(lon_max)}, {sql_num(lat_max)}, {sql_num(lon_min)}, {sql_num(lat_max)}, "
        f"{sql_num(lon_min)}, {sql_num(lat_min)}))"
    )


def write_seed_sql(data):
    lines = [
        "/* Generated by scripts/generate_gold_seed.py from pg-stack/gold-data CSV exports. */",
        "SET SERVEROUTPUT ON",
        "SET DEFINE OFF",
        "PROMPT Loading pg-stack gold-data seed...",
        "@@reset_data.sql",
        "",
    ]

    for r in data["brands"]:
        lines.append(
            "INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier) "
            "VALUES ("
            f"{sql_str(r['brand_name'])},{sql_str(r['brand_slug'])},{sql_str(r['brand_category'])},{sql_str(r['headquarters_city'])},"
            f"{sql_num(r['headquarters_lat'])},{sql_num(r['headquarters_lon'])},{r['founded_year']},{sql_num(r['annual_revenue'])},{sql_str(r['social_tier'])});"
        )
    lines.append("COMMIT;")

    for r in data["products"]:
        lines.append(
            "INSERT INTO products (brand_id,sku,product_name,description,category,subcategory,unit_price,unit_cost,weight_kg,is_active,launch_date,tags) "
            "VALUES ("
            f"{r['brand_id']},{sql_str(r['sku'])},{sql_str(r['product_name'])},{sql_clob(r['description'])},"
            f"{sql_str(r['category'])},{sql_str(r['subcategory'])},{sql_num(r['unit_price'])},{sql_num(r['unit_cost'])},{sql_num(r['weight_kg'])},1,"
            f"{sql_date(r['launch_date'])},{sql_str(r['tags'])});"
        )
    lines.append("COMMIT;")

    for r in data["centers"]:
        lines.append(
            "INSERT INTO fulfillment_centers (center_name,center_type,address_line1,city,state_province,postal_code,country,latitude,longitude,capacity_units,current_load_pct,location) "
            "VALUES ("
            f"{sql_str(r['center_name'])},{sql_str(r['center_type'])},{sql_str(r['address_line1'])},{sql_str(r['city'])},"
            f"{sql_str(r['state_province'])},{sql_str(r['postal_code'])},{sql_str(r['country'])},{sql_num(r['latitude'])},{sql_num(r['longitude'])},"
            f"{sql_int(r['capacity_units'])},{sql_num(r['current_load_pct'])},{sdo_point(r['longitude'], r['latitude'])});"
        )
    lines.append("COMMIT;")

    for r in data["customers"]:
        lines.append(
            "INSERT INTO customers (email,first_name,last_name,city,state_province,postal_code,country,latitude,longitude,location,customer_tier,lifetime_value) "
            "VALUES ("
            f"{sql_str(r['email'])},{sql_str(r['first_name'])},{sql_str(r['last_name'])},{sql_str(r['city'])},"
            f"{sql_str(r['state_province'])},{sql_str(r['postal_code'])},{sql_str(r['country'])},{sql_num(r['latitude'])},{sql_num(r['longitude'])},"
            f"{sdo_point(r['longitude'], r['latitude'])},{sql_str(r['customer_tier'])},{sql_num(r['lifetime_value'])});"
        )
    lines.append("COMMIT;")

    for r in data["influencers"]:
        lines.append(
            "INSERT INTO influencers (handle,display_name,platform,follower_count,engagement_rate,influence_score,niche,city,region,country,is_verified) "
            "VALUES ("
            f"{sql_str(r['handle'])},{sql_str(r['display_name'])},{sql_str(r['platform'])},{r['follower_count']},"
            f"{sql_num(r['engagement_rate'])},{sql_num(r['influence_score'])},{sql_str(r['niche'])},{sql_str(r['city'])},{sql_str(r['region'])},"
            f"{sql_str(r['country'])},{r['is_verified']});"
        )
    lines.append("COMMIT;")

    for r in data["social_posts"]:
        lines.append(
            "INSERT INTO social_posts (influencer_id,platform,external_post_id,post_text,posted_at,likes_count,shares_count,comments_count,views_count,sentiment_score,virality_score,detected_products,momentum_flag,processed_at) "
            "VALUES ("
            f"{r['influencer_id']},{sql_str(r['platform'])},{sql_str(r['external_post_id'])},{sql_clob(r['post_text'])},{sql_ts(r['posted_at'])},"
            f"{r['likes_count']},{r['shares_count']},{r['comments_count']},{r['views_count']},{sql_num(r['sentiment_score'])},{sql_num(r['virality_score'])},"
            f"{sql_str(r['detected_products'])},{sql_str(r['momentum_flag'])},{sql_ts(r['posted_at'])});"
        )
    lines.append("COMMIT;")

    for r in data["mentions"]:
        lines.append(
            "INSERT INTO post_product_mentions (post_id,product_id,confidence_score,mention_type) VALUES ("
            f"{r['post_id']},{r['product_id']},{sql_num(r['confidence_score'])},{sql_str(r['mention_type'])});"
        )
    for r in data["connections"]:
        lines.append(
            "INSERT INTO influencer_connections (from_influencer,to_influencer,connection_type,strength,interaction_count) VALUES ("
            f"{r['from_influencer']},{r['to_influencer']},{sql_str(r['connection_type'])},{sql_num(r['strength'])},{r['interaction_count']});"
        )
    for r in data["brand_links"]:
        lines.append(
            "INSERT INTO brand_influencer_links (brand_id,influencer_id,relationship_type,post_count,avg_engagement,revenue_attributed,first_mention,last_mention) "
            "VALUES ("
            f"{r['brand_id']},{r['influencer_id']},{sql_str(r['relationship_type'])},{r['post_count']},{sql_num(r['avg_engagement'])},"
            f"{sql_num(r['revenue_attributed'])},SYSTIMESTAMP - INTERVAL '10' DAY,SYSTIMESTAMP);"
        )
    lines.append("COMMIT;")

    for r in data["inventory"]:
        lines.append(
            "INSERT INTO inventory (product_id,center_id,quantity_on_hand,quantity_reserved,quantity_incoming,reorder_point,reorder_qty,last_restock_date) "
            "VALUES ("
            f"{r['product_id']},{r['center_id']},{r['quantity_on_hand']},{r['quantity_reserved']},{r['quantity_incoming']},"
            f"{r['reorder_point']},{r['reorder_qty']},{sql_date(r['last_restock_date'])});"
        )
    lines.append("COMMIT;")

    for r in data["orders"]:
        lines.append(
            "INSERT INTO orders (customer_id,order_status,order_total,shipping_cost,fulfillment_center_id,shipping_lat,shipping_lon,estimated_delivery,actual_delivery,social_source_id,demand_score,created_at,updated_at) "
            "VALUES ("
            f"{r['customer_id']},{sql_str(r['order_status'])},{sql_num(r['order_total'])},{sql_num(r['shipping_cost'])},{r['fulfillment_center_id']},"
            f"{sql_num(r['shipping_lat'])},{sql_num(r['shipping_lon'])},{sql_date(r['estimated_delivery'])},"
            f"{sql_date(r['actual_delivery']) if r['actual_delivery'] else 'NULL'},NULL,{sql_num(r['demand_score'])},{sql_ts(r['created_at'])},{sql_ts(r['created_at'])});"
        )
    lines.append("COMMIT;")

    for r in data["order_items"]:
        lines.append(
            "INSERT INTO order_items (order_id,product_id,quantity,unit_price,fulfilled_from) VALUES ("
            f"{r['order_id']},{r['product_id']},{r['quantity']},{sql_num(r['unit_price'])},{r['fulfilled_from']});"
        )
    lines.append("COMMIT;")

    for r in data["shipments"]:
        lines.append(
            "INSERT INTO shipments (order_id,center_id,carrier,tracking_number,ship_status,distance_km,estimated_hours,ship_cost,routed_at,completed_at) "
            "VALUES ("
            f"{r['order_id']},{r['center_id']},{sql_str(r['carrier'])},{sql_str(r['tracking_number'])},{sql_str(r['ship_status'])},"
            f"{sql_num(r['distance_km'])},{sql_num(r['estimated_hours'])},{sql_num(r['ship_cost'])},{sql_ts(r['routed_at'])},"
            f"{sql_ts(r['completed_at']) if r['completed_at'] else 'NULL'});"
        )
    lines.append("COMMIT;")

    for r in data["regions"]:
        lines.append(
            "INSERT INTO demand_regions (region_name,region_type,boundary,population,avg_income,social_density,demand_index) VALUES ("
            f"{sql_str(r['region_name'])},{sql_str(r['region_type'])},{sdo_box(r)},{r['population']},{sql_num(r['avg_income'])},"
            f"{sql_num(r['social_density'])},{sql_num(r['demand_index'])});"
        )
    for r in data["forecasts"]:
        lines.append(
            "INSERT INTO demand_forecasts (product_id,region,forecast_date,predicted_demand,confidence_low,confidence_high,social_factor,model_version,explanation) "
            "VALUES ("
            f"{r['product_id']},{sql_str(r['region'])},{sql_date(r['forecast_date'])},{r['predicted_demand']},{r['confidence_low']},"
            f"{r['confidence_high']},{sql_num(r['social_factor'])},{sql_str(r['model_version'])},{sql_clob(r['explanation'])});"
        )
    lines.append("COMMIT;")

    lines.append("@@load_app_users.sql")
    lines.append("""
MERGE INTO app_dataset_state target
USING (SELECT 1 AS state_id, 'demo' AS active_source, 'Gold Data' AS active_label, 'pg-gold-v1' AS active_version FROM dual) incoming
ON (target.state_id = incoming.state_id)
WHEN MATCHED THEN UPDATE SET
  target.active_source = incoming.active_source,
  target.active_label = incoming.active_label,
  target.active_version = incoming.active_version,
  target.updated_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT (state_id, active_source, active_label, active_version, updated_at)
VALUES (incoming.state_id, incoming.active_source, incoming.active_label, incoming.active_version, SYSTIMESTAMP);
COMMIT;
""".strip())
    lines.append("SELECT 'pg-stack gold data loaded' AS status FROM dual;")
    (DATA_DIR / "load_gold_seed.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (DATA_DIR / "load_all_data.sql").write_text(
        "\n".join([
            "/* Generated entrypoint for the app database gold-data seed. */",
            "SET SERVEROUTPUT ON",
            "SET DEFINE OFF",
            "@@load_gold_seed.sql",
            "@@normalize_seed_dates.sql",
            "@@enrich_product_descriptions.sql",
            "@@enrich_webshop_product_attributes.sql",
            "@@enrich_inventory_reservations.sql",
            "@@enrich_inventory_regional_coverage.sql",
            "@@enrich_social_signal_sources.sql",
            "@@enrich_social_signal_text.sql",
            "@@enrich_post_product_mentions.sql",
            "@@load_graph_data.sql",
            "@@backfill_social_post_criticality.sql",
            "",
        ]),
        encoding="utf-8",
    )


def write_returns_sql(data):
    lines = [
        "/* Generated by scripts/generate_gold_seed.py from gold-data/RETURNS_AUDIT_BY_STORE.csv. */",
        "SET SERVEROUTPUT ON",
        "SET DEFINE OFF",
        "PROMPT Loading gold-data returns relationship graph...",
        "DELETE FROM returns_case_entities;",
        "DELETE FROM returns_relationships;",
        "DELETE FROM returns_cases;",
        "DELETE FROM returns_entities;",
        "COMMIT;",
    ]
    for r in data["return_entities"]:
        lines.append(
            "INSERT INTO returns_entities (entity_id,entity_key,display_name,entity_type,review_score,review_level,region,city,channel,total_amount,event_count,first_seen,last_seen,is_confirmed_returns) "
            "VALUES ("
            f"{r['entity_id']},{sql_str(r['entity_key'])},{sql_str(r['display_name'])},{sql_str(r['entity_type'])},{sql_num(r['review_score'])},"
            f"{sql_str(r['review_level'])},{sql_str(r['region'])},{sql_str(r['city'])},{sql_str(r['channel'])},{sql_num(r['total_amount'])},{r['event_count']},"
            "SYSTIMESTAMP - INTERVAL '30' DAY,SYSTIMESTAMP,"
            f"{r['is_confirmed_returns']});"
        )
    for r in data["return_cases"]:
        lines.append(
            "INSERT INTO returns_cases (case_id,case_ref,case_type,status,review_score,loss_amount,event_count,opened_at,updated_at) VALUES ("
            f"{r['case_id']},{sql_str(r['case_ref'])},{sql_str(r['case_type'])},{sql_str(r['status'])},{sql_num(r['review_score'])},"
            f"{sql_num(r['loss_amount'])},{r['event_count']},SYSTIMESTAMP - INTERVAL '14' DAY,SYSTIMESTAMP);"
        )
    for r in data["return_relationships"]:
        lines.append(
            "INSERT INTO returns_relationships (relationship_id,from_entity,to_entity,relationship_type,strength,event_count,total_amount,first_seen,last_seen) VALUES ("
            f"{r['relationship_id']},{r['from_entity']},{r['to_entity']},{sql_str(r['relationship_type'])},{sql_num(r['strength'])},"
            f"{r['event_count']},{sql_num(r['total_amount'])},SYSTIMESTAMP - INTERVAL '10' DAY,SYSTIMESTAMP);"
        )
    seen_case_edges = set()
    for r in data["return_case_entities"]:
        key = (r["case_id"], r["entity_id"], r["role"])
        if key in seen_case_edges:
            continue
        seen_case_edges.add(key)
        lines.append(
            "INSERT INTO returns_case_entities (case_entity_id,case_id,entity_id,role,evidence_score) VALUES ("
            f"{len(seen_case_edges)},{r['case_id']},{r['entity_id']},{sql_str(r['role'])},{sql_num(r['evidence_score'])});"
        )
    lines.append("COMMIT;")
    lines.append("SELECT (SELECT COUNT(*) FROM returns_entities) AS returns_entities, (SELECT COUNT(*) FROM returns_relationships) AS returns_relationships, (SELECT COUNT(*) FROM returns_cases) AS returns_cases FROM dual;")
    (DATA_DIR / "load_fraud_graph.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_zones_sql(centers):
    lines = [
        "/* Generated by scripts/generate_gold_seed.py from gold store geocodes. */",
        "SET SERVEROUTPUT ON",
        "SET DEFINE OFF",
        "PROMPT Loading gold-data fulfillment zones...",
        "DELETE FROM fulfillment_zones;",
    ]
    for center in centers:
        lat = float(center["latitude"])
        lon = float(center["longitude"])
        row = {
            "lon_min": lon - 0.45,
            "lat_min": lat - 0.35,
            "lon_max": lon + 0.45,
            "lat_max": lat + 0.35,
        }
        lines.append(
            "INSERT INTO fulfillment_zones (center_id,zone_type,max_delivery_hrs,zone_boundary) VALUES ("
            f"{center['center_id']},{sql_str(['express','standard','economy','overnight'][center['center_id'] % 4])},"
            f"{sql_num(4 + center['center_id'] % 18)},{sdo_box(row)});"
        )
    lines.append("COMMIT;")
    lines.append("SELECT COUNT(*) AS fulfillment_zones FROM fulfillment_zones;")
    (DATA_DIR / "seed_fulfillment_zones.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    products, customers, stores = load_dimensions()
    sales_rows, _, selected_product_ids, selected_customer_ids = select_sales(products, stores)
    returned_txns = {clean(r["TRANSACTION_ID"]) for r in read_csv("RETURNS_AUDIT_BY_STORE.csv")}
    brand_rows, product_rows = derive_products(products, selected_product_ids)
    centers = derive_centers(stores)
    customer_rows = derive_customers(customers, stores, selected_customer_ids, sales_rows)
    orders, order_items = derive_orders(sales_rows, product_rows, customer_rows, returned_txns)
    inventory = derive_inventory(product_rows)
    influencers, social_posts, mentions = derive_signals(product_rows)
    forecasts = derive_forecasts(sales_rows, product_rows, centers)
    regions = derive_regions(centers)
    shipments = derive_shipments(orders)
    connections, brand_links = derive_graph(influencers, brand_rows, mentions)
    return_entities, return_relationships, return_cases, return_case_entities = derive_returns(stores)

    data = {
        "brands": brand_rows,
        "products": product_rows,
        "centers": centers,
        "customers": customer_rows,
        "orders": orders,
        "order_items": order_items,
        "inventory": inventory,
        "influencers": influencers,
        "social_posts": social_posts,
        "mentions": mentions,
        "forecasts": forecasts,
        "regions": regions,
        "shipments": shipments,
        "connections": connections,
        "brand_links": brand_links,
        "return_entities": return_entities,
        "return_relationships": return_relationships,
        "return_cases": return_cases,
        "return_case_entities": return_case_entities,
    }

    write_csv("brands.csv", brand_rows, list(brand_rows[0]))
    write_csv("products.csv", product_rows, list(product_rows[0]))
    write_csv("fulfillment_centers.csv", centers, list(centers[0]))
    write_csv("customers.csv", customer_rows, list(customer_rows[0]))
    write_csv("orders.csv", [{**r, "created_at": r["created_at"].isoformat()} for r in orders], [*orders[0].keys()])
    write_csv("order_items.csv", order_items, list(order_items[0]))
    write_csv("inventory.csv", inventory, list(inventory[0]))
    write_csv("influencers.csv", influencers, list(influencers[0]))
    write_csv("social_posts.csv", social_posts, list(social_posts[0]))
    write_csv("post_product_mentions.csv", mentions, list(mentions[0]))
    write_csv("demand_regions.csv", regions, list(regions[0]))
    write_csv("demand_forecasts.csv", forecasts, list(forecasts[0]))
    write_csv("shipments.csv", [
        {**r, "routed_at": r["routed_at"].isoformat(), "completed_at": r["completed_at"].isoformat() if r["completed_at"] else ""}
        for r in shipments
    ], [*shipments[0].keys()])
    write_csv("returns_entities.csv", return_entities, list(return_entities[0]))
    write_csv("returns_relationships.csv", return_relationships, list(return_relationships[0]))
    write_csv("returns_cases.csv", return_cases, list(return_cases[0]))
    write_csv("returns_case_entities.csv", return_case_entities, list(return_case_entities[0]))

    write_seed_sql(data)
    write_returns_sql(data)
    write_zones_sql(centers)

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_files": [
            "DIM_PRODUCT.csv", "DIM_CUSTOMER.csv", "DIM_STORE.csv", "STORE_ADDRESS.csv",
            "STORE_GEOCODE.csv", "FACT_SALES.csv", "FACT_INVENTORY_MOVEMENT.csv",
            "DIM_VENDOR.csv", "PRODUCT_VECTOR_STORE.csv", "RETURNS_AUDIT_BY_STORE.csv",
        ],
        "derived_counts": {key: len(value) for key, value in data.items() if isinstance(value, list)},
        "sql_outputs": [
            "pg-stack/db/data/load_all_data.sql",
            "pg-stack/db/data/load_gold_seed.sql",
            "pg-stack/db/data/load_fraud_graph.sql",
            "pg-stack/db/data/seed_fulfillment_zones.sql",
        ],
    }
    (DERIVED_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["derived_counts"], indent=2))


if __name__ == "__main__":
    main()
