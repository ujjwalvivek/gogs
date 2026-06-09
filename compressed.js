const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function getCompressedSizes(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return { raw: 0, gzip: 0, brotli: 0 };
  }

  const content = fs.readFileSync(filePath);
  const raw = content.length;
  const gzip = zlib.gzipSync(content, { level: 9 }).length;
  const brotli = zlib.brotliCompressSync(content, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    },
  }).length;

  return { raw, gzip, brotli };
}

const wasmPath = path.join(
  __dirname,
  "journey-bench",
  "pkg",
  "journey_bench_bg.wasm",
);
const jsGluePath = path.join(
  __dirname,
  "journey-bench",
  "pkg",
  "journey_bench.js",
);
const wasmStats = getCompressedSizes(wasmPath);
const jsStats = getCompressedSizes(jsGluePath);
const tinytsDistDir = path.join(__dirname, "tinyts-bench", "dist", "assets");

let tinytsJsPath = "";
if (fs.existsSync(tinytsDistDir)) {
  const files = fs.readdirSync(tinytsDistDir);
  const jsFile = files.find((f) => f.endsWith(".js"));
  if (jsFile) {
    tinytsJsPath = path.join(tinytsDistDir, jsFile);
  }
}

const tinytsStats = getCompressedSizes(tinytsJsPath);
const bytesData = {
  journey: {
    wasmRawBytes: wasmStats.raw,
    wasmGzipBytes: wasmStats.gzip,
    wasmBrotliBytes: wasmStats.brotli,
    jsGlueRawBytes: jsStats.raw,
    jsGlueGzipBytes: jsStats.gzip,
    jsGlueBrotliBytes: jsStats.brotli,
    totalTransferGzipBytes: wasmStats.gzip + jsStats.gzip,
    totalTransferBrotliBytes: wasmStats.brotli + jsStats.brotli,
  },
  tinyts: {
    bundleRawBytes: tinytsStats.raw,
    bundleGzipBytes: tinytsStats.gzip,
    bundleBrotliBytes: tinytsStats.brotli,
  },
};

const outputFilePath = path.join(__dirname, "bench-data", "src", "bytes.json");
fs.writeFileSync(outputFilePath, JSON.stringify(bytesData, null, 2));
console.log("Successfully updated bytes.json:");
console.log(JSON.stringify(bytesData, null, 2));
