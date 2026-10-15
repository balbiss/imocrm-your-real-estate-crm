// "Chave" de uma mensagem do WhatsApp: o ID interno dela, igual em todas as vias.
// No híbrido (oficial + WAHA/Baileys no MESMO número) a mesma mensagem chega com ids diferentes:
//   oficial:     "wamid.HBgM..."   (base64 que carrega o ID interno)
//   WAHA/Baileys: "3EB0F49D881E..." ou "false_2637...@lid_2A2D45D241C0..."
// A chave é a mesma nas duas -- é ela que impede a mensagem de entrar 2x.
// Mesma regra da função SQL public.wa_chave_de (migração 20261015000000_whatsapp_oficial.sql).
const HEX = /[0-9A-F]{16,64}/gi;

export function chaveDaMensagem(id) {
  if (!id) return null;
  const s = String(id);
  if (s.startsWith("wamid.")) {
    let fonte;
    try {
      fonte = Buffer.from(s.slice(6).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    } catch {
      return null;
    }
    const achados = fonte.match(HEX);
    return achados ? achados[achados.length - 1].toUpperCase() : null;
  }
  const fim = s.slice(s.lastIndexOf("_") + 1);
  return /^[0-9A-F]{16,64}$/i.test(fim) ? fim.toUpperCase() : null;
}

// Mensagens que este processo já está processando (chave -> quando). A mesma mensagem recebida
// chega pela oficial e pela não oficial quase juntas: sem isso as duas criariam o lead ao mesmo
// tempo. O backend roda numa instância só, então a memória basta.
const reservadas = new Map();
const VALIDADE_MS = 5 * 60 * 1000;

export function reservarChave(chave) {
  const agora = Date.now();
  for (const [k, t] of reservadas) if (agora - t > VALIDADE_MS) reservadas.delete(k);
  if (reservadas.has(chave)) return false;
  reservadas.set(chave, agora);
  return true;
}

// Processamento falhou no meio: libera pra uma nova tentativa da Meta/WAHA não ser ignorada.
export function liberarChave(chave) {
  reservadas.delete(chave);
}
