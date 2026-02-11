export default {
  "*.{ts,tsx,js,jsx}": "biome check --fix",
  "*.{ts,tsx}": () => "tsc --noEmit -p tsconfig.json",
};
