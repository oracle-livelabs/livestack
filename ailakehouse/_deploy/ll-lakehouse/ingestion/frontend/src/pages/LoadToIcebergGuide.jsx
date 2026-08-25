import SilverProcessGuide from './SilverProcessGuide';

const GUIDE = {
  title: 'Load Data to Iceberg Catalog Server',
  description: 'This demo shows how PeakGear can use Oracle Data Transforms to load data into an Apache Iceberg table managed by an external Iceberg Catalog Server, creating a governed lakehouse source for downstream processing.',
  importance: 'icebergCatalogServer',
  markdownUrl: 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/load-to-icerberg/load-to-iceberg.md',
  imageDirectoryUrl: 'https://raw.githubusercontent.com/oracle-livelabs/livestack/refs/heads/main/ailakehouse/load-to-icerberg/images/',
  sourceUrl: 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/load-to-icerberg/load-to-iceberg.md',
  sourceDirectoryUrl: 'https://github.com/oracle-livelabs/livestack/blob/main/ailakehouse/load-to-icerberg/',
  loadingDescription: 'Retrieving the latest Iceberg loading instructions and images.',
  guideLabel: 'LiveLabs load-to-Iceberg guide',
};

export default function LoadToIcebergGuide({ dataTransformsUrl, hasLakehouseConnection, pgPassword }) {
  return (
    <SilverProcessGuide
      dataTransformsUrl={dataTransformsUrl}
      hasLakehouseConnection={hasLakehouseConnection}
      pgPassword={pgPassword}
      guide={GUIDE}
    />
  );
}
