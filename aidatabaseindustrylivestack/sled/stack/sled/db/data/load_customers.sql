/*
 * load_customers.sql
 * 2000 synthetic Colorado residents across in-state service areas
 */

SET SERVEROUTPUT ON
PROMPT Loading synthetic residents...

DECLARE
    TYPE t_city IS RECORD (
        city VARCHAR2(100), state VARCHAR2(100), lat NUMBER, lon NUMBER, zip VARCHAR2(10)
    );
    TYPE t_city_arr IS TABLE OF t_city;
    v_cities t_city_arr := t_city_arr();

    TYPE t_str IS TABLE OF VARCHAR2(100);
    v_fnames t_str := t_str(
        'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda',
        'William','Elizabeth','David','Barbara','Richard','Susan','Joseph','Jessica',
        'Thomas','Sarah','Christopher','Karen','Charles','Lisa','Daniel','Nancy',
        'Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley',
        'Steven','Kimberly','Andrew','Emily','Paul','Donna','Joshua','Michelle',
        'Kenneth','Carol','Kevin','Amanda','Brian','Dorothy','George','Melissa',
        'Timothy','Deborah','Aiden','Sofia','Liam','Olivia','Noah','Emma',
        'Ethan','Ava','Mason','Isabella','Lucas','Mia','Logan','Charlotte',
        'Jackson','Amelia','Sebastian','Harper','Mateo','Evelyn','Henry','Luna',
        'Owen','Camila','Wyatt','Aria','Jack','Scarlett','Leo','Penelope',
        'Asher','Layla','Ezra','Chloe','Benjamin','Riley','Caleb','Zoey',
        'Samuel','Nora','Dylan','Lily','Gabriel','Eleanor','Elijah','Hannah'
    );
    v_lnames t_str := t_str(
        'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
        'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
        'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
        'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker',
        'Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill',
        'Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell',
        'Mitchell','Carter','Roberts','Gomez','Phillips','Evans','Turner','Diaz',
        'Parker','Cruz','Edwards','Collins','Reyes','Stewart','Morris','Morales',
        'Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper','Peterson',
        'Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson',
        'Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza',
        'Ruiz','Hughes','Price','Alvarez','Castillo','Sanders','Patel','Myers'
    );
    v_tiers t_str := t_str('new','standard','standard','standard','preferred','preferred','vip');
    v_c t_city;
    v_count     NUMBER := 0;
    v_email     VARCHAR2(300);
    v_ltv       NUMBER;
    v_fname_idx NUMBER;
    v_lname_idx NUMBER;
    v_tier_idx  NUMBER;

    PROCEDURE add_city(p_city VARCHAR2, p_state VARCHAR2, p_lat NUMBER, p_lon NUMBER, p_zip VARCHAR2) IS
        v_rec t_city;
    BEGIN
        v_rec.city := p_city; v_rec.state := p_state; v_rec.lat := p_lat;
        v_rec.lon := p_lon; v_rec.zip := p_zip;
        v_cities.EXTEND; v_cities(v_cities.COUNT) := v_rec;
    END;
BEGIN
    add_city('Denver','Colorado',39.7392,-104.9903,'80202');
    add_city('Aurora','Colorado',39.7294,-104.8319,'80012');
    add_city('Colorado Springs','Colorado',38.8339,-104.8214,'80903');
    add_city('Fort Collins','Colorado',40.5853,-105.0844,'80521');
    add_city('Lakewood','Colorado',39.7047,-105.0814,'80226');
    add_city('Thornton','Colorado',39.8680,-104.9719,'80229');
    add_city('Arvada','Colorado',39.8028,-105.0875,'80002');
    add_city('Westminster','Colorado',39.8367,-105.0372,'80031');
    add_city('Pueblo','Colorado',38.2544,-104.6091,'81003');
    add_city('Greeley','Colorado',40.4233,-104.7091,'80631');
    add_city('Centennial','Colorado',39.5807,-104.8772,'80112');
    add_city('Boulder','Colorado',40.0150,-105.2705,'80302');
    add_city('Longmont','Colorado',40.1672,-105.1019,'80501');
    add_city('Loveland','Colorado',40.3978,-105.0750,'80537');
    add_city('Grand Junction','Colorado',39.0639,-108.5506,'81501');
    add_city('Castle Rock','Colorado',39.3722,-104.8561,'80104');
    add_city('Broomfield','Colorado',39.9205,-105.0867,'80020');
    add_city('Commerce City','Colorado',39.8083,-104.9339,'80022');
    add_city('Parker','Colorado',39.5186,-104.7614,'80138');
    add_city('Littleton','Colorado',39.6133,-105.0166,'80120');
    add_city('Brighton','Colorado',39.9853,-104.8205,'80601');
    add_city('Northglenn','Colorado',39.8962,-104.9811,'80233');
    add_city('Englewood','Colorado',39.6478,-104.9878,'80110');
    add_city('Wheat Ridge','Colorado',39.7661,-105.0772,'80033');
    add_city('Lafayette','Colorado',39.9936,-105.0897,'80026');
    add_city('Erie','Colorado',40.0503,-105.0500,'80516');
    add_city('Montrose','Colorado',38.4783,-107.8762,'81401');
    add_city('Durango','Colorado',37.2753,-107.8801,'81301');
    add_city('Glenwood Springs','Colorado',39.5505,-107.3248,'81601');
    add_city('Steamboat Springs','Colorado',40.4850,-106.8317,'80487');
    add_city('Alamosa','Colorado',37.4694,-105.8700,'81101');
    add_city('Sterling','Colorado',40.6255,-103.2077,'80751');
    add_city('Fort Morgan','Colorado',40.2503,-103.7999,'80701');
    add_city('Canon City','Colorado',38.4494,-105.2253,'81212');
    add_city('Trinidad','Colorado',37.1695,-104.5005,'81082');
    add_city('Cortez','Colorado',37.3489,-108.5859,'81321');

    FOR i IN 1..2000 LOOP
        v_c := v_cities(MOD(i, v_cities.COUNT) + 1);

        v_email := LOWER(v_fnames(MOD(i, v_fnames.COUNT) + 1)) || '.' ||
                   LOWER(v_lnames(MOD(FLOOR(i/2), v_lnames.COUNT) + 1)) ||
                   i || '@synthetic-resident.example';

        v_ltv := CASE v_tiers(MOD(i, v_tiers.COUNT) + 1)
            WHEN 'vip'       THEN ROUND(DBMS_RANDOM.VALUE(5000, 50000), 2)
            WHEN 'preferred' THEN ROUND(DBMS_RANDOM.VALUE(1000, 8000), 2)
            WHEN 'standard'  THEN ROUND(DBMS_RANDOM.VALUE(100, 2000), 2)
            ELSE ROUND(DBMS_RANDOM.VALUE(0, 200), 2)
        END;

        v_fname_idx := MOD(i, v_fnames.COUNT) + 1;
        v_lname_idx := MOD(FLOOR(i/2), v_lnames.COUNT) + 1;
        v_tier_idx  := MOD(i, v_tiers.COUNT) + 1;

        BEGIN
            INSERT INTO customers (
                email, first_name, last_name, city, state_province, postal_code,
                latitude, longitude, customer_tier, lifetime_value
            ) VALUES (
                v_email,
                v_fnames(v_fname_idx),
                v_lnames(v_lname_idx),
                v_c.city,
                v_c.state,
                v_c.zip,
                v_c.lat + DBMS_RANDOM.VALUE(-0.05, 0.05),
                v_c.lon + DBMS_RANDOM.VALUE(-0.05, 0.05),
                v_tiers(v_tier_idx),
                v_ltv
            );
            v_count := v_count + 1;
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Synthetic residents loaded: ' || v_count);
END;
/
