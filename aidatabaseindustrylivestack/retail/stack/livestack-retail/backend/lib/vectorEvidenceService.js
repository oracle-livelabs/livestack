const db = require('../config/database');
const {
  capturePreviousCursor,
  classifyVectorPlan,
  readVectorIndexBindings,
} = require('./featurePlanEvidenceService');

const VECTOR_MODEL_NAME = 'ALL_MINILM_L12_V2';
const VECTOR_MODEL_PROVENANCE = 'all_MiniLM_L12_v2';
const VECTOR_DIMENSIONS = 384;
const VECTOR_ELEMENT_TYPE = 'FLOAT32';
const EXPECTED_VECTOR_COLUMNS = 2;
const EXPECTED_VECTOR_INDEXES = 2;
const SCOPED_EMPTY_ACCESS = new Set(['RESTRICTED', 'NONE']);

// The schema-owned digest helper performs VECTOR_SERIALIZE(... RETURNING CLOB)
// and folds every SQL-safe chunk; request-time evidence reads only that digest.

class VectorEvidenceError extends Error {
  constructor(message, details = null, code = 'VECTOR_CAPABILITY_UNAVAILABLE') {
    super(message);
    this.name = 'VectorEvidenceError';
    this.code = code;
    this.statusCode = 503;
    this.feature = 'AI_VECTOR_SEARCH';
    this.details = details;
  }
}

function integer(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEvidence(evidence = {}) {
  return {
    accessScope: String(evidence.accessScope || '').trim().toUpperCase(),
    activeGenerationId: String(evidence.activeGenerationId || '').trim(),
    datasetFingerprint: String(evidence.datasetFingerprint || '')
      .trim()
      .toLowerCase(),
    sourceProducts: integer(evidence.sourceProducts),
    sourcePosts: integer(evidence.sourcePosts),
    momentumPosts: integer(evidence.momentumPosts),
    productVectors: integer(evidence.productVectors),
    postVectors: integer(evidence.postVectors),
    semanticMatches: integer(evidence.semanticMatches),
    expectedMatches: integer(evidence.expectedMatches),
    declaredVectorColumns: integer(evidence.declaredVectorColumns),
    validVectorIndexes: integer(evidence.validVectorIndexes),
    modelCount: integer(evidence.modelCount),
    invalidProductVectors: integer(evidence.invalidProductVectors),
    invalidPostVectors: integer(evidence.invalidPostVectors),
    productSourceTextMismatches: integer(
      evidence.productSourceTextMismatches
    ),
    postSourceTextMismatches: integer(evidence.postSourceTextMismatches),
    productEmbeddingMismatches: integer(
      evidence.productEmbeddingMismatches
    ),
    postEmbeddingMismatches: integer(evidence.postEmbeddingMismatches),
    canonicalSemanticMismatches: integer(
      evidence.canonicalSemanticMismatches
    ),
    generationEvidenceRows: integer(evidence.generationEvidenceRows),
    generationEvidenceMismatches: integer(
      evidence.generationEvidenceMismatches
    ),
    incompleteMatchGroups: integer(evidence.incompleteMatchGroups),
    invalidMatches: integer(evidence.invalidMatches),
    deterministicMatchMismatches: integer(
      evidence.deterministicMatchMismatches
    ),
  };
}

function assertVectorEvidence(evidence) {
  const current = normalizeEvidence(evidence);
  const catalogReady = current.modelCount === 1
    && current.declaredVectorColumns === EXPECTED_VECTOR_COLUMNS
    && current.validVectorIndexes === EXPECTED_VECTOR_INDEXES;
  const allVisibleRowsEmpty = [
    current.sourceProducts,
    current.sourcePosts,
    current.momentumPosts,
    current.productVectors,
    current.postVectors,
    current.semanticMatches,
    current.expectedMatches,
  ].every((value) => value === 0);
  const invalidEvidence = current.invalidProductVectors
    + current.invalidPostVectors
    + current.productSourceTextMismatches
    + current.postSourceTextMismatches
    + current.productEmbeddingMismatches
    + current.postEmbeddingMismatches
    + current.canonicalSemanticMismatches
    + current.generationEvidenceMismatches
    + current.incompleteMatchGroups
    + current.invalidMatches
    + current.deterministicMatchMismatches;
  const generationReady = Boolean(current.activeGenerationId)
    && /^[a-f0-9]{64}$/i.test(current.datasetFingerprint);

  if (catalogReady
      && SCOPED_EMPTY_ACCESS.has(current.accessScope)
      && allVisibleRowsEmpty
      && invalidEvidence === 0
      && generationReady) {
    return {
      ready: true,
      scopedEmpty: true,
      scopeStatus: 'SCOPED_NO_VISIBLE_VECTOR_DATA',
      evidence: current,
    };
  }

  const failures = [];
  if (!catalogReady) {
    failures.push('the ONNX embedding model, native columns, or Vector indexes are invalid');
  }
  if (!generationReady) {
    failures.push('a current dataset generation and fingerprint are required');
  }
  if (current.sourceProducts < 1 || current.sourcePosts < 1
      || current.momentumPosts < 1) {
    failures.push('visible product, post, and momentum source coverage is required');
  }
  if (current.productVectors !== current.sourceProducts) {
    failures.push('product vector coverage does not equal visible products');
  }
  if (current.postVectors !== current.sourcePosts) {
    failures.push('post vector coverage does not equal visible posts');
  }
  if (current.semanticMatches !== current.expectedMatches
      || current.incompleteMatchGroups !== 0
      || current.invalidMatches !== 0
      || current.deterministicMatchMismatches !== 0) {
    failures.push('semantic match coverage is incomplete or non-deterministic');
  }
  if (current.invalidProductVectors !== 0
      || current.invalidPostVectors !== 0) {
    failures.push('native vector descriptor or provenance evidence is invalid');
  }
  if (current.productSourceTextMismatches !== 0
      || current.postSourceTextMismatches !== 0) {
    failures.push('canonical product or post source text is stale');
  }
  if (current.productEmbeddingMismatches !== 0
      || current.postEmbeddingMismatches !== 0) {
    failures.push('stored vectors do not match the current ONNX model');
  }
  if (current.canonicalSemanticMismatches !== 0) {
    failures.push('semantic matches do not match validated canonical vectors');
  }
  if (!SCOPED_EMPTY_ACCESS.has(current.accessScope)
      && current.generationEvidenceRows
        !== current.sourceProducts + current.sourcePosts
          + current.semanticMatches) {
    failures.push('generation-bound full Vector validation evidence is incomplete');
  }
  if (current.generationEvidenceMismatches !== 0) {
    failures.push('current Vector bytes differ from generation-bound validation');
  }
  if (failures.length) {
    throw new VectorEvidenceError(
      `Oracle native Vector evidence is incomplete: ${failures.join('; ')}`,
      current
    );
  }

  return {
    ready: true,
    scopedEmpty: false,
    scopeStatus: 'VISIBLE_VECTOR_DATA',
    evidence: current,
  };
}

async function readVectorEvidence(execute, {
  generationId = null,
  datasetFingerprint = null,
  validateCurrentModel = false,
} = {}) {
  const countsResult = await execute(`
    SELECT
      SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE') AS access_scope,
      (SELECT COUNT(*) FROM products) AS source_products,
      (SELECT COUNT(*) FROM social_posts) AS source_posts,
      (SELECT COUNT(*) FROM social_posts
       WHERE momentum_flag IN ('viral', 'mega_viral')) AS momentum_posts,
      (SELECT COUNT(*) FROM product_embeddings) AS product_vectors,
      (SELECT COUNT(*) FROM post_embeddings) AS post_vectors,
      (SELECT COUNT(*) FROM semantic_matches) AS semantic_matches,
      COALESCE(
        :requestedGenerationId,
        (SELECT state.active_generation_id
         FROM app_dataset_state state
         WHERE state.state_id = 1)
      ) AS active_generation_id,
      COALESCE(
        :requestedDatasetFingerprint,
        (SELECT evidence.dataset_fingerprint
         FROM app_dataset_state state
         JOIN app_inmemory_generation_evidence evidence
           ON evidence.generation_id = state.active_generation_id
         WHERE state.state_id = 1)
      ) AS dataset_fingerprint
    FROM dual
  `, {
    requestedGenerationId: generationId,
    requestedDatasetFingerprint: datasetFingerprint,
  });
  const counts = countsResult.rows?.[0] || {};
  const expectedMatches = integer(counts.MOMENTUM_POSTS)
    * Math.min(integer(counts.SOURCE_PRODUCTS), 3);
  const vectorEvidenceBinds = {
    vectorGenerationId: counts.ACTIVE_GENERATION_ID,
    vectorDatasetFingerprint: counts.DATASET_FINGERPRINT,
  };

  const catalogResult = await execute(`
    SELECT
      (SELECT COUNT(*)
       FROM user_tab_columns
       WHERE data_type = 'VECTOR'
         AND REPLACE(UPPER(vector_info), ' ', '') =
             'VECTOR(384,FLOAT32,DENSE)'
         AND (
           (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
           OR
           (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
         )) AS declared_vector_columns,
      (SELECT COUNT(*)
       FROM user_indexes indexes
       JOIN user_ind_columns columns
         ON columns.index_name = indexes.index_name
       WHERE indexes.index_type = 'VECTOR'
         AND indexes.status = 'VALID'
         AND (
           (indexes.index_name = 'IDX_PRODUCT_VEC'
            AND columns.table_name = 'PRODUCT_EMBEDDINGS'
            AND columns.column_name = 'EMBEDDING'
            AND columns.column_position = 1)
           OR
           (indexes.index_name = 'IDX_POST_VEC'
            AND columns.table_name = 'POST_EMBEDDINGS'
            AND columns.column_name = 'EMBEDDING'
            AND columns.column_position = 1)
         )) AS valid_vector_indexes,
      (SELECT COUNT(*)
       FROM user_mining_models
       WHERE model_name = 'ALL_MINILM_L12_V2'
         AND mining_function = 'EMBEDDING'
         AND algorithm = 'ONNX') AS model_count
    FROM dual
  `);
  const catalog = catalogResult.rows?.[0] || {};

  const descriptorResult = await execute(`
    WITH canonical_products AS (
      SELECT product.product_id,
             TO_CLOB(product.product_name) || ' ' ||
             NVL(product.category, '') || ' ' ||
             product.description || ' ' ||
             brand.brand_name AS canonical_text
      FROM products product
      JOIN brands brand
        ON brand.brand_id = product.brand_id
    ),
    canonical_posts AS (
      SELECT post.post_id,
             TO_CLOB(
               DBMS_LOB.SUBSTR(post.post_text, 500, 1)
             ) AS canonical_text
      FROM social_posts post
    )
    SELECT
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       WHERE vector_row.embedding IS NULL
          OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
          OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32'
          OR vector_row.embedding_text IS NULL
          OR DBMS_LOB.GETLENGTH(vector_row.embedding_text) = 0
          OR vector_row.embedding_model IS NULL
          OR LOWER(vector_row.embedding_model) <> 'all_minilm_l12_v2'
          OR NOT EXISTS (
            SELECT 1 FROM products product
            WHERE product.product_id = vector_row.product_id
          )) AS invalid_product_vectors,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       WHERE vector_row.embedding IS NULL
          OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
          OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32'
          OR vector_row.embedding_text IS NULL
          OR DBMS_LOB.GETLENGTH(vector_row.embedding_text) = 0
          OR vector_row.embedding_model IS NULL
          OR LOWER(vector_row.embedding_model) <> 'all_minilm_l12_v2'
          OR NOT EXISTS (
            SELECT 1 FROM social_posts post
            WHERE post.post_id = vector_row.post_id
          )) AS invalid_post_vectors,
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       JOIN canonical_products source_row
         ON source_row.product_id = vector_row.product_id
       WHERE vector_row.embedding_text IS NULL
          OR DBMS_LOB.COMPARE(
               vector_row.embedding_text,
               source_row.canonical_text
             ) <> 0) AS product_source_text_mismatches,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       JOIN canonical_posts source_row
         ON source_row.post_id = vector_row.post_id
       WHERE vector_row.embedding_text IS NULL
          OR DBMS_LOB.COMPARE(
               vector_row.embedding_text,
               source_row.canonical_text
             ) <> 0) AS post_source_text_mismatches,
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       JOIN canonical_products source_row
         ON source_row.product_id = vector_row.product_id
       LEFT JOIN app_vector_generation_evidence evidence
         ON evidence.generation_id = :vectorGenerationId
        AND evidence.dataset_fingerprint = :vectorDatasetFingerprint
        AND evidence.entity_type = 'PRODUCT'
        AND evidence.entity_id = vector_row.product_id
       WHERE evidence.entity_id IS NULL
          OR evidence.model_name IS NULL
          OR evidence.model_name <> 'ALL_MINILM_L12_V2'
          OR evidence.source_hash IS NULL
          OR evidence.source_hash <> RAWTOHEX(
               STANDARD_HASH(
                 DBMS_LOB.SUBSTR(source_row.canonical_text, 32767, 1),
                 'SHA256'
               )
             )
          OR evidence.vector_hash IS NULL
          OR evidence.vector_hash <>
               retail_vector_serialization_sha256(vector_row.embedding)
        ) AS product_embedding_mismatches,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       JOIN canonical_posts source_row
         ON source_row.post_id = vector_row.post_id
       LEFT JOIN app_vector_generation_evidence evidence
         ON evidence.generation_id = :vectorGenerationId
        AND evidence.dataset_fingerprint = :vectorDatasetFingerprint
        AND evidence.entity_type = 'POST'
        AND evidence.entity_id = vector_row.post_id
       WHERE evidence.entity_id IS NULL
          OR evidence.model_name IS NULL
          OR evidence.model_name <> 'ALL_MINILM_L12_V2'
          OR evidence.source_hash IS NULL
          OR evidence.source_hash <> RAWTOHEX(
               STANDARD_HASH(
                 DBMS_LOB.SUBSTR(source_row.canonical_text, 500, 1),
                 'SHA256'
               )
             )
          OR evidence.vector_hash IS NULL
          OR evidence.vector_hash <>
               retail_vector_serialization_sha256(vector_row.embedding)
        ) AS post_embedding_mismatches,
      (SELECT COUNT(*)
       FROM semantic_matches match_row
       LEFT JOIN app_vector_generation_evidence evidence
         ON evidence.generation_id = :vectorGenerationId
        AND evidence.dataset_fingerprint = :vectorDatasetFingerprint
        AND evidence.entity_type = 'MATCH'
        AND evidence.entity_id = match_row.match_id
       WHERE evidence.entity_id IS NULL
          OR evidence.model_name IS NULL
          OR evidence.model_name <> 'ALL_MINILM_L12_V2'
          OR evidence.source_hash IS NULL
          OR evidence.source_hash <> RAWTOHEX(
               STANDARD_HASH(
                 TO_CHAR(match_row.post_id) || ':' ||
                 TO_CHAR(match_row.product_id) || ':' ||
                 TO_CHAR(match_row.match_rank) || ':' ||
                 TO_CHAR(
                   match_row.similarity_score,
                   'FM9999999990D00000',
                   'NLS_NUMERIC_CHARACTERS=''.,'''
                 ) || ':' ||
                 match_row.match_method,
                 'SHA256'
               )
             )
          OR evidence.vector_hash IS NULL
          OR evidence.vector_hash <> evidence.source_hash)
        AS semantic_evidence_mismatches,
      (SELECT COUNT(*)
       FROM app_vector_generation_evidence evidence
       WHERE evidence.generation_id = :vectorGenerationId
         AND evidence.dataset_fingerprint = :vectorDatasetFingerprint)
        AS generation_evidence_rows
    FROM dual
  `, vectorEvidenceBinds);
  const descriptors = descriptorResult.rows?.[0] || {};
  let currentModel = {
    PRODUCT_EMBEDDING_MISMATCHES: 0,
    POST_EMBEDDING_MISMATCHES: 0,
  };
  if (validateCurrentModel) {
    const currentModelResult = await execute(`
      WITH canonical_products AS (
        SELECT product.product_id,
               TO_CLOB(product.product_name) || ' ' ||
               NVL(product.category, '') || ' ' ||
               product.description || ' ' ||
               brand.brand_name AS canonical_text
        FROM products product
        JOIN brands brand
          ON brand.brand_id = product.brand_id
      ),
      canonical_posts AS (
        SELECT post.post_id,
               TO_CLOB(
                 DBMS_LOB.SUBSTR(post.post_text, 500, 1)
               ) AS canonical_text
        FROM social_posts post
      )
      SELECT
        (SELECT COUNT(*)
         FROM product_embeddings vector_row
         JOIN canonical_products source_row
           ON source_row.product_id = vector_row.product_id
         WHERE vector_row.embedding IS NOT NULL
           AND ABS(
                 VECTOR_DISTANCE(
                   vector_row.embedding,
                   VECTOR_EMBEDDING(
                     ALL_MINILM_L12_V2 USING
                     source_row.canonical_text AS DATA
                   ),
                   EUCLIDEAN
                 )
               ) > 0.000001) AS product_embedding_mismatches,
        (SELECT COUNT(*)
         FROM post_embeddings vector_row
         JOIN canonical_posts source_row
           ON source_row.post_id = vector_row.post_id
         WHERE vector_row.embedding IS NOT NULL
           AND ABS(
                 VECTOR_DISTANCE(
                   vector_row.embedding,
                   VECTOR_EMBEDDING(
                     ALL_MINILM_L12_V2 USING
                     source_row.canonical_text AS DATA
                   ),
                   EUCLIDEAN
                 )
               ) > 0.000001) AS post_embedding_mismatches
      FROM dual
    `);
    currentModel = currentModelResult.rows?.[0] || currentModel;
  }
  const productEmbeddingMismatches = Math.max(
    integer(descriptors.PRODUCT_EMBEDDING_MISMATCHES),
    integer(currentModel.PRODUCT_EMBEDDING_MISMATCHES)
  );
  const postEmbeddingMismatches = Math.max(
    integer(descriptors.POST_EMBEDDING_MISMATCHES),
    integer(currentModel.POST_EMBEDDING_MISMATCHES)
  );

  const matchResult = await execute(`
    WITH incomplete_groups AS (
      SELECT post.post_id
      FROM social_posts post
      LEFT JOIN semantic_matches match_row
        ON match_row.post_id = post.post_id
      WHERE post.momentum_flag IN ('viral', 'mega_viral')
      GROUP BY post.post_id
      HAVING COUNT(match_row.match_id) <> LEAST(
               (SELECT COUNT(*) FROM products),
               3
             )
          OR MIN(match_row.match_rank) <> 1
          OR MAX(match_row.match_rank) <> LEAST(
               (SELECT COUNT(*) FROM products),
               3
             )
          OR COUNT(DISTINCT match_row.match_rank) <> LEAST(
               (SELECT COUNT(*) FROM products),
               3
             )
          OR COUNT(DISTINCT match_row.product_id) <> LEAST(
               (SELECT COUNT(*) FROM products),
               3
             )
    )
    SELECT
      (SELECT COUNT(*) FROM incomplete_groups) AS incomplete_match_groups,
      (SELECT COUNT(*)
       FROM semantic_matches match_row
       JOIN social_posts post ON post.post_id = match_row.post_id
       WHERE post.momentum_flag NOT IN ('viral', 'mega_viral')
          OR match_row.similarity_score IS NULL
          OR match_row.similarity_score < -1
          OR match_row.similarity_score > 1
          OR match_row.match_rank IS NULL
          OR match_row.match_rank < 1
          OR match_row.match_rank > LEAST(
               (SELECT COUNT(*) FROM products),
               3
             )
          OR match_row.match_method IS NULL
          OR match_row.match_method <> 'vector') AS invalid_matches
    FROM dual
  `);
  const matches = matchResult.rows?.[0] || {};
  let canonicalSemanticMismatches = integer(
    descriptors.SEMANTIC_EVIDENCE_MISMATCHES
  );
  if (validateCurrentModel) {
    const semanticResult = await execute(`
      WITH ranked_matches AS (
        SELECT post_vector.post_id,
               product_vector.product_id,
               ROUND(
                 1 - VECTOR_DISTANCE(
                   post_vector.embedding,
                   product_vector.embedding,
                   COSINE
                 ),
                 5
               ) AS similarity_score,
               ROW_NUMBER() OVER (
                 PARTITION BY post_vector.post_id
                 ORDER BY VECTOR_DISTANCE(
                   post_vector.embedding,
                   product_vector.embedding,
                   COSINE
                 ),
                 product_vector.product_id
               ) AS match_rank
        FROM post_embeddings post_vector
        JOIN social_posts post
          ON post.post_id = post_vector.post_id
        CROSS JOIN product_embeddings product_vector
        WHERE post.momentum_flag IN ('viral', 'mega_viral')
      ),
      expected_matches AS (
        SELECT post_id, product_id, similarity_score, match_rank
        FROM ranked_matches
        WHERE match_rank <= 3
      )
      SELECT COUNT(*) AS canonical_semantic_mismatches
      FROM expected_matches expected
      FULL OUTER JOIN semantic_matches actual
        ON actual.post_id = expected.post_id
       AND actual.product_id = expected.product_id
       AND actual.match_rank = expected.match_rank
      WHERE expected.post_id IS NULL
         OR actual.post_id IS NULL
         OR actual.match_rank IS NULL
         OR actual.similarity_score IS NULL
         OR actual.match_method IS NULL
         OR actual.match_method <> 'vector'
         OR ABS(actual.similarity_score - expected.similarity_score) > 0.00001
    `);
    canonicalSemanticMismatches = Math.max(
      canonicalSemanticMismatches,
      integer(
        semanticResult.rows?.[0]?.CANONICAL_SEMANTIC_MISMATCHES
      )
    );
  }

  return normalizeEvidence({
    accessScope: counts.ACCESS_SCOPE,
    activeGenerationId: counts.ACTIVE_GENERATION_ID,
    datasetFingerprint: counts.DATASET_FINGERPRINT,
    sourceProducts: counts.SOURCE_PRODUCTS,
    sourcePosts: counts.SOURCE_POSTS,
    momentumPosts: counts.MOMENTUM_POSTS,
    productVectors: counts.PRODUCT_VECTORS,
    postVectors: counts.POST_VECTORS,
    semanticMatches: counts.SEMANTIC_MATCHES,
    expectedMatches,
    declaredVectorColumns: catalog.DECLARED_VECTOR_COLUMNS,
    validVectorIndexes: catalog.VALID_VECTOR_INDEXES,
    modelCount: catalog.MODEL_COUNT,
    invalidProductVectors: descriptors.INVALID_PRODUCT_VECTORS,
    invalidPostVectors: descriptors.INVALID_POST_VECTORS,
    productSourceTextMismatches:
      descriptors.PRODUCT_SOURCE_TEXT_MISMATCHES,
    postSourceTextMismatches: descriptors.POST_SOURCE_TEXT_MISMATCHES,
    productEmbeddingMismatches,
    postEmbeddingMismatches,
    generationEvidenceRows: descriptors.GENERATION_EVIDENCE_ROWS,
    generationEvidenceMismatches:
      integer(descriptors.PRODUCT_EMBEDDING_MISMATCHES)
      + integer(descriptors.POST_EMBEDDING_MISMATCHES)
      + integer(descriptors.SEMANTIC_EVIDENCE_MISMATCHES),
    incompleteMatchGroups: matches.INCOMPLETE_MATCH_GROUPS,
    invalidMatches: matches.INVALID_MATCHES,
    deterministicMatchMismatches: canonicalSemanticMismatches,
    canonicalSemanticMismatches,
  });
}

function normalizeGlobalAnchor(anchor = {}) {
  const source = anchor || {};
  return {
    status: String(source.status || '').trim().toUpperCase(),
    activeGenerationId: String(
      source.activeGenerationId || source.generationId || ''
    ).trim(),
    readinessGenerationId: String(
      source.readinessGenerationId || ''
    ).trim(),
    planGenerationId: String(source.planGenerationId || '').trim(),
    datasetFingerprint: String(source.datasetFingerprint || '')
      .trim()
      .toLowerCase(),
    readinessFingerprint: String(source.readinessFingerprint || '')
      .trim()
      .toLowerCase(),
    planFingerprint: String(source.planFingerprint || '')
      .trim()
      .toLowerCase(),
    objectName: String(source.objectName || '').trim().toUpperCase(),
    indexName: String(source.indexName || '').trim().toUpperCase(),
    planOperation: String(source.planOperation || '').trim().toUpperCase(),
    planHashValue: source.planHashValue === null
      || source.planHashValue === undefined
      ? null
      : integer(source.planHashValue),
    sourceProducts: integer(source.sourceProducts),
    sourcePosts: integer(source.sourcePosts),
    momentumPosts: integer(source.momentumPosts),
    productVectors: integer(source.productVectors),
    postVectors: integer(source.postVectors),
    semanticMatches: integer(source.semanticMatches),
    expectedMatches: integer(source.expectedMatches),
    currentPlan: source.currentPlan || null,
  };
}

function assertGlobalVectorAnchor(anchor) {
  const current = normalizeGlobalAnchor(anchor);
  const generations = [
    current.activeGenerationId,
    current.readinessGenerationId,
    current.planGenerationId,
  ];
  const fingerprints = [
    current.datasetFingerprint,
    current.readinessFingerprint,
    current.planFingerprint,
  ];
  const generationReady = generations.every(Boolean)
    && new Set(generations).size === 1;
  const fingerprintReady = fingerprints.every(
    (fingerprint) => /^[a-f0-9]{64}$/i.test(fingerprint)
  ) && new Set(fingerprints).size === 1;
  const coverageReady = current.sourceProducts > 0
    && current.sourcePosts > 0
    && current.momentumPosts > 0
    && current.productVectors === current.sourceProducts
    && current.postVectors === current.sourcePosts
    && current.expectedMatches > 0
    && current.semanticMatches === current.expectedMatches;
  const planReady = current.objectName === 'PRODUCT_EMBEDDINGS'
    && current.indexName === 'IDX_PRODUCT_VEC'
    && current.planOperation.includes('VECTOR INDEX')
    && (current.planHashValue === null || current.planHashValue > 0);
  const currentPlanHasHash = Object.prototype.hasOwnProperty.call(
    current.currentPlan || {},
    'planHashValue'
  );
  const currentPlanReady = current.currentPlan
    && String(current.currentPlan.sqlId || '').trim()
    && current.currentPlan.childNumber !== null
    && current.currentPlan.childNumber !== undefined
    && String(current.currentPlan.childNumber).trim() !== ''
    && Number.isInteger(Number(current.currentPlan.childNumber))
    && (!currentPlanHasHash
      || (Number.isInteger(Number(current.currentPlan.planHashValue))
        && Number(current.currentPlan.planHashValue) > 0))
    && (current.planHashValue === null
      || !currentPlanHasHash
      || Number(current.currentPlan.planHashValue) === current.planHashValue)
    && String(current.currentPlan.objectName || '').toUpperCase()
      === 'PRODUCT_EMBEDDINGS'
    && String(current.currentPlan.indexName || '').toUpperCase()
      === 'IDX_PRODUCT_VEC'
    && String(current.currentPlan.operation || '').toUpperCase()
      .includes('VECTOR INDEX');

  if (current.status !== 'ACTIVE'
      || !generationReady
      || !fingerprintReady
      || !coverageReady
      || !planReady
      || !currentPlanReady) {
    throw new VectorEvidenceError(
      'The current-generation global Vector anchor is missing, stale, or incomplete.',
      current,
      'VECTOR_GLOBAL_ANCHOR_UNAVAILABLE'
    );
  }

  return {
    ready: true,
    ...current,
    generationId: current.activeGenerationId,
  };
}

async function readGlobalVectorAnchor() {
  return db.withUserConnection('admin_jess', async ({ connection, execute }) => {
    const evidence = await readVectorEvidence(execute);
    const assessment = assertVectorEvidence(evidence);
    if (assessment.scopedEmpty) {
      throw new VectorEvidenceError(
        'The system Vector anchor unexpectedly resolved to an empty scope.',
        evidence,
        'VECTOR_GLOBAL_ANCHOR_UNAVAILABLE'
      );
    }

    const representative = await execute(`
      SELECT product_id, distance_score
      FROM (
        SELECT /*+ GATHER_PLAN_STATISTICS
                   VECTOR_INDEX_TRANSFORM(embeddings IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
               /* RETAIL_VECTOR_GLOBAL_ANCHOR */
               embeddings.product_id,
               VECTOR_DISTANCE(
                 embeddings.embedding,
                 VECTOR_EMBEDDING(
                   ALL_MINILM_L12_V2 USING
                   'outdoor trail footwear and sporting goods' AS DATA
                 ),
                 COSINE
               ) AS distance_score
        FROM product_embeddings embeddings
        ORDER BY distance_score
        FETCH APPROXIMATE FIRST 5 ROWS ONLY
      )
      ORDER BY distance_score, product_id
    `);
    if (!representative.rows?.length) {
      throw new VectorEvidenceError(
        'The current-generation global Vector anchor returned no rows.',
        evidence,
        'VECTOR_GLOBAL_ANCHOR_UNAVAILABLE'
      );
    }
    const cursor = await capturePreviousCursor(connection, 'AI_VECTOR_SEARCH');
    const indexBindings = await readVectorIndexBindings(execute);
    const currentPlan = classifyVectorPlan({
      ...cursor,
      resultRowCount: representative.rows.length,
    }, {
      objectName: 'PRODUCT_EMBEDDINGS',
      indexName: 'IDX_PRODUCT_VEC',
      indexBindings,
    });

    const lifecycleResult = await execute(`
      SELECT readiness.status,
             state.active_generation_id,
             JSON_VALUE(readiness.readiness, '$.generationId')
               AS readiness_generation_id,
             plan.generation_id AS plan_generation_id,
             inmemory.dataset_fingerprint,
             JSON_VALUE(readiness.readiness, '$.datasetFingerprint')
               AS readiness_fingerprint,
             plan.dataset_fingerprint AS plan_fingerprint,
             plan.object_name, plan.index_name, plan.plan_operation,
             plan.plan_hash_value
      FROM app_dataset_state state
      JOIN app_dataset_readiness readiness
        ON readiness.readiness_id = 1
      JOIN app_inmemory_generation_evidence inmemory
        ON inmemory.generation_id = state.active_generation_id
       AND inmemory.evidence_status = 'ACTIVE'
      JOIN app_feature_plan_evidence plan
        ON plan.generation_id = state.active_generation_id
       AND plan.feature_name = 'VECTOR'
       AND plan.child_number IS NOT NULL
      WHERE state.state_id = 1
    `);
    const lifecycle = lifecycleResult.rows?.[0] || {};
    return assertGlobalVectorAnchor({
      status: lifecycle.STATUS,
      activeGenerationId: lifecycle.ACTIVE_GENERATION_ID,
      readinessGenerationId: lifecycle.READINESS_GENERATION_ID,
      planGenerationId: lifecycle.PLAN_GENERATION_ID,
      datasetFingerprint: lifecycle.DATASET_FINGERPRINT,
      readinessFingerprint: lifecycle.READINESS_FINGERPRINT,
      planFingerprint: lifecycle.PLAN_FINGERPRINT,
      objectName: lifecycle.OBJECT_NAME,
      indexName: lifecycle.INDEX_NAME,
      planOperation: lifecycle.PLAN_OPERATION,
      planHashValue: lifecycle.PLAN_HASH_VALUE,
      sourceProducts: evidence.sourceProducts,
      sourcePosts: evidence.sourcePosts,
      momentumPosts: evidence.momentumPosts,
      productVectors: evidence.productVectors,
      postVectors: evidence.postVectors,
      semanticMatches: evidence.semanticMatches,
      expectedMatches: evidence.expectedMatches,
      currentPlan,
    });
  }, { readOnly: true });
}

function readinessResponse(
  assessment,
  proof = null,
  globalAnchor = null,
  indexBindings = []
) {
  const evidence = assessment.evidence;
  return {
    available: true,
    ready: true,
    feature: 'AI_VECTOR_SEARCH',
    source: 'ORACLE_METADATA_AND_EXECUTION',
    model: VECTOR_MODEL_NAME,
    dimensions: VECTOR_DIMENSIONS,
    elementType: VECTOR_ELEMENT_TYPE,
    scope: {
      status: assessment.scopeStatus,
      accessScope: evidence.accessScope,
      scopedEmpty: assessment.scopedEmpty,
      generationId: evidence.activeGenerationId,
      datasetFingerprint: evidence.datasetFingerprint,
      ...(globalAnchor ? { globalAnchor } : {}),
    },
    counts: {
      PRODUCTS: evidence.sourceProducts,
      SOCIAL_POSTS: evidence.sourcePosts,
      MOMENTUM_POSTS: evidence.momentumPosts,
      PRODUCT_EMBEDDINGS: evidence.productVectors,
      POST_EMBEDDINGS: evidence.postVectors,
      SEMANTIC_MATCHES: evidence.semanticMatches,
      EXPECTED_SEMANTIC_MATCHES: evidence.expectedMatches,
    },
    catalog: {
      declaredVectorColumns: evidence.declaredVectorColumns,
      validVectorIndexes: evidence.validVectorIndexes,
      modelCount: evidence.modelCount,
      indexBindings: indexBindings.map((binding) => ({
        indexName: binding.INDEX_NAME || binding.indexName,
        tableName: binding.TABLE_NAME || binding.tableName,
        columnName: binding.COLUMN_NAME || binding.columnName,
        columnPosition: Number(
          binding.COLUMN_POSITION ?? binding.columnPosition
        ),
        indexType: binding.INDEX_TYPE || binding.indexType,
        status: binding.STATUS || binding.status,
      })),
    },
    planEvidence: proof,
  };
}

async function assertVectorReadiness({
  connection,
  execute,
  readGlobalAnchor = readGlobalVectorAnchor,
  generationId = null,
  datasetFingerprint = null,
}) {
  const evidence = await readVectorEvidence(execute, {
    generationId,
    datasetFingerprint,
  });
  const assessment = assertVectorEvidence(evidence);
  if (assessment.scopedEmpty) {
    const globalAnchor = assertGlobalVectorAnchor(
      await readGlobalAnchor()
    );
    if (globalAnchor.generationId !== evidence.activeGenerationId
        || globalAnchor.datasetFingerprint !== evidence.datasetFingerprint) {
      throw new VectorEvidenceError(
        'The restricted Vector scope and global anchor do not share the current generation and fingerprint.',
        {
          scopedGenerationId: evidence.activeGenerationId,
          scopedDatasetFingerprint: evidence.datasetFingerprint,
          globalAnchor,
        },
        'VECTOR_GLOBAL_ANCHOR_UNAVAILABLE'
      );
    }
    return readinessResponse(assessment, null, globalAnchor);
  }

  const representative = await execute(`
    SELECT product_id, distance_score
    FROM (
      SELECT /*+ GATHER_PLAN_STATISTICS
                 VECTOR_INDEX_TRANSFORM(embeddings IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
             /* RETAIL_VECTOR_API_READINESS */
             embeddings.product_id,
             VECTOR_DISTANCE(
               embeddings.embedding,
               VECTOR_EMBEDDING(
                 ALL_MINILM_L12_V2 USING
                 'outdoor trail footwear and sporting goods' AS DATA
               ),
               COSINE
             ) AS distance_score
      FROM product_embeddings embeddings
      ORDER BY distance_score
      FETCH APPROXIMATE FIRST 5 ROWS ONLY
    )
    ORDER BY distance_score, product_id
  `);
  if (!representative.rows?.length) {
    throw new VectorEvidenceError(
      'The representative Oracle Vector readiness query returned no rows.',
      evidence,
      'VECTOR_SEARCH_RETURNED_NO_ROWS'
    );
  }
  const cursor = await capturePreviousCursor(connection, 'AI_VECTOR_SEARCH');
  const indexBindings = await readVectorIndexBindings(execute);
  const proof = classifyVectorPlan({
    ...cursor,
    resultRowCount: representative.rows.length,
  }, {
    objectName: 'PRODUCT_EMBEDDINGS',
    indexName: 'IDX_PRODUCT_VEC',
    indexBindings,
  });
  return readinessResponse(assessment, proof, null, indexBindings);
}

module.exports = {
  VECTOR_MODEL_NAME,
  VECTOR_MODEL_PROVENANCE,
  VECTOR_DIMENSIONS,
  VECTOR_ELEMENT_TYPE,
  VectorEvidenceError,
  assertVectorEvidence,
  assertGlobalVectorAnchor,
  readVectorEvidence,
  readGlobalVectorAnchor,
  assertVectorReadiness,
};
