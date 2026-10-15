/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Ensure data files like nss_index.json are bundled properly
  serverExternalPackages: [],
};

module.exports = nextConfig;
