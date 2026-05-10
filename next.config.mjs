/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling pdfjs-dist for server execution — it is ESM-only
  // (5.x) and triggers Object.defineProperty errors when evaluated in Node context
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist", "react-pdf"],
  },
  webpack: (config, { isServer }) => {
    // pdfjs-dist is ESM-only and cannot be evaluated in a Node/webpack context.
    // Stub it out entirely for the server bundle — only the browser bundle uses it
    // via dynamic(() => import("…"), { ssr: false }).
    if (isServer) {
      config.resolve.alias["pdfjs-dist"] = false;
      config.resolve.alias["react-pdf"] = false;
    }
    // canvas is also Node-only; alias it away for the client bundle
    config.resolve.alias.canvas = false;
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "images.metmuseum.org",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "placekitten.com",
      },
    ],
  },
};

export default nextConfig;