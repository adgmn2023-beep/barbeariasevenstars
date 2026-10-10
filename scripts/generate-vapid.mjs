import { readFile, writeFile } from "node:fs/promises";
import webpush from "web-push";
let env;
try {
  env = await readFile(".env.local", "utf8");
} catch {
  env = await readFile(".env.example", "utf8");
}
if (/^VAPID_PRIVATE_KEY=.+$/m.test(env))
  throw new Error(
    "Já existem chaves VAPID em .env.local. Não serão substituídas.",
  );
const keys = webpush.generateVAPIDKeys();
for (const [key, value] of [
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey],
  ["VAPID_PRIVATE_KEY", keys.privateKey],
]) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  env = pattern.test(env)
    ? env.replace(pattern, `${key}=${value}`)
    : `${env}\n${key}=${value}\n`;
}
await writeFile(".env.local", env);
console.log(
  "Chaves VAPID gravadas em .env.local, sem exibição dos segredos. Configure um VAPID_SUBJECT real e copie as variáveis para a Vercel.",
);
