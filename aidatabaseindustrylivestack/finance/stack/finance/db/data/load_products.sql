/*
 * load_products.sql
 * Financial products across institution brands and regulated categories
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading financial products...

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
    -- Financial services catalog. Existing table and column names stay unchanged
    -- for route/import compatibility; visible values now represent financial products and institutions.
    add_prod('meridiantrust','Premium Checking Bundle','Retail Banking','Checking',12.5,4.1,1,'checking,deposit,consumer,fee-waiver');
    add_prod('meridiantrust','High-Yield Savings Account','Retail Banking','Savings',0,0,1,'savings,apy,deposit,liquidity');
    add_prod('meridiantrust','Rewards Credit Card','Cards and Payments','Credit Card',95,31,1,'card,rewards,credit,line');
    add_prod('meridiantrust','Small Business Term Loan','Commercial Lending','Term Loan',1500,840,1,'loan,small-business,credit-risk');
    add_prod('meridiantrust','Home Equity Line of Credit','Consumer Lending','HELOC',650,280,1,'heloc,secured-lending,home-equity');
    add_prod('horizoncapital','Robo Advisory Portfolio','Wealth Management','Digital Advice',35,11,1,'portfolio,robo-advice,asset-allocation');
    add_prod('horizoncapital','Managed ETF Portfolio','Wealth Management','ETF Portfolio',125,42,1,'etf,managed-portfolio,wealth');
    add_prod('horizoncapital','Municipal Bond Ladder','Investments','Fixed Income',250,95,1,'municipal-bonds,fixed-income,tax-aware');
    add_prod('horizoncapital','Treasury Sweep Account','Treasury Services','Liquidity',80,23,1,'treasury,sweep,cash-management');
    add_prod('horizoncapital','Corporate Card Program','Cards and Payments','Commercial Card',300,115,1,'commercial-card,expense,controls');
    add_prod('clearwatercu','Merchant Acquiring Package','Payments','Merchant Services',220,86,1,'merchant,acquiring,payments,pos');
    add_prod('clearwatercu','ACH Origination Service','Payments','ACH',45,12,1,'ach,originations,payments');
    add_prod('clearwatercu','Wire Transfer Service','Payments','Wire',30,8,1,'wire,treasury,payments');
    add_prod('clearwatercu','Fraud Monitoring Add-On','Risk Services','Fraud',180,64,1,'fraud,monitoring,alerts');
    add_prod('clearwatercu','AML Screening Package','Compliance Services','AML',420,170,1,'aml,kyc,sanctions,compliance');
    add_prod('northbridgeinvest','KYC Refresh Workflow','Compliance Services','KYC',240,93,1,'kyc,onboarding,identity');
    add_prod('northbridgeinvest','Mortgage Pre-Approval','Mortgage Lending','Residential Mortgage',995,410,1,'mortgage,preapproval,consumer');
    add_prod('northbridgeinvest','Adjustable Rate Mortgage','Mortgage Lending','ARM',2150,1320,1,'mortgage,arm,rate-risk');
    add_prod('northbridgeinvest','Auto Loan Digital Offer','Consumer Lending','Auto Loan',475,190,1,'auto-loan,consumer-credit');
    add_prod('northbridgeinvest','Personal Loan Express','Consumer Lending','Unsecured Loan',350,145,1,'personal-loan,unsecured');
    add_prod('granitewealth','Student Refinance Loan','Consumer Lending','Education Loan',525,215,1,'student-loan,refinance');
    add_prod('granitewealth','Commercial Real Estate Loan','Commercial Lending','CRE',3200,1850,1,'commercial-real-estate,loan');
    add_prod('granitewealth','Equipment Finance Lease','Commercial Lending','Equipment Finance',1875,980,1,'equipment,leasing,commercial');
    add_prod('granitewealth','Invoice Financing Line','Commercial Lending','Receivables',725,260,1,'invoice-finance,working-capital');
    add_prod('granitewealth','Trade Finance Letter of Credit','Trade Finance','Letter of Credit',1350,640,1,'trade-finance,letter-of-credit');
    add_prod('harvestcommercial','FX Forward Contract','Capital Markets','Foreign Exchange',520,155,1,'fx,forward,hedging');
    add_prod('harvestcommercial','Rate Hedge Advisory','Capital Markets','Interest Rate Risk',950,380,1,'rates,hedging,advisory');
    add_prod('harvestcommercial','Treasury Management Portal','Treasury Services','Digital Treasury',500,160,1,'treasury,portal,cash-management');
    add_prod('harvestcommercial','Retirement Income Plan','Retirement','Income Planning',675,210,1,'retirement,income,planning');
    add_prod('harvestcommercial','529 Education Savings Plan','Investments','Education Savings',75,20,1,'529,education,savings');
    add_prod('voltpay','Life Insurance Policy Review','Insurance','Life Insurance',450,165,1,'insurance,life,review');
    add_prod('voltpay','Annuity Suitability Review','Insurance','Annuity',620,240,1,'annuity,suitability,compliance');
    add_prod('voltpay','Cyber Risk Insurance Quote','Insurance','Cyber',810,340,1,'insurance,cyber,risk');
    add_prod('voltpay','Portfolio Tax-Loss Harvesting','Wealth Management','Tax Optimization',210,70,1,'tax-loss-harvesting,portfolio');
    add_prod('voltpay','ESG Impact Portfolio','Investments','ESG',155,58,1,'esg,portfolio,impact');
    add_prod('secureledger','Private Credit Fund Access','Alternative Investments','Private Credit',2500,1100,1,'private-credit,alternatives');
    add_prod('secureledger','Digital Wallet Account','Payments','Wallet',0,0,1,'wallet,digital-payments,consumer');
    add_prod('secureledger','Real-Time Payments Service','Payments','RTP',120,38,1,'rtp,instant-payments,treasury');
    add_prod('secureledger','Open Banking API Access','Data Services','API',600,180,1,'open-banking,api,data');
    add_prod('secureledger','Credit Score Monitoring','Consumer Banking','Credit Monitoring',19,5,1,'credit-score,monitoring,consumer');
    add_prod('civicnational','Portfolio Margin Account','Brokerage','Margin',1100,420,1,'brokerage,margin,risk');
    add_prod('civicnational','Options Trading Enablement','Brokerage','Options',250,85,1,'options,trading,suitability');
    add_prod('civicnational','Trust Administration Package','Private Banking','Trust',1800,760,1,'trust,estate,private-banking');
    add_prod('civicnational','Family Office Reporting','Private Banking','Reporting',2400,900,1,'family-office,reporting,wealth');
    add_prod('civicnational','Liquidity Stress Test','Risk Analytics','Liquidity Risk',700,230,1,'liquidity,stress-test,risk');
    add_prod('greenlineasset','CECL Reserve Scenario','Risk Analytics','Credit Risk',850,320,1,'cecl,reserve,credit-risk');
    add_prod('greenlineasset','Basel Capital Dashboard','Risk Analytics','Capital',1200,460,1,'basel,capital,risk');
    add_prod('greenlineasset','Regulatory Filing Review','Compliance Services','Regulatory Reporting',980,390,1,'regulatory-reporting,filing,compliance');
    add_prod('greenlineasset','Sanctions Alert Review','Compliance Services','Sanctions',300,95,1,'sanctions,screening,alert');
    add_prod('greenlineasset','Branch Appointment Package','Branch Services','Client Appointment',40,10,1,'branch,appointment,client-service');
    add_prod('primecard','Priority Service Desk','Client Service','Premium Support',120,35,1,'service,priority,client');
    add_prod('primecard','Dispute Resolution Case','Client Service','Disputes',90,30,1,'dispute,card,client-service');
    add_prod('primecard','Chargeback Protection Plan','Cards and Payments','Chargebacks',180,68,1,'chargeback,card,protection');
    add_prod('primecard','Loan Modification Review','Loan Servicing','Modification',550,210,1,'loan-servicing,modification');
    add_prod('primecard','Delinquency Outreach Program','Loan Servicing','Collections',275,110,1,'delinquency,collections,outreach');
    add_prod('catalystinsurance','Client Profitability Analysis','Analytics','Client Analytics',450,160,1,'client-analytics,profitability');
    add_prod('catalystinsurance','Client Suitability Control Model','Analytics','Risk Decisioning',650,250,1,'suitability,controls,ml,risk-decisioning');
    add_prod('catalystinsurance','Deposit Attrition Alert','Analytics','Retention',320,125,1,'attrition,deposits,retention');
    add_prod('catalystinsurance','Card Spend Forecast','Analytics','Forecasting',380,140,1,'card-spend,forecast,analytics');
    add_prod('catalystinsurance','Investment Policy Statement','Advisory','Planning',500,175,1,'investment-policy,advisory');
    add_prod('purepacportfolio','Risk Tolerance Assessment','Advisory','Suitability',150,45,1,'risk-tolerance,suitability');
    add_prod('siliconwealth','Advisor Book Review','Advisory','Practice Analytics',780,290,1,'advisor,book,analytics');
    add_prod('carbonactivefinance','Commercial Cash Forecast','Treasury Services','Forecasting',340,105,1,'cash-forecast,treasury');
    add_prod('fraudguardops','Liquidity Investment Sweep','Treasury Services','Investment Sweep',210,66,1,'liquidity,sweep,investment');
    add_prod('metatrustcustody','Escrow Account Service','Specialty Finance','Escrow',310,100,1,'escrow,account,service');
    add_prod('coastalperimeter','Custody Reporting Feed','Custody','Reporting',430,150,1,'custody,reporting,data');
    add_prod('civicsureinsurance','Securities Lending Program','Custody','Securities Lending',1650,700,1,'securities-lending,custody');
    add_prod('ipadirectfinance','Carbon Credit Custody','Carbon Markets','Custody',900,360,1,'carbon-credit,custody,esg');
    add_prod('apexonecapital','Green Bond Advisory','Capital Markets','Green Bonds',1450,620,1,'green-bond,advisory,capital-markets');
    add_prod('propelpension','Municipal Issuer Portal','Public Finance','Issuer Services',1150,480,1,'municipal,issuer,public-finance');
    add_prod('continuityrisk','Pension Liability Review','Retirement','Pension',1700,690,1,'pension,liability,retirement');
    add_prod('pharmapay','HSA Investment Account','Retail Banking','HSA',45,12,1,'hsa,investment,health-savings');
    add_prod('cleanrate','Secure Document Vault','Digital Banking','Document Vault',25,8,1,'document-vault,digital-banking');
    add_prod('bridgelinecapital','Mobile Deposit Service','Digital Banking','Mobile Deposit',0,0,1,'mobile-deposit,digital');
    add_prod('finepointdirect','Relationship Pricing Bundle','Retail Banking','Relationship Pricing',15,3,1,'relationship-pricing,deposit,loan');
    add_prod('portsidetrade','Institutional Cash Fund','Investments','Money Market',100,35,1,'cash-fund,money-market,institutional');
    add_prod('altyieldcredit','Alternative Data Feed','Data Services','Market Data',720,290,1,'market-data,alternative-data,feed');
    add_prod('ledgergradeconnect','Loan Portfolio Review','Risk Analytics','Portfolio Credit',1300,520,1,'loan-portfolio,credit-review');
    add_prod('specfinanceexchange','Financial Wellness Program','Client Service','Wellness',60,18,1,'financial-wellness,client');

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
    DBMS_OUTPUT.PUT_LINE('Financial products loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE INVENTORY (each financial product available at 5-15 random sites)
-- ============================================================
PROMPT Generating inventory...

DECLARE
    v_count       NUMBER := 0;
    v_num_centers NUMBER;
BEGIN
    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(5, 16));
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
