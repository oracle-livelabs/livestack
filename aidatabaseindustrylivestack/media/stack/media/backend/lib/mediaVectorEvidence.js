'use strict';

const VECTOR_DIMENSIONS = 384;
const VECTOR_ELEMENT_TYPE = 'FLOAT32';
const VECTOR_MODEL_NAME = 'ALL_MINILM_L12_V2';
const VECTOR_PROVENANCE_MODEL = 'all_MiniLM_L12_v2';

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deriveCanonicalSemanticMismatches({
  productEmbeddingMismatches,
  postEmbeddingMismatches,
  deterministicMatchMismatches,
} = {}) {
  const counters = [
    productEmbeddingMismatches,
    postEmbeddingMismatches,
    deterministicMatchMismatches,
  ];
  return counters.every((value) => (
    value !== null
      && value !== undefined
      && Number.isFinite(Number(value))
      && Number(value) === 0
  )) ? 0 : 1;
}

function rowValue(row, key) {
  if (!row) return null;
  return row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()] ?? null;
}

function normalizeEvidence(raw = {}) {
  const evidence = {
    accessScope: String(raw.accessScope || 'GLOBAL').trim().toUpperCase(),
    generationId: String(raw.generationId || '').trim() || null,
    datasetFingerprint:
      String(raw.datasetFingerprint || '').trim().toLowerCase() || null,
    sourceProducts: numberValue(raw.sourceProducts),
    sourcePosts: numberValue(raw.sourcePosts),
    momentumPosts: numberValue(raw.momentumPosts),
    productVectors: numberValue(raw.productVectors),
    postVectors: numberValue(raw.postVectors),
    semanticMatches: numberValue(raw.semanticMatches),
    expectedMatches: numberValue(raw.expectedMatches),
    declaredVectorColumns: numberValue(raw.declaredVectorColumns),
    validVectorIndexes: numberValue(raw.validVectorIndexes),
    modelCount: numberValue(raw.modelCount),
    invalidProductDescriptors: numberValue(raw.invalidProductDescriptors),
    invalidPostDescriptors: numberValue(raw.invalidPostDescriptors),
    invalidProductProvenance: numberValue(raw.invalidProductProvenance),
    invalidPostProvenance: numberValue(raw.invalidPostProvenance),
    orphanVectorRows: numberValue(raw.orphanVectorRows),
    productSourceTextMismatches: numberValue(
      raw.productSourceTextMismatches
    ),
    postSourceTextMismatches: numberValue(raw.postSourceTextMismatches),
    productEmbeddingMismatches: numberValue(
      raw.productEmbeddingMismatches
    ),
    postEmbeddingMismatches: numberValue(raw.postEmbeddingMismatches),
    canonicalSemanticMismatches: numberValue(
      raw.canonicalSemanticMismatches
    ),
    incompleteMatchGroups: numberValue(raw.incompleteMatchGroups),
    invalidMatches: numberValue(raw.invalidMatches),
    deterministicMatchMismatches: numberValue(
      raw.deterministicMatchMismatches
    ),
    indexBindings: Array.isArray(raw.indexBindings)
      ? raw.indexBindings.map((binding) => ({ ...binding }))
      : [],
  };
  if (!Number.isFinite(Number(raw.expectedMatches))) {
    evidence.expectedMatches = evidence.momentumPosts
      * Math.min(evidence.sourceProducts, 3);
  }
  return evidence;
}

function evidenceError(failures, evidence) {
  const error = new Error(
    `Media Vector evidence is incomplete: ${failures.join('; ')}`
  );
  error.details = evidence;
  return error;
}

function assertMediaGlobalVectorAnchor(raw, {
  expectedGenerationId = null,
  expectedFingerprint = null,
} = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Current-generation global Media Vector anchor is missing');
  }
  const activeGenerationId = String(raw.activeGenerationId || '').trim();
  const readinessGenerationId = String(
    raw.readinessGenerationId || ''
  ).trim();
  const planGenerationId = String(raw.planGenerationId || '').trim();
  const datasetFingerprint = String(
    raw.datasetFingerprint || ''
  ).trim().toLowerCase();
  const readinessFingerprint = String(
    raw.readinessFingerprint || ''
  ).trim().toLowerCase();
  const planFingerprint = String(
    raw.planFingerprint || ''
  ).trim().toLowerCase();
  const failures = [];

  if (String(raw.status || '').toUpperCase() !== 'ACTIVE') {
    failures.push('global anchor status is not ACTIVE');
  }
  if (!activeGenerationId
      || readinessGenerationId !== activeGenerationId
      || planGenerationId !== activeGenerationId) {
    failures.push('global anchor generation identities do not match');
  }
  if (expectedGenerationId
      && activeGenerationId !== String(expectedGenerationId)) {
    failures.push('global anchor is for another active generation');
  }
  if (!/^[0-9a-f]{64}$/.test(datasetFingerprint)
      || readinessFingerprint !== datasetFingerprint
      || planFingerprint !== datasetFingerprint) {
    failures.push('global anchor dataset fingerprints do not match');
  }
  if (expectedFingerprint
      && datasetFingerprint !== String(expectedFingerprint).toLowerCase()) {
    failures.push('global anchor fingerprint is stale');
  }
  if (String(raw.objectName || '').toUpperCase() !== 'PRODUCT_EMBEDDINGS'
      || String(raw.indexName || '').toUpperCase() !== 'IDX_PRODUCT_VEC'
      || !/VECTOR INDEX/i.test(String(raw.planOperation || ''))
      || /TABLE ACCESS\s+FULL/i.test(String(raw.planOperation || ''))) {
    failures.push('global anchor exact Vector index plan is invalid');
  }
  if (numberValue(raw.resultRowCount) < 1) {
    failures.push('global anchor exact Vector execution is empty');
  }
  const sourceProducts = numberValue(raw.sourceProducts);
  const sourcePosts = numberValue(raw.sourcePosts);
  const momentumPosts = numberValue(raw.momentumPosts);
  const productVectors = numberValue(raw.productVectors);
  const postVectors = numberValue(raw.postVectors);
  const semanticMatches = numberValue(raw.semanticMatches);
  const expectedMatches = numberValue(raw.expectedMatches);
  if (sourceProducts < 1
      || sourcePosts < 1
      || momentumPosts < 1
      || productVectors !== sourceProducts
      || postVectors !== sourcePosts
      || semanticMatches !== expectedMatches
      || expectedMatches !== momentumPosts * Math.min(sourceProducts, 3)) {
    failures.push('global anchor Vector coverage is incomplete');
  }
  if (failures.length > 0) {
    throw new Error(
      `Current-generation global Media Vector anchor is invalid: ${failures.join('; ')}`
    );
  }
  return Object.freeze({
    ready: true,
    generationId: activeGenerationId,
    datasetFingerprint,
    objectName: 'PRODUCT_EMBEDDINGS',
    indexName: 'IDX_PRODUCT_VEC',
    planOperation: String(raw.planOperation),
    resultRowCount: numberValue(raw.resultRowCount),
  });
}

function assertMediaVectorEvidence(raw = {}, {
  globalAnchor = null,
} = {}) {
  const evidence = normalizeEvidence(raw);
  const restricted = ['RESTRICTED', 'SCOPED_EMPTY'].includes(
    evidence.accessScope
  );
  const scopedEmpty = restricted
    && evidence.sourceProducts === 0
    && evidence.sourcePosts === 0
    && evidence.momentumPosts === 0
    && evidence.productVectors === 0
    && evidence.postVectors === 0
    && evidence.semanticMatches === 0
    && evidence.expectedMatches === 0;

  const failures = [];
  if (evidence.modelCount !== 1) {
    failures.push(`model count ${evidence.modelCount} is not 1`);
  }
  if (evidence.declaredVectorColumns !== 2) {
    failures.push(
      `declared 384/FLOAT32 Vector columns ${evidence.declaredVectorColumns} is not 2`
    );
  }
  if (evidence.validVectorIndexes !== 2) {
    failures.push(`valid Vector index count ${evidence.validVectorIndexes} is not 2`);
  }
  if (!scopedEmpty) {
    if (evidence.sourceProducts < 1 || evidence.sourcePosts < 1) {
      failures.push(
        `global Vector source coverage is empty (${evidence.sourceProducts}/${evidence.sourcePosts})`
      );
    }
    if (evidence.momentumPosts < 1) {
      failures.push('semantic source coverage has no momentum posts');
    }
    if (evidence.productVectors !== evidence.sourceProducts) {
      failures.push(
        `product Vector coverage ${evidence.productVectors}/${evidence.sourceProducts}`
      );
    }
    if (evidence.postVectors !== evidence.sourcePosts) {
      failures.push(
        `post Vector coverage ${evidence.postVectors}/${evidence.sourcePosts}`
      );
    }
    if (evidence.semanticMatches !== evidence.expectedMatches) {
      failures.push(
        `semantic match coverage ${evidence.semanticMatches}/${evidence.expectedMatches}`
      );
    }
  }
  if (evidence.invalidProductDescriptors > 0
      || evidence.invalidPostDescriptors > 0) {
    failures.push(
      `invalid Vector descriptors ${evidence.invalidProductDescriptors}/${evidence.invalidPostDescriptors}`
    );
  }
  if (evidence.invalidProductProvenance > 0
      || evidence.invalidPostProvenance > 0) {
    failures.push(
      `invalid Vector model/text provenance ${evidence.invalidProductProvenance}/${evidence.invalidPostProvenance}`
    );
  }
  if (evidence.orphanVectorRows > 0) {
    failures.push(`orphan Vector source rows ${evidence.orphanVectorRows}`);
  }
  if (evidence.productSourceTextMismatches > 0
      || evidence.postSourceTextMismatches > 0) {
    failures.push(
      `canonical source text mismatches ${evidence.productSourceTextMismatches}/${evidence.postSourceTextMismatches}`
    );
  }
  if (evidence.productEmbeddingMismatches > 0
      || evidence.postEmbeddingMismatches > 0) {
    failures.push(
      `current-model embedding mismatches ${evidence.productEmbeddingMismatches}/${evidence.postEmbeddingMismatches}`
    );
  }
  if (evidence.incompleteMatchGroups > 0) {
    failures.push(
      `incomplete semantic match groups ${evidence.incompleteMatchGroups}`
    );
  }
  if (evidence.invalidMatches > 0) {
    failures.push(`invalid semantic matches ${evidence.invalidMatches}`);
  }
  if (evidence.deterministicMatchMismatches > 0) {
    failures.push(
      `deterministic semantic match mismatches ${evidence.deterministicMatchMismatches}`
    );
  }
  if (evidence.canonicalSemanticMismatches > 0) {
    failures.push(
      `canonical current-model semantic mismatches ${evidence.canonicalSemanticMismatches}`
    );
  }

  if (scopedEmpty) {
    if (failures.length > 0) throw evidenceError(failures, evidence);
    if (!evidence.generationId
        || !/^[0-9a-f]{64}$/.test(evidence.datasetFingerprint || '')) {
      throw evidenceError(
        ['restricted scoped-empty evidence lacks current generation/fingerprint'],
        evidence
      );
    }
    const verifiedAnchor = assertMediaGlobalVectorAnchor(globalAnchor, {
      expectedGenerationId: evidence.generationId,
      expectedFingerprint: evidence.datasetFingerprint,
    });
    return {
      ready: true,
      scopedEmpty: true,
      scopeStatus: 'SCOPED_NO_VISIBLE_VECTOR_DATA',
      evidence,
      globalAnchor: verifiedAnchor,
    };
  }

  if (failures.length > 0) {
    throw evidenceError(failures, evidence);
  }

  return {
    ready: true,
    scopedEmpty: false,
    scopeStatus: 'VISIBLE_VECTOR_DATA',
    evidence,
  };
}

async function collectMediaVectorEvidence(connection, {
  accessScope = 'GLOBAL',
  generationId = null,
  datasetFingerprint = null,
} = {}) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error('A live Oracle connection is required for Media Vector evidence');
  }

  const result = await connection.execute(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE is_active = 1)
        AS source_products,
      (SELECT COUNT(*) FROM social_posts)
        AS source_posts,
      (SELECT COUNT(*) FROM social_posts
       WHERE momentum_flag IN ('viral', 'mega_viral'))
        AS momentum_posts,
      (SELECT COUNT(*) FROM product_embeddings)
        AS product_vectors,
      (SELECT COUNT(*) FROM post_embeddings)
        AS post_vectors,
      (SELECT COUNT(*) FROM semantic_matches)
        AS semantic_matches,
      (
        (SELECT COUNT(*) FROM social_posts
         WHERE momentum_flag IN ('viral', 'mega_viral'))
        * LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
      ) AS expected_matches,
      (SELECT COUNT(*)
       FROM user_tab_columns
       WHERE data_type = 'VECTOR'
         AND REPLACE(UPPER(vector_info), ' ', '') =
             'VECTOR(384,FLOAT32,DENSE)'
         AND (
           (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
           OR
           (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
         ))
        AS declared_vector_columns,
      (SELECT COUNT(*)
       FROM user_indexes index_row
       JOIN user_ind_columns column_row
         ON column_row.index_name = index_row.index_name
       JOIN SYS.V_$VECTOR_INDEX vector_index
         ON vector_index.owner = USER
        AND vector_index.index_name = index_row.index_name
       WHERE index_row.status = 'VALID'
         AND index_row.index_type = 'VECTOR'
         AND REPLACE(UPPER(index_row.index_subtype), ' ', '_') =
             'NEIGHBOR_PARTITIONS_IVF'
         AND column_row.column_position = 1
         AND NOT EXISTS (
           SELECT 1
           FROM user_ind_columns extra_column
           WHERE extra_column.index_name = index_row.index_name
             AND extra_column.column_position <> 1
         )
         AND UPPER(vector_index.distance_type) = 'COSINE'
         AND vector_index.index_dimensions = 384
         AND UPPER(vector_index.index_dim_type) = 'FLOAT32'
         AND UPPER(vector_index.index_organization) = 'NEIGHBOR PARTITIONS'
         AND (
           (
             index_row.index_name = 'IDX_PRODUCT_VEC'
             AND index_row.table_name = 'PRODUCT_EMBEDDINGS'
             AND column_row.table_name = 'PRODUCT_EMBEDDINGS'
             AND column_row.column_name = 'EMBEDDING'
           )
           OR
           (
             index_row.index_name = 'IDX_POST_VEC'
             AND index_row.table_name = 'POST_EMBEDDINGS'
             AND column_row.table_name = 'POST_EMBEDDINGS'
             AND column_row.column_name = 'EMBEDDING'
           )
         ))
        AS valid_vector_indexes,
      (SELECT COUNT(*)
       FROM user_mining_models
       WHERE model_name = 'ALL_MINILM_L12_V2'
         AND UPPER(mining_function) = 'EMBEDDING'
         AND UPPER(algorithm) = 'ONNX')
        AS model_count,
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       WHERE vector_row.embedding IS NULL
          OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
          OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32')
        AS invalid_product_descriptors,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       WHERE vector_row.embedding IS NULL
          OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
          OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32')
        AS invalid_post_descriptors,
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       WHERE vector_row.embedding_text IS NULL
          OR NVL(DBMS_LOB.GETLENGTH(vector_row.embedding_text), 0) = 0
          OR vector_row.embedding_model IS NULL
          OR vector_row.embedding_model <> 'all_MiniLM_L12_v2')
        AS invalid_product_provenance,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       WHERE vector_row.embedding_text IS NULL
          OR NVL(DBMS_LOB.GETLENGTH(vector_row.embedding_text), 0) = 0
          OR vector_row.embedding_model IS NULL
          OR vector_row.embedding_model <> 'all_MiniLM_L12_v2')
        AS invalid_post_provenance,
      (
        (SELECT COUNT(*)
         FROM product_embeddings vector_row
         WHERE NOT EXISTS (
           SELECT 1
           FROM products source_row
           WHERE source_row.product_id = vector_row.product_id
             AND source_row.is_active = 1
         ))
        +
        (SELECT COUNT(*)
         FROM post_embeddings vector_row
         WHERE NOT EXISTS (
           SELECT 1
           FROM social_posts source_row
           WHERE source_row.post_id = vector_row.post_id
         ))
      ) AS orphan_vector_rows,
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       JOIN products source_row
         ON source_row.product_id = vector_row.product_id
        AND source_row.is_active = 1
       JOIN brands brand
         ON brand.brand_id = source_row.brand_id
       WHERE vector_row.embedding_text IS NULL
          OR NVL(
               DBMS_LOB.COMPARE(
                 vector_row.embedding_text,
                 TO_CLOB(
                   source_row.product_name || ' ' ||
                   NVL(source_row.category, '') || ' ' ||
                   NVL(
                     DBMS_LOB.SUBSTR(source_row.description, 1000, 1),
                     ''
                   ) || ' ' || brand.brand_name
                 )
               ),
               1
             ) <> 0)
        AS product_source_text_mismatches,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       JOIN social_posts source_row
         ON source_row.post_id = vector_row.post_id
       WHERE vector_row.embedding_text IS NULL
          OR NVL(
               DBMS_LOB.COMPARE(
                 vector_row.embedding_text,
                 TO_CLOB(DBMS_LOB.SUBSTR(source_row.post_text, 500, 1))
               ),
               1
             ) <> 0)
        AS post_source_text_mismatches,
      (SELECT COUNT(*)
       FROM product_embeddings vector_row
       JOIN products source_row
         ON source_row.product_id = vector_row.product_id
        AND source_row.is_active = 1
       JOIN brands brand
         ON brand.brand_id = source_row.brand_id
       WHERE vector_row.embedding IS NULL
          OR NVL(
               VECTOR_DISTANCE(
                 vector_row.embedding,
                 VECTOR_EMBEDDING(
                   ALL_MINILM_L12_V2
                   USING source_row.product_name || ' ' ||
                     NVL(source_row.category, '') || ' ' ||
                     NVL(
                       DBMS_LOB.SUBSTR(source_row.description, 1000, 1),
                       ''
                     ) || ' ' || brand.brand_name AS DATA
                 ),
                 EUCLIDEAN
               ),
               999
             ) > 0.00001)
        AS product_embedding_mismatches,
      (SELECT COUNT(*)
       FROM post_embeddings vector_row
       JOIN social_posts source_row
         ON source_row.post_id = vector_row.post_id
       WHERE vector_row.embedding IS NULL
          OR NVL(
               VECTOR_DISTANCE(
                 vector_row.embedding,
                 VECTOR_EMBEDDING(
                   ALL_MINILM_L12_V2
                   USING DBMS_LOB.SUBSTR(source_row.post_text, 500, 1) AS DATA
                 ),
                 EUCLIDEAN
               ),
               999
             ) > 0.00001)
        AS post_embedding_mismatches,
      (SELECT COUNT(*)
       FROM (
         SELECT post.post_id
         FROM social_posts post
         LEFT JOIN semantic_matches match_row
           ON match_row.post_id = post.post_id
         WHERE post.momentum_flag IN ('viral', 'mega_viral')
         GROUP BY post.post_id
         HAVING COUNT(match_row.match_id) <>
                  LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
             OR MIN(match_row.match_rank) <> 1
             OR MAX(match_row.match_rank) <>
                  LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
             OR COUNT(DISTINCT match_row.match_rank) <>
                  LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
             OR COUNT(DISTINCT match_row.product_id) <>
                  LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
       ))
        AS incomplete_match_groups,
      (SELECT COUNT(*)
       FROM semantic_matches match_row
       WHERE NOT EXISTS (
               SELECT 1
               FROM social_posts post
               WHERE post.post_id = match_row.post_id
                 AND post.momentum_flag IN ('viral', 'mega_viral')
             )
          OR NOT EXISTS (
               SELECT 1
               FROM products product
               WHERE product.product_id = match_row.product_id
                 AND product.is_active = 1
             )
          OR match_row.similarity_score IS NULL
          OR match_row.similarity_score < -1
          OR match_row.similarity_score > 1
          OR match_row.match_rank IS NULL
          OR match_row.match_rank < 1
          OR match_row.match_rank >
               LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
          OR match_row.match_method IS NULL
          OR match_row.match_method <> 'vector')
        AS invalid_matches
    FROM dual
  `, {}, { autoCommit: false });

  const row = result.rows?.[0] || {};
  const deterministicResult = await connection.execute(`
    WITH stored_ranked_expected AS (
      SELECT post_vector.post_id,
             product_vector.product_id,
             ROUND(
               1 - VECTOR_DISTANCE(
                 post_vector.embedding,
                 product_vector.embedding,
                 COSINE
               ),
               5
             ) similarity_score,
             ROW_NUMBER() OVER (
               PARTITION BY post_vector.post_id
               ORDER BY VECTOR_DISTANCE(
                 post_vector.embedding,
                 product_vector.embedding,
                 COSINE
               ),
               product_vector.product_id
             ) match_rank
      FROM post_embeddings post_vector
      JOIN social_posts post
        ON post.post_id = post_vector.post_id
      CROSS JOIN product_embeddings product_vector
      WHERE post.momentum_flag IN ('viral', 'mega_viral')
    ),
    stored_expected_matches AS (
      SELECT post_id, product_id, similarity_score, match_rank
      FROM stored_ranked_expected
      WHERE match_rank <= 3
    )
    SELECT (SELECT COUNT(*)
       FROM stored_expected_matches expected_row
       FULL OUTER JOIN semantic_matches actual_row
         ON actual_row.post_id = expected_row.post_id
        AND actual_row.match_rank = expected_row.match_rank
       WHERE expected_row.post_id IS NULL
          OR actual_row.post_id IS NULL
          OR actual_row.product_id <> expected_row.product_id
          OR actual_row.similarity_score IS NULL
          OR actual_row.match_rank IS NULL
          OR ABS(actual_row.similarity_score - expected_row.similarity_score)
               > 0.00001
          OR actual_row.match_method IS NULL
          OR actual_row.match_method <> 'vector')
        AS deterministic_match_mismatches
    FROM dual
  `, {}, { autoCommit: false });

  const deterministicRow = deterministicResult.rows?.[0] || {};
  const deterministicMatchMismatches = rowValue(
    deterministicRow,
    'DETERMINISTIC_MATCH_MISMATCHES'
  );
  const indexBindings = await collectExactVectorIndexBindings(connection);
  return normalizeEvidence({
    accessScope,
    generationId,
    datasetFingerprint,
    sourceProducts: rowValue(row, 'SOURCE_PRODUCTS'),
    sourcePosts: rowValue(row, 'SOURCE_POSTS'),
    momentumPosts: rowValue(row, 'MOMENTUM_POSTS'),
    productVectors: rowValue(row, 'PRODUCT_VECTORS'),
    postVectors: rowValue(row, 'POST_VECTORS'),
    semanticMatches: rowValue(row, 'SEMANTIC_MATCHES'),
    expectedMatches: rowValue(row, 'EXPECTED_MATCHES'),
    declaredVectorColumns: rowValue(row, 'DECLARED_VECTOR_COLUMNS'),
    validVectorIndexes: rowValue(row, 'VALID_VECTOR_INDEXES'),
    modelCount: rowValue(row, 'MODEL_COUNT'),
    invalidProductDescriptors: rowValue(row, 'INVALID_PRODUCT_DESCRIPTORS'),
    invalidPostDescriptors: rowValue(row, 'INVALID_POST_DESCRIPTORS'),
    invalidProductProvenance: rowValue(row, 'INVALID_PRODUCT_PROVENANCE'),
    invalidPostProvenance: rowValue(row, 'INVALID_POST_PROVENANCE'),
    orphanVectorRows: rowValue(row, 'ORPHAN_VECTOR_ROWS'),
    productSourceTextMismatches: rowValue(
      row,
      'PRODUCT_SOURCE_TEXT_MISMATCHES'
    ),
    postSourceTextMismatches: rowValue(
      row,
      'POST_SOURCE_TEXT_MISMATCHES'
    ),
    productEmbeddingMismatches: rowValue(
      row,
      'PRODUCT_EMBEDDING_MISMATCHES'
    ),
    postEmbeddingMismatches: rowValue(
      row,
      'POST_EMBEDDING_MISMATCHES'
    ),
    incompleteMatchGroups: rowValue(row, 'INCOMPLETE_MATCH_GROUPS'),
    invalidMatches: rowValue(row, 'INVALID_MATCHES'),
    deterministicMatchMismatches,
    canonicalSemanticMismatches: deriveCanonicalSemanticMismatches({
      productEmbeddingMismatches: rowValue(
        row,
        'PRODUCT_EMBEDDING_MISMATCHES'
      ),
      postEmbeddingMismatches: rowValue(
        row,
        'POST_EMBEDDING_MISMATCHES'
      ),
      deterministicMatchMismatches,
    }),
    indexBindings,
  });
}

async function collectExactVectorIndexBindings(connection) {
  const result = await connection.execute(`
    SELECT index_row.index_name,
           index_row.table_name,
           column_row.column_name,
           column_row.column_position,
           index_row.index_type,
           index_row.index_subtype,
           index_row.status,
           vector_index.distance_type distance
    FROM user_indexes index_row
    JOIN user_ind_columns column_row
      ON column_row.index_name = index_row.index_name
    JOIN SYS.V_$VECTOR_INDEX vector_index
      ON vector_index.owner = USER
     AND vector_index.index_name = index_row.index_name
    WHERE index_row.status = 'VALID'
      AND index_row.index_type = 'VECTOR'
      AND REPLACE(UPPER(index_row.index_subtype), ' ', '_') =
          'NEIGHBOR_PARTITIONS_IVF'
      AND column_row.column_position = 1
      AND NOT EXISTS (
        SELECT 1
        FROM user_ind_columns extra_column
        WHERE extra_column.index_name = index_row.index_name
          AND extra_column.column_position <> 1
      )
      AND UPPER(vector_index.distance_type) = 'COSINE'
      AND vector_index.index_dimensions = 384
      AND UPPER(vector_index.index_dim_type) = 'FLOAT32'
      AND UPPER(vector_index.index_organization) = 'NEIGHBOR PARTITIONS'
      AND (
        (
          index_row.index_name = 'IDX_PRODUCT_VEC'
          AND index_row.table_name = 'PRODUCT_EMBEDDINGS'
          AND column_row.table_name = 'PRODUCT_EMBEDDINGS'
          AND column_row.column_name = 'EMBEDDING'
        )
        OR
        (
          index_row.index_name = 'IDX_POST_VEC'
          AND index_row.table_name = 'POST_EMBEDDINGS'
          AND column_row.table_name = 'POST_EMBEDDINGS'
          AND column_row.column_name = 'EMBEDDING'
        )
      )
    ORDER BY index_row.index_name
  `, {}, { autoCommit: false });
  return (result.rows || [])
    .map((binding) => ({
      indexName: String(rowValue(binding, 'INDEX_NAME') || '').toUpperCase(),
      tableName: String(rowValue(binding, 'TABLE_NAME') || '').toUpperCase(),
      columnName: String(rowValue(binding, 'COLUMN_NAME') || '').toUpperCase(),
      columnPosition: numberValue(rowValue(binding, 'COLUMN_POSITION')),
      indexType: String(rowValue(binding, 'INDEX_TYPE') || '').toUpperCase(),
      indexSubtype: String(
        rowValue(binding, 'INDEX_SUBTYPE') || ''
      ).toUpperCase(),
      status: String(rowValue(binding, 'STATUS') || '').toUpperCase(),
      distance: String(rowValue(binding, 'DISTANCE') || '').toUpperCase(),
    }))
    .filter((binding) => binding.indexName);
}

async function collectMediaVectorScopeEvidence(connection, {
  accessScope = 'RESTRICTED',
  generationId = null,
  datasetFingerprint = null,
} = {}) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(
      'A live Oracle connection is required for scoped Media Vector evidence'
    );
  }
  const result = await connection.execute(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE is_active = 1)
        AS source_products,
      (SELECT COUNT(*) FROM social_posts)
        AS source_posts,
      (SELECT COUNT(*) FROM social_posts
       WHERE momentum_flag IN ('viral', 'mega_viral'))
        AS momentum_posts,
      (SELECT COUNT(*) FROM product_embeddings)
        AS product_vectors,
      (SELECT COUNT(*) FROM post_embeddings)
        AS post_vectors,
      (SELECT COUNT(*) FROM semantic_matches)
        AS semantic_matches,
      (
        (SELECT COUNT(*) FROM social_posts
         WHERE momentum_flag IN ('viral', 'mega_viral'))
        * LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
      ) AS expected_matches,
      (SELECT COUNT(*)
       FROM user_tab_columns
       WHERE data_type = 'VECTOR'
         AND REPLACE(UPPER(vector_info), ' ', '') =
             'VECTOR(384,FLOAT32,DENSE)'
         AND (
           (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
           OR
           (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
         ))
        AS declared_vector_columns,
      (SELECT COUNT(*)
       FROM user_mining_models
       WHERE model_name = 'ALL_MINILM_L12_V2'
         AND UPPER(mining_function) = 'EMBEDDING'
         AND UPPER(algorithm) = 'ONNX')
        AS model_count
    FROM dual
  `, {}, { autoCommit: false });
  const row = result.rows?.[0] || {};
  const indexBindings = await collectExactVectorIndexBindings(connection);
  return normalizeEvidence({
    accessScope,
    generationId,
    datasetFingerprint,
    sourceProducts: rowValue(row, 'SOURCE_PRODUCTS'),
    sourcePosts: rowValue(row, 'SOURCE_POSTS'),
    momentumPosts: rowValue(row, 'MOMENTUM_POSTS'),
    productVectors: rowValue(row, 'PRODUCT_VECTORS'),
    postVectors: rowValue(row, 'POST_VECTORS'),
    semanticMatches: rowValue(row, 'SEMANTIC_MATCHES'),
    expectedMatches: rowValue(row, 'EXPECTED_MATCHES'),
    declaredVectorColumns: rowValue(row, 'DECLARED_VECTOR_COLUMNS'),
    validVectorIndexes: indexBindings.length,
    modelCount: rowValue(row, 'MODEL_COUNT'),
    indexBindings,
  });
}

function parseJsonDocument(value, label) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return value;
  }
  try {
    return JSON.parse(String(value || ''));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function readMediaGlobalVectorAnchor({
  expectedGenerationId = null,
} = {}) {
  const db = require('../config/database');
  const {
    executeWithExactPlanEvidence,
  } = require('./exactPlanEvidence');
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(
      connection,
      'admin_jess',
      { autoCommit: false }
    );
    const activeResult = await connection.execute(`
      SELECT readiness.status,
             job.candidate_generation_id active_generation_id,
             generation.source_fingerprint dataset_fingerprint,
             JSON_SERIALIZE(
               readiness.readiness RETURNING CLOB
             ) readiness,
             evidence.generation_id plan_generation_id,
             evidence.dataset_fingerprint plan_dataset_fingerprint,
             evidence.expected_table_name,
             evidence.expected_index_name,
             evidence.result_row_count,
             evidence.no_forbidden_full_scan
      FROM app_dataset_readiness readiness
      JOIN app_dataset_jobs job
        ON job.job_id = readiness.job_id
      JOIN app_oml_generations generation
        ON generation.generation_id = job.candidate_generation_id
       AND generation.status = 'active'
      JOIN app_feature_execution_evidence evidence
        ON evidence.generation_id = generation.generation_id
       AND evidence.feature_name = 'VECTOR'
       AND evidence.evidence_status = 'VERIFIED'
      WHERE readiness.readiness_id = 1
        AND readiness.status = 'ACTIVE'
    `, {}, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
    if (activeResult.rows?.length !== 1) {
      throw new Error(
        'Current-generation Media Vector readiness identity is unavailable'
      );
    }
    const active = activeResult.rows[0];
    const generationId = String(
      rowValue(active, 'ACTIVE_GENERATION_ID') || ''
    ).trim();
    const datasetFingerprint = String(
      rowValue(active, 'DATASET_FINGERPRINT') || ''
    ).trim().toLowerCase();
    if (!generationId
        || (expectedGenerationId
          && generationId !== String(expectedGenerationId))
        || !/^[0-9a-f]{64}$/.test(datasetFingerprint)) {
      throw new Error(
        'Current-generation Media Vector generation/fingerprint is invalid'
      );
    }
    if (String(rowValue(active, 'PLAN_GENERATION_ID') || '') !== generationId
        || String(
          rowValue(active, 'PLAN_DATASET_FINGERPRINT') || ''
        ).toLowerCase() !== datasetFingerprint
        || String(
          rowValue(active, 'EXPECTED_TABLE_NAME') || ''
        ).toUpperCase() !== 'PRODUCT_EMBEDDINGS'
        || String(
          rowValue(active, 'EXPECTED_INDEX_NAME') || ''
        ).toUpperCase() !== 'IDX_PRODUCT_VEC'
        || numberValue(rowValue(active, 'RESULT_ROW_COUNT')) < 1
        || numberValue(rowValue(active, 'NO_FORBIDDEN_FULL_SCAN')) !== 1) {
      throw new Error(
        'Persisted current-generation Media Vector execution proof is invalid'
      );
    }

    const readiness = parseJsonDocument(
      rowValue(active, 'READINESS'),
      'Media dataset readiness'
    );
    const integrity = assertMediaVectorEvidence(
      readiness.vectorIntegrity || {},
      {}
    );
    if (integrity.scopedEmpty
        || integrity.evidence.generationId !== generationId
        || integrity.evidence.datasetFingerprint !== datasetFingerprint) {
      throw new Error(
        'Persisted current-generation global Media Vector integrity is stale'
      );
    }
    const indexBindings = await collectExactVectorIndexBindings(connection);
    const freshProof = await executeWithExactPlanEvidence(connection, {
      generationId,
      datasetFingerprint,
      feature: 'VECTOR_GLOBAL_ANCHOR',
      sql: `
        SELECT *
        FROM (
          SELECT /*+ GATHER_PLAN_STATISTICS
                     VECTOR_INDEX_TRANSFORM(product_vector idx_product_vec) */
                 product_vector.product_id,
                 VECTOR_DISTANCE(
                   product_vector.embedding,
                   VECTOR_EMBEDDING(
                     ALL_MINILM_L12_V2
                     USING 'content demand' AS DATA
                   ),
                   COSINE
                 ) distance
          FROM product_embeddings product_vector
          ORDER BY VECTOR_DISTANCE(
            product_vector.embedding,
            VECTOR_EMBEDDING(
              ALL_MINILM_L12_V2
              USING 'content demand' AS DATA
            ),
            COSINE
          )
          FETCH APPROXIMATE FIRST 3 ROWS ONLY
        )
        ORDER BY distance, product_id
      `,
      requiredPlan: (row) => (
        String(row.OBJECT_NAME || '').toUpperCase() === 'IDX_PRODUCT_VEC'
      ),
      requiredIndexName: 'IDX_PRODUCT_VEC',
      requiredTableName: 'PRODUCT_EMBEDDINGS',
      indexBindings,
      forbiddenFullScanTables: [
        'PRODUCT_EMBEDDINGS',
        'POST_EMBEDDINGS',
      ],
      requireNonEmptyResult: true,
      persist: false,
    });
    const stableResult = await connection.execute(`
      SELECT job.candidate_generation_id active_generation_id,
             generation.source_fingerprint dataset_fingerprint
      FROM app_dataset_readiness readiness
      JOIN app_dataset_jobs job
        ON job.job_id = readiness.job_id
      JOIN app_oml_generations generation
        ON generation.generation_id = job.candidate_generation_id
       AND generation.status = 'active'
      WHERE readiness.readiness_id = 1
        AND readiness.status = 'ACTIVE'
    `, {}, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
    const stable = stableResult.rows?.[0] || {};
    if (stableResult.rows?.length !== 1
        || String(
          rowValue(stable, 'ACTIVE_GENERATION_ID') || ''
        ) !== generationId
        || String(
          rowValue(stable, 'DATASET_FINGERPRINT') || ''
        ).toLowerCase() !== datasetFingerprint) {
      throw new Error(
        'Media Vector generation changed while the global anchor was captured'
      );
    }
    const evidence = integrity.evidence;
    const verified = assertMediaGlobalVectorAnchor({
      status: rowValue(active, 'STATUS'),
      activeGenerationId: generationId,
      readinessGenerationId: evidence.generationId,
      planGenerationId: freshProof.evidence.generationId,
      datasetFingerprint,
      readinessFingerprint: evidence.datasetFingerprint,
      planFingerprint: freshProof.evidence.datasetFingerprint,
      objectName: freshProof.evidence.expectedTableName,
      indexName: freshProof.evidence.expectedIndexName,
      planOperation: [
        freshProof.evidence.operation,
        freshProof.evidence.options,
      ].filter(Boolean).join(' '),
      resultRowCount: freshProof.evidence.resultRowCount,
      sourceProducts: evidence.sourceProducts,
      sourcePosts: evidence.sourcePosts,
      momentumPosts: evidence.momentumPosts,
      productVectors: evidence.productVectors,
      postVectors: evidence.postVectors,
      semanticMatches: evidence.semanticMatches,
      expectedMatches: evidence.expectedMatches,
      indexBindings,
      exactPlanFingerprint: freshProof.evidence.planFingerprint,
    }, {
      expectedGenerationId,
      expectedFingerprint: datasetFingerprint,
    });
    return Object.freeze({
      ...verified,
      indexBindings: Object.freeze(indexBindings),
      exactPlanFingerprint: freshProof.evidence.planFingerprint,
    });
  } finally {
    await db.releaseConnection(connection, {
      rollback: true,
      label: 'Media global Vector anchor',
    });
  }
}

module.exports = {
  VECTOR_DIMENSIONS,
  VECTOR_ELEMENT_TYPE,
  VECTOR_MODEL_NAME,
  VECTOR_PROVENANCE_MODEL,
  deriveCanonicalSemanticMismatches,
  normalizeEvidence,
  assertMediaGlobalVectorAnchor,
  assertMediaVectorEvidence,
  collectMediaVectorEvidence,
  collectMediaVectorScopeEvidence,
  collectExactVectorIndexBindings,
  readMediaGlobalVectorAnchor,
};
