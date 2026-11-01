// Builds mobile/www, the copy of the website that goes inside the iOS app.
// The website in frontend/ is never changed: only this copy gets the server address.
//
//   MAEEN_API_URL=https://maeen-app.com npm run build:web
//
// Capacitor answers every address without a file extension (/signin/, /contracts/)
// with www/index.html, so that one page must work for every route:
// - the fixed data-maeen-page="landing" is removed, so app.js picks the page from the address;
// - styles, script and icons use absolute paths, so they load from any address;
// - window.MAEEN_API_URL points the app at the server, because Capacitor serves the app
//   from capacitor://localhost and app.js would otherwise call http://127.0.0.1:8000.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "frontend");
const target = join(here, "..", "www");

const apiUrl = (process.env.MAEEN_API_URL || "").trim().replace(/\/+$/, "");
if (!/^https:\/\/[^/\s"'<>]+$/.test(apiUrl)) {
  console.error("Set MAEEN_API_URL to the server's https address, for example https://maeen-app.com");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

const indexPath = join(target, "index.html");
let html = readFileSync(indexPath, "utf8");
const replacements = [
  [' data-maeen-page="landing"', ""],
  ['href="icons/apple-touch-icon.png"', 'href="/icons/apple-touch-icon.png"'],
  ['href="styles.css"', 'href="/styles.css"'],
  ['<script defer src="app.js"></script>', `<script>window.MAEEN_API_URL = ${JSON.stringify(apiUrl)};</script>\n    <script defer src="/app.js"></script>`],
];
for (const [from, to] of replacements) {
  if (!html.includes(from)) {
    console.error(`frontend/index.html changed: could not find ${from}`);
    process.exit(1);
  }
  html = html.replace(from, to);
}
writeFileSync(indexPath, html);

if (!existsSync(join(target, "app.js"))) {
  console.error("frontend/app.js is missing");
  process.exit(1);
}
console.log(`mobile/www is ready (server: ${apiUrl})`);
