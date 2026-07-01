/*
 * 03_graph.sql
 * Relational production-signal network support tables.
 *
 * The deployed SQL Property Graph is MANUFACTURING_PRODUCTION_NETWORK in
 * 10_manufacturing_production_graph.sql. These relationship tables remain
 * relational inputs used by signal analytics and import/restore workflows.
 */

-- ============================================================
-- INFLUENCER CONNECTIONS (edges for the graph)
-- Represents: follows, collaborates_with, mentioned_by, reshared_from
-- ============================================================
CREATE TABLE influencer_connections (
    connection_id     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_influencer   NUMBER NOT NULL REFERENCES influencers(influencer_id),
    to_influencer     NUMBER NOT NULL REFERENCES influencers(influencer_id),
    connection_type   VARCHAR2(30) NOT NULL
                      CHECK (connection_type IN ('follows','collaborates','mentioned',
                             'reshared','tagged','duet','inspired_by')),
    strength          NUMBER(4,3) DEFAULT 0.5,  -- 0-1 edge weight
    interaction_count NUMBER(8) DEFAULT 1,
    first_seen        TIMESTAMP DEFAULT SYSTIMESTAMP,
    last_interaction  TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_connection UNIQUE (from_influencer, to_influencer, connection_type)
);

CREATE INDEX idx_conn_from ON influencer_connections(from_influencer);
CREATE INDEX idx_conn_to   ON influencer_connections(to_influencer);

-- ============================================================
-- BRAND ↔ INFLUENCER RELATIONSHIPS
-- ============================================================
CREATE TABLE brand_influencer_links (
    link_id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_id          NUMBER NOT NULL REFERENCES brands(brand_id),
    influencer_id     NUMBER NOT NULL REFERENCES influencers(influencer_id),
    relationship_type VARCHAR2(30) DEFAULT 'organic'
                      CHECK (relationship_type IN ('organic','sponsored','ambassador',
                             'affiliate','competitor_mention')),
    post_count        NUMBER(8) DEFAULT 0,
    avg_engagement    NUMBER(8,4) DEFAULT 0,
    revenue_attributed NUMBER(12,2) DEFAULT 0,
    first_mention     TIMESTAMP,
    last_mention      TIMESTAMP,
    CONSTRAINT uq_brand_inf UNIQUE (brand_id, influencer_id)
);

COMMIT;

SELECT 'Production-signal relationship tables created successfully' AS status FROM dual;
