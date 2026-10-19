import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lorroDir = path.join(root, "resources", "lorro");
const buildDir = path.join(root, "build");

const read = (name) => fs.readFile(path.join(lorroDir, name));

const renderPng = async (input, size, outPath) => {
  await sharp(input)
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(outPath);
};

const buildIcns = async (input, outPath) => {
  const entries = [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
  ];

  const chunks = [];
  for (const [type, size] of entries) {
    const png = await sharp(input)
      .resize(size, size, { fit: "contain" })
      .png()
      .toBuffer();
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  await fs.writeFile(outPath, Buffer.concat([header, body]));
};

const buildInstallerSidebar = async (input, outPath) => {
  const width = 164;
  const height = 314;

  const background = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="${height}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#0A0912"/>
          <stop offset="0.55" stop-color="#16112A"/>
          <stop offset="1" stop-color="#0A0912"/>
        </linearGradient>
        <radialGradient id="halo" cx="0" cy="0" r="1" gradientTransform="translate(82 96) rotate(90) scale(120)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#7C5CF0" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#7C5CF0" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#halo)"/>
      <text x="82" y="244" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="2.4" fill="#F5F3FF">LORRO</text>
      <text x="82" y="264" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="8.5" font-weight="600" letter-spacing="3.4" fill="#A78BFA">LAUNCHER</text>
      <rect x="34" y="278" width="96" height="2" rx="1" fill="#7C5CF0" fill-opacity="0.6"/>
    </svg>
  `);

  const mark = await sharp(input)
    .resize(104, 104, { fit: "contain" })
    .png()
    .toBuffer();

  const composed = await sharp(background)
    .composite([{ input: mark, left: 30, top: 44 }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = composed;
  const rowSize = Math.ceil((info.width * 3) / 4) * 4;
  const pixelDataSize = rowSize * info.height;
  const fileSize = 54 + pixelDataSize;
  const bmp = Buffer.alloc(fileSize);

  bmp.write("BM", 0, 2, "ascii");
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(info.width, 18);
  bmp.writeInt32LE(info.height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(pixelDataSize, 34);
  bmp.writeInt32LE(2835, 38);
  bmp.writeInt32LE(2835, 42);

  const padding = rowSize - info.width * 3;
  for (let y = 0; y < info.height; y += 1) {
    const sourceRow = (info.height - 1 - y) * info.width * 3;
    const targetRow = 54 + y * rowSize;
    for (let x = 0; x < info.width; x += 1) {
      const source = sourceRow + x * 3;
      const target = targetRow + x * 3;
      bmp[target] = data[source + 2];
      bmp[target + 1] = data[source + 1];
      bmp[target + 2] = data[source];
    }
    bmp.fill(0, targetRow + info.width * 3, targetRow + info.width * 3 + padding);
  }

  await fs.writeFile(outPath, bmp);
};

const main = async () => {
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(path.join(buildDir, "icons"), { recursive: true });

  const mark = await read("lorro-mark-master.png");

  await renderPng(mark, 512, path.join(root, "resources", "icon.png"));
  await renderPng(mark, 512, path.join(buildDir, "icon.png"));
  await renderPng(mark, 512, path.join(buildDir, "icons", "512x512.png"));
  await renderPng(mark, 256, path.join(root, "resources", "tray-icon.png"));
  await renderPng(mark, 256, path.join(root, "resources", "tray-icon-dark.png"));

  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    await renderPng(mark, size, path.join(buildDir, "icons", `${size}x${size}.png`));
  }

  const icoBuffers = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map((size) =>
      sharp(mark)
        .resize(size, size, { fit: "contain" })
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(icoBuffers);
  await fs.writeFile(path.join(buildDir, "icon.ico"), ico);
  await fs.writeFile(path.join(root, "resources", "lorro", "lorro.ico"), ico);

  await buildIcns(mark, path.join(buildDir, "icon.icns"));
  await buildInstallerSidebar(mark, path.join(buildDir, "installerSidebar.bmp"));

  console.log("Lorro icon assets generated.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
