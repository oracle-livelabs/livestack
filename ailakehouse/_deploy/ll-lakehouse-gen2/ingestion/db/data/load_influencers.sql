/*
 * load_influencers.sql
 * 500 retail, creator, competitor, store, and operations signal sources
 */

SET SERVEROUTPUT ON
PROMPT Loading signal sources...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(100);
    v_prefixes t_str := t_str(
        'trail','run','hike','camp','bike','fitness','wearable','outdoor','activewear','team','school','b2b','creator','tiktok','youtube','review','price','promo','pos','inventory','returns','pickup','delivery','catalog','image','manual','safety','weather','region','store','ecom','market','demand','forecast','propensity','loyalty','partner','vendor','warehouse','dc','spark','gold','silver','bronze','lakehouse','catalogops','assortment','merch','planner','customer','support'
    );
    v_suffixes t_str := t_str(
        '_watch','_updates','_desk','_alerts','_bulletin','_ops','_lab',
        '_review','_monitor','_signal','_weekly','_notice','_intel',
        '_tracker','_returns_audit','_routing','_safety','_market','_network',
        '_wire','_flow','_audit','_forecast','_screen','_index','_map',
        '_ledger','_hub','_feed','_brief','_node','_office','_control',
        '_registry','_release','_status','_planner','_source','_risk',
        '_queue','_matrix','_watchlist','_coordinator','_report','_pulse',
        '_observer','_channel','_bulletins','_bridge','_controlroom'
    );
    -- Platform values are constrained by the original schema. In this retargeted
    -- demo they represent feed channels, retail and operations feed channels.
    v_platforms t_str := t_str('instagram','tiktok','twitter','youtube','threads');
    v_niches    t_str := t_str(
        'Trail Running','Outdoor Gear','Camping','Cycling','Fitness Devices','Activewear','Team Sports','B2B Partnerships','Creator Trends','Competitive Pricing','POS Transactions','Inventory Planning','Returns Audit','Store Pickup','E-Commerce','Product Safety','Product Images','Product Manuals','Demand Forecasting','Customer Propensity'
    );
    v_cities    t_str := t_str(
        'New York','Los Angeles','Chicago','Houston','Phoenix','San Francisco',
        'Miami','Seattle','Denver','Austin','Nashville','Portland','Boston',
        'Atlanta','Dallas','San Diego','Minneapolis','Detroit','Las Vegas','Brooklyn'
    );
    v_regions   t_str := t_str(
        'New York','California','Illinois','Texas','Arizona','California',
        'Florida','Washington','Colorado','Texas','Tennessee','Oregon','Massachusetts',
        'Georgia','Texas','California','Minnesota','Michigan','Nevada','New York'
    );
    v_handle    VARCHAR2(200);
    v_count     NUMBER := 0;
    v_followers NUMBER;
    v_eng_rate  NUMBER;
    v_score     NUMBER;
    v_plat_idx  NUMBER;
    v_niche_idx NUMBER;
    v_city_idx  NUMBER;
BEGIN
    FOR i IN 1..v_prefixes.COUNT LOOP
        FOR j IN 1..10 LOOP
            v_handle := '@' || v_prefixes(i) || v_suffixes(MOD(i * j, v_suffixes.COUNT) + 1);

            -- Vary subscriber counts: mostly specialist feeds, some major desks.
            CASE
                WHEN DBMS_RANDOM.VALUE < 0.05 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(1000000, 15000000));  -- mega
                WHEN DBMS_RANDOM.VALUE < 0.15 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(100000, 1000000));    -- macro
                WHEN DBMS_RANDOM.VALUE < 0.40 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(10000, 100000));      -- mid
                ELSE
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(1000, 10000));        -- micro
            END CASE;

            -- Engagement rate inversely correlates with subscriber count.
            v_eng_rate := CASE
                WHEN v_followers > 1000000 THEN ROUND(DBMS_RANDOM.VALUE(0.005, 0.025), 4)
                WHEN v_followers > 100000  THEN ROUND(DBMS_RANDOM.VALUE(0.015, 0.045), 4)
                WHEN v_followers > 10000   THEN ROUND(DBMS_RANDOM.VALUE(0.025, 0.08), 4)
                ELSE ROUND(DBMS_RANDOM.VALUE(0.03, 0.12), 4)
            END;

            -- Source score: blend of reach and engagement.
            v_score := ROUND(
                LEAST(100,
                    LN(v_followers) * 5 +
                    v_eng_rate * 500 +
                    DBMS_RANDOM.VALUE(-5, 10)
                ), 2);

            v_plat_idx  := MOD(v_count, v_platforms.COUNT) + 1;
            v_niche_idx := MOD(v_count, v_niches.COUNT) + 1;
            v_city_idx  := MOD(v_count, v_cities.COUNT) + 1;

            BEGIN
                INSERT INTO influencers (
                    handle, display_name, platform, follower_count,
                    engagement_rate, influence_score, niche, city,
                    region, is_verified
                ) VALUES (
                    v_handle,
                    INITCAP(REPLACE(REPLACE(v_handle, '@', ''), '_', ' ')),
                    v_platforms(v_plat_idx),
                    v_followers,
                    v_eng_rate,
                    v_score,
                    v_niches(v_niche_idx),
                    v_cities(v_city_idx),
                    v_regions(v_city_idx),
                    CASE WHEN v_followers > 500000 THEN 1 ELSE 0 END
                );
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;

            EXIT WHEN v_count >= 500;
        END LOOP;
        EXIT WHEN v_count >= 500;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Signal sources loaded: ' || v_count);
END;
/
