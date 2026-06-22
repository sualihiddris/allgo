const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Distinct from apps/customer's cacheVersion: without this, Metro's shared
// %TEMP%\metro-cache can collide between the two apps because they have
// identical relative file paths (e.g. src/app/(main)/home.tsx), causing
// one dev server to serve the other app's compiled bundle.
config.cacheVersion = "allgo-driver";

module.exports = config;
