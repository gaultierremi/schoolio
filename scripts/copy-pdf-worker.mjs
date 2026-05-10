import { copyFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(
  join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  join(root, "public/pdf.worker.min.mjs"),
);

console.log("✓ pdf.worker.min.mjs copied to public/");
