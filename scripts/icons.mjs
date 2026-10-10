import sharp from "sharp";
import { mkdir, access } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
let input = "public/logo.png";
try {
  await access(input);
} catch {
  input = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#0F0B09"/><text x="256" y="270" text-anchor="middle" fill="#C8691A" font-size="90" font-family="sans-serif">7 ★</text></svg>',
  );
  console.warn(
    "Logo ausente: usando placeholder. Adicione public/logo.png e execute npm run icons.",
  );
}
for (const size of [192, 512])
  await sharp(input)
    .resize(size, size, { fit: "contain", background: "#0F0B09" })
    .png()
    .toFile(`public/icons/icon-${size}.png`);
const inset = await sharp(input)
  .resize(320, 320, { fit: "contain", background: "#0F0B09" })
  .png()
  .toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#0F0B09" },
})
  .composite([{ input: inset, gravity: "center" }])
  .png()
  .toFile("public/icons/maskable-512.png");
await sharp(input)
  .resize(180, 180, { fit: "contain", background: "#0F0B09" })
  .png()
  .toFile("public/icons/apple-touch-icon.png");
await sharp(input)
  .resize(32, 32, { fit: "contain", background: "#0F0B09" })
  .png()
  .toFile("public/icons/favicon.png");
console.log("Ícones gerados a partir da logo.");
