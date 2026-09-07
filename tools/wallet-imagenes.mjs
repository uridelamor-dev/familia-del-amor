// Genera las imágenes del pase de la wallet a partir del logo de la marca.
//
// SE EJECUTA A MANO Y UNA SOLA VEZ; los PNG resultantes se commitean. En el servidor no se
// convierte nada: `sips` es de macOS y en Replit no existe, y aquí no se pueden añadir
// dependencias npm para redimensionar imágenes (mismo criterio que gallery-import.sh).
//
//   node tools/wallet-imagenes.mjs
//
// Apple exige `icon.png` e `icon@2x.png` — sin ellos rechaza el pase entero, sin decir cuál
// falta. El resto son mejoras: el logo sale arriba del pase, y Google usa `logo@2x.png` como
// `programLogo`.

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(raiz, "..", "public", "assets", "logos",
  "Copia de Logo_proposta_DEL AMOR (1000 x 1000 px) (1920 x 1080 px).png");
const DESTINO = path.join(raiz, "..", "public", "assets", "wallet");

// [fichero, lado en píxeles]. El icono es cuadrado por definición; el logo se escala al alto
// que admite Apple (50 pt) y, como el original es cuadrado, sale cuadrado también.
const MEDIDAS = [
  ["icon.png", 29], ["icon@2x.png", 58], ["icon@3x.png", 87],
  ["logo.png", 50], ["logo@2x.png", 100], ["logo@3x.png", 150],
];

if (!fs.existsSync(ORIGEN)) {
  console.error("No encuentro el logo de origen:", ORIGEN);
  process.exit(1);
}
try { execFileSync("sips", ["--version"], { stdio: "ignore" }); }
catch { console.error("Esto necesita `sips`, que solo está en macOS. Ejecútalo en tu portátil y commitea los PNG."); process.exit(1); }

fs.mkdirSync(DESTINO, { recursive: true });
for (const [nombre, lado] of MEDIDAS) {
  const salida = path.join(DESTINO, nombre);
  execFileSync("sips", ["-s", "format", "png", "-z", String(lado), String(lado), ORIGEN, "--out", salida],
    { stdio: ["ignore", "ignore", "pipe"] });
  console.log(`${nombre.padEnd(14)} ${lado}×${lado}  ${fs.statSync(salida).size} bytes`);
}
console.log("\nListo. Commitea public/assets/wallet/*.png");
