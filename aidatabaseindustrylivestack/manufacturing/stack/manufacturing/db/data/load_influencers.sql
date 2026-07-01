/*
 * load_influencers.sql
 * 500 supplier, engineer, and operations network accounts across industrial platforms
 */

SET SERVEROUTPUT ON
PROMPT Loading manufacturing network accounts...

DECLARE
    TYPE t_str IS TABLE OF VARCHAR2(100);
    v_prefixes t_str := t_str(
        'plant',
        'line',
        'tooling',
        'supplier',
        'quality',
        'safety',
        'maintenance',
        'robotics',
        'automation',
        'cnc',
        'welding',
        'casting',
        'molding',
        'sensor',
        'electronics',
        'assembly',
        'logistics',
        'materials',
        'inventory',
        'planner',
        'scheduler',
        'machining',
        'lean',
        'kaizen',
        'factory',
        'production',
        'throughput',
        'capacity',
        'uptime',
        'reliability',
        'packaging',
        'industrial',
        'fabrication',
        'parts',
        'motion',
        'hydraulic',
        'controls',
        'operator',
        'engineer',
        'procurement',
        'sourcing',
        'inspection',
        'metrology',
        'spares',
        'mro',
        'warehouse',
        'shift',
        'workcell',
        'oee',
        'yield',
        'dispatch',
        'expedite'
    );
    v_suffixes t_str := t_str(
        '_sarah','_mike','_jen','_alex','_zoe','_marcus','_lily','_kai',
        '_maya','_tyler','_ava','_cole','_nina','_drew','_ella','_finn',
        '_aria','_owen','_luna','_jack','_mia','_noah','_ivy','_leo',
        '_ruby','_max','_cleo','_dane','_faye','_gus','_hope','_ines',
        '_jace','_kara','_liam','_nora','_omar','_pia','_reed','_sage',
        '_tess','_uma','_vince','_wren','_xena','_yuri','_zara','_beau',
        '_cass','_dev'
    );
    v_platforms t_str := t_str('instagram','tiktok','twitter','youtube','threads');
    v_niches    t_str := t_str(
        'Industrial Automation',
        'Electronics Manufacturing',
        'Metal Fabrication',
        'CNC Machining',
        'Injection Molding',
        'Robotics',
        'Quality Assurance',
        'MRO Supply',
        'Industrial IoT',
        'Packaging Materials',
        'Production Planning',
        'Supplier Quality',
        'Maintenance Reliability',
        'Plant Logistics',
        'Aftermarket Parts'
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

            -- Vary reach counts: mostly local/regional, some national, few global.
            CASE
                WHEN DBMS_RANDOM.VALUE < 0.05 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(1000000, 15000000));  -- global
                WHEN DBMS_RANDOM.VALUE < 0.15 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(100000, 1000000));    -- macro
                WHEN DBMS_RANDOM.VALUE < 0.40 THEN
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(10000, 100000));      -- mid
                ELSE
                    v_followers := FLOOR(DBMS_RANDOM.VALUE(1000, 10000));        -- micro
            END CASE;

            -- Engagement rate inversely correlates with follower count
            v_eng_rate := CASE
                WHEN v_followers > 1000000 THEN ROUND(DBMS_RANDOM.VALUE(0.005, 0.025), 4)
                WHEN v_followers > 100000  THEN ROUND(DBMS_RANDOM.VALUE(0.015, 0.045), 4)
                WHEN v_followers > 10000   THEN ROUND(DBMS_RANDOM.VALUE(0.025, 0.08), 4)
                ELSE ROUND(DBMS_RANDOM.VALUE(0.03, 0.12), 4)
            END;

            -- Influence score: blend of reach and engagement
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
    DBMS_OUTPUT.PUT_LINE('Manufacturing network accounts loaded: ' || v_count);
END;
/
