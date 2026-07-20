import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function functionBody(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `Missing ${functionName}`);

  const braceStart = source.indexOf("{", start);
  assert(braceStart >= 0, `Missing body for ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }

  throw new Error(`Unclosed body for ${functionName}`);
}

const publicActions = read("src/app/r/actions.ts");
const nextConfig = read("next.config.ts");

assert(publicActions.includes("restaurantId: z.string().uuid()"), "Public order schema must require restaurantId UUIDs.");
assert(!publicActions.includes("getOrCreatePublicOrderSettings"), "Public checkout must not create restaurant settings.");

const settingsReader = functionBody(publicActions, "getPublicOrderSettings");
assert(!settingsReader.includes(".upsert("), "Public settings reader must not upsert settings.");
assert(settingsReader.includes("createAdminClient()"), "Public settings reader should have server-side fallback while RLS is private.");
assert(settingsReader.includes(".eq(\"restaurant_id\", restaurantId)"), "Public settings reader must scope by restaurant_id.");

assert(publicActions.includes("function validatePublicRestaurant"), "Missing public restaurant ownership validation.");
assert(publicActions.includes(".eq(\"slug\", restaurantSlug)"), "Restaurant validation must bind slug to restaurantId.");
assert(publicActions.includes(".eq(\"status\", \"active\")"), "Restaurant validation must require active restaurants.");
assert(publicActions.includes("function validatePublicTable"), "Missing public table ownership validation.");
assert(publicActions.includes(".eq(\"restaurant_id\", restaurantId)"), "Table validation must bind table to restaurantId.");
assert(publicActions.includes("error=invalid-restaurant"), "Missing invalid-restaurant failure path.");
assert(publicActions.includes("error=invalid-table"), "Missing invalid-table failure path.");

for (const header of [
  "Content-Security-Policy",
  "Referrer-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Permissions-Policy",
  "Strict-Transport-Security",
]) {
  assert(nextConfig.includes(header), `Missing security header: ${header}`);
}

assert(nextConfig.includes("frame-ancestors 'self'"), "CSP must restrict frame ancestors.");
assert(nextConfig.includes("object-src 'none'"), "CSP must disable object embedding.");
assert(!nextConfig.includes("productionBrowserSourceMaps: true"), "Production browser source maps must not be enabled.");

console.log("Security regression checks passed.");
