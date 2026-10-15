import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { whatsappRouter } from "./routes/whatsapp.js";
import { webhookRouter } from "./routes/webhook.js";
import { pushRouter } from "./routes/push.js";
import { automacaoRouter } from "./routes/automacao.js";
import { mcpRouter } from "./routes/mcp.js";
import { whatsappOficialRouter, oficialWebhook, oficialWebhookVerificacao } from "./routes/whatsappOficial.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
// anexos de template (video/documento) em base64 podem passar de 25mb. rawBody: o webhook da API
// oficial confere a assinatura da Meta em cima do corpo original.
app.use(
  express.json({
    limit: "80mb",
    verify: (req, _res, buf) => {
      if (req.url.startsWith("/webhooks/oficial")) req.rawBody = buf;
    },
  })
);

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
app.use("/api/whatsapp-oficial", whatsappOficialRouter);
app.use("/api/push", pushRouter);
// API oficial: a Meta manda pro hub InoovaWeb, que repassa só os números deste CRM.
app.get("/webhooks/oficial", oficialWebhookVerificacao);
app.post("/webhooks/oficial", oficialWebhook);
app.use("/webhooks", webhookRouter);
app.use("/automacao", automacaoRouter);
// Conector do Claude (MCP + login OAuth) — ver routes/mcp.js
app.use(mcpRouter);

app.use((err, _req, res, _next) => {
  console.error("Erro nao tratado:", err);
  res.status(500).json({ error: "Erro interno" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`crm-oka-backend ouvindo na porta ${port}`));
