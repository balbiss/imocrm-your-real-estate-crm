// Limpa um telefone deixando só digitos e garante o DDI 55 na frente.
export function toDigitsWithDDI(phoneOrJid) {
  const raw = String(phoneOrJid).split("@")[0].split(":")[0];
  let digits = raw.replace(/\D/g, "");
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}

// Gera os dois candidatos possiveis de um numero brasileiro (com e sem o nono
// digito), porque nem todo mundo salva/manda o numero do mesmo jeito.
export function candidateDigits(phoneOrJid) {
  const digits = toDigitsWithDDI(phoneOrJid);
  const candidates = [digits];
  if (digits.length === 13) {
    candidates.push(digits.slice(0, 4) + digits.slice(5)); // remove o 9
  } else if (digits.length === 12) {
    candidates.push(digits.slice(0, 4) + "9" + digits.slice(4)); // adiciona o 9
  }
  return candidates;
}

export function toJid(phoneOrJid) {
  if (String(phoneOrJid).includes("@")) return phoneOrJid;
  return `${toDigitsWithDDI(phoneOrJid)}@s.whatsapp.net`;
}
