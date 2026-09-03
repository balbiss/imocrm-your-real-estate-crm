// Substituição simples de variáveis {chave} num texto -- mesma ideia do {nome}
// que o WhatsAppChat.tsx já faz no lado do cliente, mas aqui no servidor pro
// motor de follow-up. Case-insensitive na chave; valor vazio some.
export function renderTemplate(texto, vars = {}) {
  if (!texto) return "";
  return String(texto).replace(/\{(\w+)\}/g, (match, chave) => {
    const k = String(chave).toLowerCase();
    const val = vars[k];
    return val === undefined || val === null ? "" : String(val);
  });
}

export function primeiroNome(nomeCompleto) {
  return String(nomeCompleto || "").trim().split(/\s+/)[0] || "";
}
