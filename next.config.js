/** @type {import('next').NextConfig} */
const nextConfig = {
  // Node-залежності не бандлимо в серверний код
  experimental: {
    serverComponentsExternalPackages: ["isomorphic-git", "html-to-docx"],
  },
};

module.exports = nextConfig;
