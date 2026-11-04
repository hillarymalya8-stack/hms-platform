// Keep build-only tooling out of the server function bundle. Images are served by Netlify
// Image CDN, so sharp is not needed at runtime either. Workspace packages are hoisted to the
// repository root, so each pattern is listed for both locations.
const buildOnlyPackages = [
  "@img/**",
  "sharp/**",
  "@esbuild/**",
  "esbuild/**",
  "typescript/**",
  "terser/**",
  "@prisma/**",
  ".prisma/**",
  "prisma/**"
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingExcludes: {
    "*": buildOnlyPackages.flatMap((pattern) => [`node_modules/${pattern}`, `../../node_modules/${pattern}`])
  }
};

export default nextConfig;
