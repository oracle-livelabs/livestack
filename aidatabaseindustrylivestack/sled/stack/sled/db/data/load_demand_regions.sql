/*
 * load_demand_regions.sql
 * Seed data for Colorado public service demand regions.
 *
 * Each polygon is a simple in-state bounding box in WGS84 / SRID 4326.
 * The regions support county and regional-service-area comparisons for
 * Demand & Capacity Analytics and Service Access & Coverage Map overlays.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Loading Colorado public service demand regions...

DECLARE
    PROCEDURE add_region (
        p_name           VARCHAR2,
        p_lon_min        NUMBER,
        p_lat_min        NUMBER,
        p_lon_max        NUMBER,
        p_lat_max        NUMBER,
        p_population     NUMBER,
        p_avg_income     NUMBER,
        p_social_density NUMBER,
        p_demand_index   NUMBER
    ) IS
    BEGIN
        INSERT INTO demand_regions (
            region_name,
            region_type,
            boundary,
            population,
            avg_income,
            social_density,
            demand_index
        ) VALUES (
            p_name,
            'region',
            SDO_GEOMETRY(
                2003,
                4326,
                NULL,
                SDO_ELEM_INFO_ARRAY(1, 1003, 1),
                SDO_ORDINATE_ARRAY(
                    p_lon_min, p_lat_min,
                    p_lon_max, p_lat_min,
                    p_lon_max, p_lat_max,
                    p_lon_min, p_lat_max,
                    p_lon_min, p_lat_min
                )
            ),
            p_population,
            p_avg_income,
            p_social_density,
            p_demand_index
        );
    END add_region;
BEGIN
    add_region('Denver County Service Region',              -105.10, 39.60, -104.60, 40.05, 715000,  85000, 18.4, 91);
    add_region('Arapahoe County Service Region',            -105.05, 39.45, -103.70, 39.85, 655000,  82000, 17.1, 87);
    add_region('Jefferson County Service Region',           -105.40, 39.45, -105.05, 40.15, 580000,  90000, 14.7, 78);
    add_region('Adams County Service Region',               -105.05, 39.70, -103.70, 40.10, 525000,  78000, 13.2, 74);
    add_region('Boulder County Service Region',             -105.70, 39.90, -105.05, 40.35, 330000, 105000, 22.1, 95);
    add_region('Larimer County Service Region',             -106.20, 40.25, -104.90, 41.00, 370000,  83000, 16.5, 83);
    add_region('Weld County Service Region',                -105.10, 40.00, -103.50, 41.00, 340000,  76000, 12.8, 71);
    add_region('Douglas County Service Region',             -105.35, 39.10, -104.55, 39.55, 375000, 121000, 11.9, 69);
    add_region('El Paso County Service Region',             -105.10, 38.55, -104.05, 39.15, 750000,  79000, 15.6, 88);
    add_region('Pueblo County Service Region',              -105.05, 37.75, -104.05, 38.55, 170000,  60000, 11.4, 67);
    add_region('Mesa County Service Region',                -109.05, 38.50, -107.75, 39.40, 160000,  65000, 13.9, 73);
    add_region('Garfield County Service Region',            -108.00, 39.20, -106.60, 40.00,  62000,  84000, 10.8, 76);
    add_region('Eagle County Service Region',               -107.20, 39.30, -106.25, 40.05,  56000,  96000, 19.3, 80);
    add_region('Summit County Service Region',              -106.45, 39.30, -105.70, 40.00,  32000,  97000, 24.7, 89);
    add_region('Routt County Service Region',               -107.45, 39.80, -106.55, 41.00,  25000,  89000, 11.1, 63);
    add_region('Montrose County Service Region',            -108.30, 37.85, -107.25, 38.90,  44000,  61000,  9.3, 60);
    add_region('La Plata County Service Region',            -108.35, 36.99, -106.95, 37.85,  58000,  78000, 16.2, 77);
    add_region('Alamosa County Service Region',             -106.15, 37.20, -105.25, 37.90,  16500,  54000, 10.2, 65);
    add_region('Northeast Plains Regional Service Area',    -104.00, 39.00, -102.05, 41.00, 120000,  62000,  9.8, 62);
    add_region('Southwest Colorado Regional Service Area',  -109.05, 36.99, -107.20, 38.10,  95000,  68000, 12.6, 84);
END;
/

COMMIT;
PROMPT Colorado demand regions loaded: 20

SELECT 'demand_regions seeded: ' || COUNT(*) || ' rows' AS status FROM demand_regions;
