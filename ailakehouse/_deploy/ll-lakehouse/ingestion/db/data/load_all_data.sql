/* Generated entrypoint for the app database gold-data seed. */
SET SERVEROUTPUT ON
SET DEFINE OFF
@@load_gold_seed.sql
@@normalize_seed_dates.sql
@@enrich_product_descriptions.sql
@@enrich_webshop_product_attributes.sql
@@enrich_inventory_reservations.sql
@@enrich_inventory_regional_coverage.sql
@@enrich_social_signal_sources.sql
@@enrich_social_signal_text.sql
@@enrich_post_product_mentions.sql
@@load_graph_data.sql
@@backfill_social_post_criticality.sql
