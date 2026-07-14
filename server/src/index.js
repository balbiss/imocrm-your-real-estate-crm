import express from "express";
import cors from "cors";
import { whatsappRouter } from "./routes/whatsapp.js";
import { webhookRouter } from "./routes/webhook.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" })); // audios/imagens em base64 podem ser grandes

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/whatsapp", whatsappRouter);
app.use("/webhooks", webhookRouter);

app.use((err, _req, res, _next) => {
  console.error("Erro nao tratado:", err);
  res.status(500).json({ error: "Erro interno" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`crm-oka-backend ouvindo na porta ${port}`));
