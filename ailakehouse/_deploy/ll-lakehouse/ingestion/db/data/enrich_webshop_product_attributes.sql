/*
 * enrich_webshop_product_attributes.sql
 * Adds explainable retail attributes for hybrid webshop search.
 * Color is initialized as unknown here and refreshed from image embeddings by
 * the webshop service when the image index is built.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF
PROMPT Enriching webshop product attributes...

DECLARE
    v_count NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'WEBSHOP_PRODUCT_ATTRIBUTES';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE '
            CREATE TABLE webshop_product_attributes (
                product_id            NUMBER PRIMARY KEY REFERENCES products(product_id),
                color_family          VARCHAR2(40) DEFAULT ''unknown'' NOT NULL,
                product_type          VARCHAR2(80) NOT NULL,
                source_image_filename VARCHAR2(500),
                color_confidence      NUMBER(8,6),
                updated_at            TIMESTAMP DEFAULT SYSTIMESTAMP
            )
        ';
    END IF;
END;
/

DECLARE
    v_count NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_indexes
    WHERE index_name = 'IDX_WEB_ATTR_COLOR';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_web_attr_color ON webshop_product_attributes(color_family)';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM user_indexes
    WHERE index_name = 'IDX_WEB_ATTR_TYPE';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_web_attr_type ON webshop_product_attributes(product_type)';
    END IF;
END;
/

MERGE INTO webshop_product_attributes a
USING (
    SELECT p.product_id,
           CASE
             WHEN LOWER(p.product_name) LIKE '%trail runner%' THEN 'trail running shoe'
             WHEN LOWER(p.product_name) LIKE '%running shoe%' THEN 'running shoe'
             WHEN LOWER(p.product_name) LIKE '%cross-training shoe%' THEN 'training shoe'
             WHEN LOWER(p.product_name) LIKE '%hiking boot%' THEN 'hiking boot'
             WHEN LOWER(p.product_name) LIKE '%running socks%' THEN 'running socks'
             WHEN LOWER(p.product_name) LIKE '%training hoodie%' THEN 'hoodie'
             WHEN LOWER(p.product_name) LIKE '%compression shorts%' THEN 'compression shorts'
             WHEN LOWER(p.product_name) LIKE '%performance tee%' THEN 'tee shirt'
             WHEN LOWER(p.product_name) LIKE '%base layer top%' THEN 'base layer top'
             WHEN LOWER(p.product_name) LIKE '%base layer pants%' THEN 'base layer pants'
             WHEN LOWER(p.product_name) LIKE '%outdoor jacket%' THEN 'outdoor jacket'
             WHEN LOWER(p.product_name) LIKE '%daypack%' THEN 'daypack'
             WHEN LOWER(p.product_name) LIKE '%backpack%' THEN 'backpack'
             WHEN LOWER(p.product_name) LIKE '%trekking poles%' THEN 'trekking poles'
             WHEN LOWER(p.product_name) LIKE '%tent%' THEN 'tent'
             WHEN LOWER(p.product_name) LIKE '%camping stove%' THEN 'camping stove'
             WHEN LOWER(p.product_name) LIKE '%headlamp%' THEN 'headlamp'
             WHEN LOWER(p.product_name) LIKE '%dry bag%' THEN 'dry bag'
             WHEN LOWER(p.product_name) LIKE '%bike light%' THEN 'bike light'
             WHEN LOWER(p.product_name) LIKE '%cycling jersey%' THEN 'cycling jersey'
             WHEN LOWER(p.product_name) LIKE '%repair kit%' THEN 'repair kit'
             WHEN LOWER(p.product_name) LIKE '%kettlebell%' THEN 'kettlebell'
             WHEN LOWER(p.product_name) LIKE '%dumbbells%' THEN 'dumbbells'
             WHEN LOWER(p.product_name) LIKE '%resistance band%' THEN 'resistance bands'
             WHEN LOWER(p.product_name) LIKE '%yoga mat%' THEN 'yoga mat'
             WHEN LOWER(p.product_name) LIKE '%foam roller%' THEN 'foam roller'
             WHEN LOWER(p.product_name) LIKE '%gps fitness watch%' THEN 'fitness watch'
             WHEN LOWER(p.product_name) LIKE '%smart scale%' THEN 'smart scale'
             WHEN LOWER(p.product_name) LIKE '%basketball%' THEN 'basketball'
             WHEN LOWER(p.product_name) LIKE '%soccer ball%' THEN 'soccer ball'
             WHEN LOWER(p.product_name) LIKE '%baseball glove%' THEN 'baseball glove'
             WHEN LOWER(p.product_name) LIKE '%volleyball%' THEN 'volleyball'
             WHEN LOWER(p.product_name) LIKE '%pickleball paddle%' THEN 'pickleball paddle'
             WHEN LOWER(p.product_name) LIKE '%tennis racket%' THEN 'tennis racket'
             WHEN LOWER(p.product_name) LIKE '%badminton set%' THEN 'badminton set'
             WHEN LOWER(p.product_name) LIKE '%grip tape%' THEN 'grip tape'
             WHEN LOWER(p.product_name) LIKE '%climbing harness%' THEN 'climbing harness'
             WHEN LOWER(p.product_name) LIKE '%belay device%' THEN 'belay device'
             WHEN LOWER(p.product_name) LIKE '%carabiner set%' THEN 'carabiner set'
             WHEN LOWER(p.product_name) LIKE '%snow helmet%' THEN 'snow helmet'
             WHEN LOWER(p.product_name) LIKE '%wetsuit%' THEN 'wetsuit'
             WHEN LOWER(p.product_name) LIKE '%swim goggles%' THEN 'swim goggles'
             WHEN LOWER(p.product_name) LIKE '%paddle leash%' THEN 'paddle leash'
             WHEN LOWER(p.product_name) LIKE '%electrolyte mix%' THEN 'electrolyte mix'
             ELSE LOWER(NVL(p.subcategory, p.category))
           END AS product_type
    FROM products p
    WHERE p.is_active = 1
) src
ON (a.product_id = src.product_id)
WHEN MATCHED THEN
    UPDATE SET a.product_type = src.product_type,
               a.updated_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN
    INSERT (product_id, color_family, product_type, updated_at)
    VALUES (src.product_id, 'unknown', src.product_type, SYSTIMESTAMP);

COMMIT;

DECLARE
    v_rows NUMBER := 0;
BEGIN
    SELECT COUNT(*) INTO v_rows FROM webshop_product_attributes;
    DBMS_OUTPUT.PUT_LINE('Webshop product attributes available: ' || v_rows);
END;
/
