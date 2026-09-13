// Bug conhecido do WAHA/GOWS, ainda aberto sem fix upstream (dez/2025):
// "2 UNKNOWN: no LID found for <numero>@s.whatsapp.net from server" --
// https://github.com/devlikeapro/waha/issues/1714. Comportamento observado
// (nosso teste real de 12/09 + relatos na issue): acontece geralmente na
// PRIMEIRA mensagem pra um número "novo" pra aquela sessão, como se o
// servidor do WhatsApp ainda não tivesse propagado o LID daquele contato.
// Uma segunda tentativa alguns segundos depois resolve na prática em vários
// casos relatados. Sem custo quando não precisa -- só espera se a 1ª falhar
// com esse erro específico.
const ERRO_LID = /no LID found/i;

export async function sendMessageComRetry(provider, jid, messageContent, options, { tentativas = 2, esperaMs = 3000 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await provider.sendMessage(jid, messageContent, options);
    } catch (err) {
      ultimoErro = err;
      const éErroDeLid = ERRO_LID.test(err?.message || "");
      if (i < tentativas - 1 && éErroDeLid) {
        console.warn(`sendMessageComRetry: erro de LID, tentando de novo em ${esperaMs}ms...`);
        await new Promise((r) => setTimeout(r, esperaMs));
        continue;
      }
      throw err;
    }
  }
  throw ultimoErro;
}
