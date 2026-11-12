const catalog = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'catalog');

catalog.demo_products.bulkWrite([
  {
    updateOne: {
      filter: { _id: 101 },
      update: { $set: { product_name: 'Trailhead Daypack', category: 'Packs', unit_price: 89.99 } },
      upsert: true,
    },
  },
  {
    updateOne: {
      filter: { _id: 102 },
      update: { $set: { product_name: 'Summit Insulated Bottle', category: 'Hydration', unit_price: 34.50 } },
      upsert: true,
    },
  },
  {
    updateOne: {
      filter: { _id: 103 },
      update: { $set: { product_name: 'RidgeLine Headlamp', category: 'Lighting', unit_price: 59.00 } },
      upsert: true,
    },
  },
]);
