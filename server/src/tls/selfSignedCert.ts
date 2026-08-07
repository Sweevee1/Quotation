import path from "node:path";
import fs from "node:fs";
import { generate } from "selfsigned";
import { logger } from "../logger.js";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// Persisted to DATA_DIR so restarts don't force a fresh click-through-the-warning each time.
export async function ensureSelfSignedCert(dataDir: string, hostname?: string): Promise<{ key: string; cert: string }> {
  const keyPath = path.join(dataDir, "tls-key.pem");
  const certPath = path.join(dataDir, "tls-cert.pem");

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certPath, "utf8") };
  }

  const altNames: { type: 2 | 7; value?: string; ip?: string }[] = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
  ];
  if (hostname && hostname !== "localhost") {
    altNames.push(IPV4_RE.test(hostname) ? { type: 7, ip: hostname } : { type: 2, value: hostname });
  }

  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);

  const pems = await generate([{ name: "commonName", value: hostname || "quotation.local" }], {
    notAfterDate,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [{ name: "subjectAltName", altNames }],
  });

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert);
  logger.info({ keyPath, certPath, hostname }, "Generated self-signed TLS certificate for Twitch OAuth callback");

  return { key: pems.private, cert: pems.cert };
}
