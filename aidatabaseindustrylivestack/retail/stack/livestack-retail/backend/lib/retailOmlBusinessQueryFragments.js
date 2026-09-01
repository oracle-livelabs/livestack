'use strict';

const LATEST_DEMAND_FORECAST_JOIN_SQL = `
    LEFT JOIN (
      SELECT *
      FROM (
        SELECT forecast_rows.*,
               ROW_NUMBER() OVER (
                 PARTITION BY forecast_rows.product_id
                 ORDER BY
                   CASE WHEN forecast_rows.forecast_date >= TRUNC(SYSDATE) THEN 0 ELSE 1 END,
                   CASE WHEN forecast_rows.forecast_date >= TRUNC(SYSDATE) THEN forecast_rows.forecast_date END ASC NULLS LAST,
                   forecast_rows.forecast_date DESC,
                   forecast_rows.social_factor DESC,
                   forecast_rows.forecast_id DESC
               ) AS forecast_rank
        FROM demand_forecasts forecast_rows
      )
      WHERE forecast_rank = 1
    ) df ON p.product_id = df.product_id`;

module.exports = {
  LATEST_DEMAND_FORECAST_JOIN_SQL,
};
