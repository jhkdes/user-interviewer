/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Chromium makes the report PDF; it must be loaded from node_modules, not bundled.
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    // The bundled browser binary is read at run time, so make sure it ships with the functions.
    outputFileTracingIncludes: {
      "/api/studies/*/job-search-reports/**": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
