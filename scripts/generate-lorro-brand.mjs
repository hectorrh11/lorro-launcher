import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lorroDir = path.join(root, "resources", "lorro");
const sourceJpg = path.join(lorroDir, "lorro-logo-source.jpg");
const masterPath = path.join(lorroDir, "lorro-mark-master.png");

const VIOLET = "#8b5cf6";
const VIOLET_SOFT = "#c4b5fd";

const buildMaster = async () => {
  const size = 1024;
  const inset = 112;
  const inner = size - inset * 2;
  const radius = 168;

  const background = Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#181227"/>
          <stop offset="0.5" stop-color="#0A0912"/>
          <stop offset="1" stop-color="#130F20"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.44" r="0.62">
          <stop offset="0" stop-color="${VIOLET}" stop-opacity="0.55"/>
          <stop offset="1" stop-color="${VIOLET}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="240" fill="url(#bg)"/>
      <rect width="${size}" height="${size}" rx="240" fill="url(#glow)"/>
    </svg>
  `);

  const photo = await sharp(sourceJpg)
    .resize(inner, inner, { fit: "cover", position: "center" })
    .modulate({ saturation: 0, brightness: 1.06 })
    .tint(VIOLET)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${inner}" height="${inner}" xmlns="http://www.w3.org/2000/svg"><rect width="${inner}" height="${inner}" rx="${radius}" fill="#fff"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  const border = Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${radius}" fill="none" stroke="${VIOLET_SOFT}" stroke-opacity="0.6" stroke-width="6"/>
    </svg>
  `);

  await sharp(background)
    .composite([
      { input: photo, left: inset, top: inset },
      { input: border, left: 0, top: 0 },
    ])
    .png()
    .toFile(masterPath);

  return await fs.readFile(masterPath);
};

const writeEmbeddedSvg = async (master, outPath, { width, height, imageX, imageY, imageSize, extra = "" }) => {
  const embedded = await sharp(master).resize(256, 256).png().toBuffer();
  const base64 = embedded.toString("base64");
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,${base64}" x="${imageX}" y="${imageY}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet"/>
${extra}</svg>`;
  await fs.writeFile(outPath, svg);
};

const buildHorizontal = async (master) => {
  const width = 720;
  const height = 160;
  const embedded = await sharp(master).resize(256, 256).png().toBuffer();
  const base64 = embedded.toString("base64");
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lorro-word" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${VIOLET_SOFT}"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <image href="data:image/png;base64,${base64}" x="24" y="20" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>
  <text x="168" y="82" font-family="'Space Grotesk','Segoe UI',Arial,sans-serif" font-size="58" font-weight="700" letter-spacing="1" fill="url(#lorro-word)">LORRO</text>
  <text x="170" y="112" font-family="'Space Grotesk','Segoe UI',Arial,sans-serif" font-size="22" font-weight="600" letter-spacing="10" fill="#A78BFA">LAUNCHER</text>
</svg>
`;
  await fs.writeFile(path.join(lorroDir, "lorro-logo-horizontal.svg"), svg);
  await fs.writeFile(path.join(root, "src", "renderer", "src", "assets", "brand", "lorro-logo-horizontal.svg"), svg);
};

const main = async () => {
  const master = await buildMaster();

  await sharp(master)
    .resize(256, 256, { fit: "contain" })
    .png()
    .toFile(path.join(lorroDir, "lorro-mark-256.png"));

  await writeEmbeddedSvg(master, path.join(root, "src", "renderer", "src", "assets", "icons", "lorro.svg"), {
    width: 55,
    height: 49,
    imageX: 3,
    imageY: 0,
    imageSize: 49,
  });

  await buildHorizontal(master);

  console.log("Lorro brand assets generated from lorro-logo-source.jpg.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
