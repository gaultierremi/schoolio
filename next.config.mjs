/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist tries to import the native `canvas` module in Node; alias it away
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