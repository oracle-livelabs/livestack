/*
 * enrich_social_signal_sources.sql
 * Rewrites generated vendor handles into believable retail demand-signal sources.
 *
 * load_gold_seed.sql creates placeholder sources such as @vendor_21_21 and
 * "Vendor 21". This repeat-safe pass updates only those generated sources,
 * preserving follower counts, platform assignments, city, region, and VPD
 * behavior.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Enriching PeakGear retail signal sources...

DECLARE
    v_updated NUMBER := 0;

    PROCEDURE apply_source(
        p_old_handle   IN VARCHAR2,
        p_new_handle   IN VARCHAR2,
        p_display_name IN VARCHAR2,
        p_niche        IN VARCHAR2
    ) IS
    BEGIN
        UPDATE influencers
           SET handle = p_new_handle,
               display_name = p_display_name,
               niche = p_niche
         WHERE handle IN (p_old_handle, p_new_handle)
           AND (
                handle != p_new_handle
             OR display_name != p_display_name
             OR niche != p_niche
           );

        v_updated := v_updated + SQL%ROWCOUNT;
    END;
BEGIN
    apply_source('@vendor_1_01',  '@gearhub_partnerfeed',     'GearHub Partner Feed',     'Partner replenishment feed');
    apply_source('@vendor_2_02',  '@seattle_storepulse',      'Seattle Store Pulse',      'Store activity signal');
    apply_source('@vendor_3_03',  '@trailtalk_daily',         'TrailTalk Daily',          'Social trend source');
    apply_source('@vendor_4_04',  '@productpage_pulse',       'Product Page Pulse',       'Product-page behavior');
    apply_source('@vendor_5_05',  '@commerce_signal',         'Commerce Signal Desk',     'Commerce activity');
    apply_source('@vendor_6_06',  '@summit_supplydesk',       'Summit Supply Desk',       'Partner replenishment feed');
    apply_source('@vendor_7_07',  '@pickup_lane_northwest',   'Pickup Lane Northwest',    'Store pickup activity');
    apply_source('@vendor_8_08',  '@outdoorgear_review',      'OutdoorGear Review',       'Social trend source');
    apply_source('@vendor_9_09',  '@shopper_clickstream',     'Shopper Clickstream',      'Product-page behavior');
    apply_source('@vendor_10_10', '@dallas_cartwatch',        'Dallas CartWatch',         'Commerce activity');
    apply_source('@vendor_11_11', '@trailforge_partnerwire',  'TrailForge Partner Wire',  'Partner replenishment feed');
    apply_source('@vendor_12_12', '@fitdevice_storewatch',    'Fit Device StoreWatch',    'Store activity signal');
    apply_source('@vendor_13_13', '@runfit_creators',         'RunFit Creators',          'Social trend source');
    apply_source('@vendor_14_14', '@gearsearch_trends',       'Gear Search Trends',       'Product-page behavior');
    apply_source('@vendor_15_15', '@marketbasket_alerts',     'Market Basket Alerts',     'Commerce activity');
    apply_source('@vendor_16_16', '@northpeak_vendorpulse',   'NorthPeak Vendor Pulse',   'Partner replenishment feed');
    apply_source('@vendor_17_17', '@runclub_storeboard',      'Run Club Storeboard',      'Store activity signal');
    apply_source('@vendor_18_18', '@peakstyle_watch',         'PeakStyle Watch',          'Social trend source');
    apply_source('@vendor_19_19', '@category_viewwatch',      'Category ViewWatch',       'Product-page behavior');
    apply_source('@vendor_20_20', '@price_match_watch',       'Price Match Watch',        'Commerce activity');
    apply_source('@vendor_21_21', '@outdoorline_update',      'OutdoorLine Update',       'Partner replenishment feed');
    apply_source('@vendor_22_22', '@fieldops_signal',         'Field Ops Signal',         'Store activity signal');
    apply_source('@vendor_23_23', '@geargram_live',           'GearGram Live',            'Social trend source');
    apply_source('@vendor_24_24', '@cartintent_live',         'Cart Intent Live',         'Product-page behavior');
    apply_source('@vendor_25_25', '@checkout_demand',         'Checkout Demand Desk',     'Commerce activity');
    apply_source('@vendor_26_26', '@apex_marketwire',         'Apex MarketWire',          'Partner replenishment feed');
    apply_source('@vendor_27_27', '@retailfloor_watch',       'Retail Floor Watch',       'Store activity signal');
    apply_source('@vendor_28_28', '@alpinefeed_social',       'AlpineFeed Social',        'Social trend source');
    apply_source('@vendor_29_29', '@browsepath_signal',       'BrowsePath Signal',        'Product-page behavior');
    apply_source('@vendor_30_30', '@replenish_now',           'Replenish Now',            'Commerce activity');

    COMMIT;

    DBMS_OUTPUT.PUT_LINE('Generated signal source rows updated: ' || v_updated);
END;
/
