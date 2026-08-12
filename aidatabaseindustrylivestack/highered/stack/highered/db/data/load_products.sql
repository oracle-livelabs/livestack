/*
 * load_products.sql
 * Higher Education services, programs, capacity slots, and learning resources
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading higher education student services and capacity items...

DECLARE
    TYPE t_prod IS RECORD (
        bslug VARCHAR2(100),
        pname VARCHAR2(300),
        cat   VARCHAR2(100),
        subcat VARCHAR2(100),
        price NUMBER(10,2),
        cost  NUMBER(10,2),
        wt    NUMBER(8,3),
        tags  VARCHAR2(1000)
    );
    TYPE t_prod_arr IS TABLE OF t_prod;
    v_prods t_prod_arr := t_prod_arr();
    v_brand_id NUMBER;
    v_sku VARCHAR2(50);
    v_idx NUMBER := 0;

    PROCEDURE add_prod(p_slug VARCHAR2, p_name VARCHAR2, p_cat VARCHAR2, p_sub VARCHAR2,
                       p_price NUMBER, p_cost NUMBER, p_wt NUMBER, p_tags VARCHAR2) IS
        v_rec t_prod;
    BEGIN
        v_rec.bslug := p_slug; v_rec.pname := p_name; v_rec.cat := p_cat;
        v_rec.subcat := p_sub; v_rec.price := p_price; v_rec.cost := p_cost;
        v_rec.wt := p_wt; v_rec.tags := p_tags;
        v_prods.EXTEND; v_prods(v_prods.COUNT) := v_rec;
    END;
BEGIN
    -- Higher education programs, service lines, capacity slots, and learning resources
    add_prod('northstar','AI Tutoring Session','Academic Support','Tutoring',125,48,0.001,'ai-tutoring,academic-support,course-help,virtual');
    add_prod('northstar','Degree Audit Review','Academic Advising','Progression',210,82,0.001,'degree-audit,advisor,graduation-pathway,completion');
    add_prod('northstar','Early Alert Success Plan','Student Success','Retention',95,35,0.001,'early-alert,retention,case-management,advisor');
    add_prod('riverbend','Registration Waitlist Priority','Enrollment','Registration',160,65,0.001,'registration,waitlist,seat-demand,schedule');
    add_prod('riverbend','Enrollment Deposit Waiver','Enrollment','Admissions',340,125,0.001,'enrollment,deposit,admissions,yield');
    add_prod('riverbend','Orientation Advising Slot','First-Year Experience','Orientation',275,98,0.05,'orientation,advising,first-year,onboarding');
    add_prod('summit','Career Coaching Appointment','Career Readiness','Coaching',420,175,0.001,'career,coaching,resume,job-readiness');
    add_prod('summit','Internship Placement Support','Career Readiness','Internships',680,260,1.2,'internship,placement,employer,career');
    add_prod('summit','Career Fair Prep Workshop','Career Readiness','Events',520,210,0.001,'career-fair,interview,workshop,networking');
    add_prod('clearpath','Mental Health Counseling Intake','Student Wellness','Counseling',180,70,0.001,'mental-health,counseling,intake,wellness');
    add_prod('clearpath','Crisis Follow-Up Call','Student Wellness','Crisis',140,58,0.001,'crisis,follow-up,safety-plan,student-care');
    add_prod('clearpath','Accessibility Accommodation Review','Student Wellness','Accessibility',260,105,0.001,'accessibility,accommodation,disability-services');
    add_prod('pioneer','STEM Lab Tutoring Block','Learning Support','STEM',220,90,0.001,'stem,tutoring,lab,course-support');
    add_prod('pioneer','Writing Center Consultation','Learning Support','Writing',780,310,1.4,'writing,consultation,composition,feedback');
    add_prod('pioneer','Library Research Consultation','Learning Support','Research',195,74,0.001,'library,research,citation,academic-skills');
    add_prod('coastal','Housing Placement Support','Student Services','Housing',240,96,0.001,'housing,residence-life,student-services');
    add_prod('coastal','Meal Plan Emergency Grant','Student Services','Basic Needs',145,54,0.9,'meal-plan,basic-needs,emergency-grant');
    add_prod('coastal','Campus Shuttle Pass','Student Services','Transportation',310,120,0.4,'transportation,shuttle,commuter,access');
    add_prod('lakeside','Financial Aid Appeal Review','Financial Aid','Appeals',89,31,0.35,'financial-aid,appeal,aid-package');
    add_prod('lakeside','Scholarship Matching Review','Financial Aid','Scholarships',115,42,0.5,'scholarship,matching,affordability');
    add_prod('lakeside','Student Emergency Fund','Financial Aid','Emergency Aid',185,70,0.6,'emergency-aid,retention,financial-support');
    add_prod('horizon','First-Gen Mentoring Cohort','First-Year Experience','Mentoring',170,68,0.001,'first-gen,mentoring,belonging,cohort');
    add_prod('horizon','Online Course Readiness Bootcamp','First-Year Experience','Online Readiness',145,55,0.001,'online-readiness,lms,study-skills');
    add_prod('liberty','Transfer Credit Evaluation','Transfer Success','Credit Mobility',190,78,0.001,'transfer-credit,evaluation,degree-progress');
    add_prod('liberty','Reverse Transfer Graduation Check','Transfer Success','Completion',130,50,0.001,'reverse-transfer,graduation,completion');
    add_prod('innovation','Online Proctoring Support','Online Learning','Assessment',360,145,0.001,'online,proctoring,assessment,support');
    add_prod('innovation','Capstone Project Studio','Online Learning','Capstone',640,260,0.001,'capstone,project,faculty-feedback,portfolio');
    add_prod('desert','Workforce Credential Advising','Workforce Programs','Credentials',520,210,0.001,'credential,workforce,advisor,skills');
    add_prod('desert','Employer Interview Lab','Workforce Programs','Employer Engagement',155,62,0.001,'employer,interview,skills,job-placement');
    add_prod('blueridge','Graduate Admissions Review','Graduate Studies','Admissions',210,86,0.001,'graduate-admissions,application,review');
    add_prod('blueridge','Course Materials Voucher','Graduate Studies','Affordability',135,53,0.001,'course-materials,voucher,affordability');

    FOR i IN 1..v_prods.COUNT LOOP
        BEGIN
            SELECT brand_id INTO v_brand_id
            FROM brands
            WHERE brand_slug = v_prods(i).bslug;

            v_idx := v_idx + 1;
            v_sku := UPPER(SUBSTR(v_prods(i).bslug, 1, 3)) || '-' ||
                     LPAD(v_idx, 5, '0');

            INSERT INTO products (brand_id, sku, product_name, category, subcategory,
                                  unit_price, unit_cost, weight_kg, tags, launch_date)
            VALUES (v_brand_id, v_sku, v_prods(i).pname, v_prods(i).cat, v_prods(i).subcat,
                    v_prods(i).price, v_prods(i).cost, v_prods(i).wt, v_prods(i).tags,
                    SYSDATE - DBMS_RANDOM.VALUE(30, 730));
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;  -- skip dupes
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Higher education student service records loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE CAPACITY / SUPPLY LEVELS (each service stocked at 5-12 campus service sites)
-- ============================================================
PROMPT Generating student service capacity and learning resource levels...

DECLARE
    v_count       NUMBER := 0;
    v_num_centers NUMBER;
BEGIN
    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(5, 13));
        FOR c IN (
            SELECT center_id FROM (
                SELECT center_id FROM fulfillment_centers
                ORDER BY DBMS_RANDOM.VALUE
            ) WHERE ROWNUM <= v_num_centers
        ) LOOP
            BEGIN
                INSERT INTO inventory (product_id, center_id, quantity_on_hand,
                                       quantity_reserved, reorder_point, reorder_qty,
                                       last_restock_date)
                VALUES (p.product_id, c.center_id,
                        FLOOR(DBMS_RANDOM.VALUE(10, 500)),
                        FLOOR(DBMS_RANDOM.VALUE(0, 30)),
                        FLOOR(DBMS_RANDOM.VALUE(20, 100)),
                        FLOOR(DBMS_RANDOM.VALUE(100, 500)),
                        SYSDATE - DBMS_RANDOM.VALUE(1, 30));
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;
        END LOOP;
    END LOOP;
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Capacity records loaded: ' || v_count);
END;
/
