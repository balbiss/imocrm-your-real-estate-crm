import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { whatsappRouter } from "./routes/whatsapp.js";
import { webhookRouter } from "./routes/webhook.js";
import { pushRouter } from "./routes/push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" })); // audios/imagens em base64 podem ser grandes

app.get("/health", (_req, res) => res.json({ ok: true }));

// O TanStack Start (frontend) roda num Cloudflare Worker que nao repassa
// arquivos estaticos fora de /assets — entao o service worker, manifest e
// icones do PWA sao servidos por aqui. O header Service-Worker-Allowed
// deixa o sw.js (hospedado em /backend/sw.js) controlar o site inteiro
// (escopo "/"), nao so o proprio path onde ele foi servido.
app.get("/sw.js", (_req, res) => {
  res.set("Service-Worker-Allowed", "/");
  res.set("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "../public/sw.js"));
});
app.get("/manifest.webmanifest", (_req, res) => {
  res.set("Content-Type", "application/manifest+json");
  res.sendFile(path.join(__dirname, "../public/manifest.webmanifest"));
});
app.use(express.static(path.join(__dirname, "../public")));

app.use("/api/whatsapp", whatsappRouter);
app.use("/api/push", pushRouter);
app.use("/webhooks", webhookRouter);

app.use((err, _req, res, _next) => {
  console.error("Erro nao tratado:", err);
  res.status(500).json({ error: "Erro interno" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`crm-oka-backend ouvindo na porta ${port}`));
