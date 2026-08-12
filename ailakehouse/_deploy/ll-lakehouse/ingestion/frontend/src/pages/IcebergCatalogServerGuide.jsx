import { useEffect, useState } from 'react';
import SilverProcessGuide from './SilverProcessGuide';
import { api } from '../utils/api';

const GUIDE = {
  title: 'Add an Iceberg Catalog Server to Data Transforms',
  description: 'This demo shows how to add an Apache Iceberg catalog server to Data Transforms so transformation flows can work with governed Iceberg tables.',
  importance: 'icebergCatalogServer',
  markdownUrl: 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/add-catalog-server/add-catalog-server.md',
  imageDirectoryUrl: 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/add-catalog-server/images/',
  sourceUrl: 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/add-catalog-server/add-catalog-server.md',
  sourceDirectoryUrl: 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/add-catalog-server/',
  loadingDescription: 'Retrieving the latest Iceberg catalog server instructions and images.',
  guideLabel: 'LiveLabs Iceberg catalog server guide',
  fullWidthCredentials: true,
};

export default function IcebergCatalogServerGuide({ dataTransformsUrl, hasLakehouseConnection, pgPassword }) {
  const [config, setConfig] = useState({});

  useEffect(() => {
    let active = true;
    api.icebergCatalog.config()
      .then((response) => {
        if (active) setConfig(response || {});
      })
      .catch(() => {
        if (active) setConfig({});
      });
    return () => { active = false; };
  }, []);

  return (
    <SilverProcessGuide
      dataTransformsUrl={dataTransformsUrl}
      hasLakehouseConnection={hasLakehouseConnection}
      pgPassword={pgPassword || config.password}
      guide={GUIDE}
      extraCredentials={[
        { label: 'REST URL', value: config.restUrl },
        { label: 'OCI Access ID', value: config.accessKeyId },
        { label: 'OCI Secret Key', value: config.secretAccessKey },
      ]}
    />
  );
}
