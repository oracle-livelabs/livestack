function normalizeSourceId(value) {
  return String(value == null ? '' : value).trim();
}

function validateOrderPlantConsistency(dataset, errors) {
  const workOrders = dataset.tables?.manufacturing_work_orders;
  const orderItems = dataset.tables?.manufacturing_work_order_lines;
  if (!workOrders?.provided || !orderItems?.provided) return;

  const ordersBySourceId = new Map(
    workOrders.rows.map((row) => [normalizeSourceId(row.work_order_id), row])
  );

  for (const item of orderItems.rows) {
    const parent = ordersBySourceId.get(normalizeSourceId(item.work_order_id));
    if (!parent) continue;

    const orderCenter = normalizeSourceId(parent.assigned_plant_id);
    const lineCenter = normalizeSourceId(item.assigned_plant_id);
    if (orderCenter !== lineCenter) {
      errors.push(
        `manufacturing_work_order_lines.csv line ${item.__lineNumber}: "assigned_plant_id" must match ` +
        `manufacturing_work_orders.assigned_plant_id for work order "${item.work_order_id}" (both values may be blank).`
      );
    }
  }
}

function validateShipmentChronology(dataset, errors) {
  const shipments = dataset.tables?.shipments;
  if (!shipments?.provided) return;

  for (const shipment of shipments.rows) {
    const shippedAt = shipment.shipped_at;
    const deliveredAt = shipment.delivered_at;
    if (!(shippedAt instanceof Date) || !(deliveredAt instanceof Date)) continue;
    if (deliveredAt < shippedAt) {
      errors.push(
        `shipments.csv line ${shipment.__lineNumber}: "delivered_at" must not precede "shipped_at".`
      );
    }
  }
}

function validateSpatialCoordinatePairs(dataset, errors) {
  for (const tableName of ['fulfillment_centers', 'customers']) {
    const table = dataset.tables?.[tableName];
    if (!table?.provided) continue;

    for (const row of table.rows) {
      const latitudeMissing = row.latitude == null || row.latitude === '';
      const longitudeMissing = row.longitude == null || row.longitude === '';
      if (latitudeMissing !== longitudeMissing) {
        errors.push(
          `${tableName}.csv line ${row.__lineNumber}: "latitude" and "longitude" must ` +
          'either both be provided or both be blank.'
        );
        continue;
      }
      if (latitudeMissing) continue;

      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        errors.push(
          `${tableName}.csv line ${row.__lineNumber}: "latitude" must be between -90 and 90.`
        );
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        errors.push(
          `${tableName}.csv line ${row.__lineNumber}: "longitude" must be between -180 and 180.`
        );
      }
    }
  }
}

module.exports = {
  validateOrderPlantConsistency,
  validateShipmentChronology,
  validateSpatialCoordinatePairs,
};
