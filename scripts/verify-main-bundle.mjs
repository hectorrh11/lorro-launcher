import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mainOutputPath = path.resolve("out/main");

if (!fs.existsSync(mainOutputPath)) {
  console.error("out/main is missing. Run `electron-vite build` first.");
  process.exit(1);
}

const shimMarker = "// -- CommonJS Shims --";
const failures = [];

const chunks = fs
  .readdirSync(mainOutputPath)
  .filter((file) => file.endsWith(".js"));

for (const chunk of chunks) {
  const filePath = path.join(mainOutputPath, chunk);
  const code = fs.readFileSync(filePath, "utf8");

  try {
    execFileSync(process.execPath, ["--check", filePath], {
      stdio: "pipe",
    });
  } catch (error) {
    const details = String(error.stderr ?? error.message)
      .split("\n")
      .slice(0, 6)
      .join("\n");
    failures.push(`${chunk} is not valid JavaScript:\n${details}`);
  }

  const shimCount = code.split(shimMarker).length - 1;
  if (shimCount > 1) {
    failures.push(`${chunk} contains ${shimCount} CommonJS shims`);
  }

  if (shimCount === 1) {
    const shimLine = code.slice(0, code.indexOf(shimMarker)).split("\n").length;
    if (shimLine > 120) {
      failures.push(
        `${chunk} has its CommonJS shim at line ${shimLine}, far from the import block`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`Verified ${chunks.length} main chunks.`);
