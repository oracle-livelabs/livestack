UPDATE fulfillment_centers
SET location = SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

UPDATE customers
SET location = SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

MERGE INTO product_attributes target
USING (
    SELECT p.product_id,
           JSON_OBJECT(
             'sku' VALUE p.sku,
             'title' VALUE p.product_name,
             'contentType' VALUE p.category,
             'unitPrice' VALUE p.unit_price,
             'active' VALUE p.is_active,
             'tags' VALUE p.tags
             RETURNING JSON
           ) attributes
    FROM products p
) incoming
ON (target.product_id = incoming.product_id)
WHEN MATCHED THEN UPDATE SET target.attributes = incoming.attributes
WHEN NOT MATCHED THEN INSERT(product_id, attributes)
VALUES(incoming.product_id, incoming.attributes);

MERGE INTO social_post_payloads target
USING (
    SELECT post.post_id,
           NVL(post.platform, 'instagram') platform,
           JSON_OBJECT(
             'postId' VALUE post.post_id,
             'externalPostId' VALUE post.external_post_id,
             'platform' VALUE post.platform,
             'text' VALUE post.post_text,
             'postedAt' VALUE post.posted_at
             RETURNING JSON
           ) raw_payload,
           JSON_OBJECT(
             'sentimentScore' VALUE post.sentiment_score,
             'viralityScore' VALUE post.virality_score,
             'momentum' VALUE post.momentum_flag,
             'detectedProducts' VALUE post.detected_products
             RETURNING JSON
           ) enrichments
    FROM social_posts post
) incoming
ON (target.post_id = incoming.post_id)
WHEN MATCHED THEN UPDATE SET
    target.platform = incoming.platform,
    target.raw_payload = incoming.raw_payload,
    target.enrichments = incoming.enrichments
WHEN NOT MATCHED THEN INSERT(post_id, platform, raw_payload, enrichments)
VALUES(incoming.post_id, incoming.platform, incoming.raw_payload, incoming.enrichments);

MERGE INTO event_stream target
USING (
    SELECT 'media-bootstrap-product-' || p.product_id correlation_id,
           JSON_OBJECT(
             'productId' VALUE p.product_id,
             'sku' VALUE p.sku,
             'contentType' VALUE p.category,
             'datasetVersion' VALUE 'v1'
             RETURNING JSON
           ) event_data
    FROM products p
) incoming
ON (target.event_type = 'content_catalog_bootstrapped'
    AND target.event_source = 'fresh_bootstrap'
    AND target.correlation_id = incoming.correlation_id)
WHEN MATCHED THEN UPDATE SET target.event_data = incoming.event_data, target.processed = 0
WHEN NOT MATCHED THEN INSERT(event_type, event_source, event_data, correlation_id, processed)
VALUES('content_catalog_bootstrapped', 'fresh_bootstrap', incoming.event_data, incoming.correlation_id, 0);

DECLARE
    v_products PLS_INTEGER;
    v_attributes PLS_INTEGER;
    v_events PLS_INTEGER;
    v_posts PLS_INTEGER;
    v_payloads PLS_INTEGER;
    v_centers PLS_INTEGER;
    v_customers PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_products FROM products;
    SELECT COUNT(*) INTO v_attributes FROM product_attributes;
    SELECT COUNT(*) INTO v_events FROM event_stream WHERE event_type = 'content_catalog_bootstrapped';
    SELECT COUNT(*) INTO v_posts FROM social_posts;
    SELECT COUNT(*) INTO v_payloads FROM social_post_payloads;
    SELECT COUNT(*) INTO v_centers FROM fulfillment_centers WHERE location IS NOT NULL;
    SELECT COUNT(*) INTO v_customers FROM customers WHERE location IS NOT NULL;
    IF v_products < 1 OR v_attributes <> v_products OR v_events <> v_products
       OR v_posts < 1 OR v_payloads <> v_posts
       OR v_centers < 1 OR v_customers < 1 THEN
        RAISE_APPLICATION_ERROR(-20422, 'Media native JSON or Spatial derived data is incomplete');
    END IF;
END;
/
COMMIT;
