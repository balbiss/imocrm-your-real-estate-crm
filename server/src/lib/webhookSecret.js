// Checagem do ?secret= usada tanto pelos webhooks (WAHA / Baileys) quanto pelo
// endpoint de automação chamado pelo n8n. Responde 401 e retorna false quando
// o segredo não bate.
export function checkSecret(req, res) {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Segredo do webhook invalido" });
    return false;
  }
  return true;
}
