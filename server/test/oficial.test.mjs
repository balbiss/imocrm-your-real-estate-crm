import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDaMensagem, reservarChave, liberarChave } from "../src/lib/chave.js";
import { normalizeOficialMessage } from "../src/lib/normalizeWhatsapp.js";

// wamid no mesmo formato da Meta: bytes de controle + telefone + ID interno, em base64.
const wamid = (fone, stanza) =>
  "wamid." +
  Buffer.concat([
    Buffer.from([0x1c, 0x18, 0x0c]),
    Buffer.from(fone),
    Buffer.from([0x15, 0x02, 0x00, 0x12, 0x18, 0x14]),
    Buffer.from(stanza),
    Buffer.from([0x00]),
  ]).toString("base64");

// Exemplos reais do banco de produção (formatos do WAHA/Baileys) + wamid da oficial.
export const EXEMPLOS = [
  ["AC2C22BFAFD76ACEB693730696B366CD", "AC2C22BFAFD76ACEB693730696B366CD"],
  ["3EB0EDC054BF339DD97F91", "3EB0EDC054BF339DD97F91"],
  ["3a585f40597b276ef758", "3A585F40597B276EF758"],
  ["false_26371401228327@lid_2A2D45D241C09F96267F", "2A2D45D241C09F96267F"],
  ["false_235759948845259@lid_AC35B2AB791EF87000025425BF0851F5", "AC35B2AB791EF87000025425BF0851F5"],
  ["true_5591981190130@c.us_3EB0AAAABBBBCCCCDDDD11", "3EB0AAAABBBBCCCCDDDD11"],
  [wamid("5591900000001", "3EB0F49D881EA369FDF40B"), "3EB0F49D881EA369FDF40B"],
  [wamid("559181190130", "A5AE6F1EE4F29943E455C29B8FEAEB2A"), "A5AE6F1EE4F29943E455C29B8FEAEB2A"],
  // não dá pra saber a chave -> null (cai só na dedup normal pelo id)
  ["false_123@lid_XYZ", null],
  ["curto123", null],
  ["", null],
  [null, null],
];

test("chaveDaMensagem: mesma chave pra mesma mensagem em todas as vias", () => {
  for (const [id, esperado] of EXEMPLOS) assert.equal(chaveDaMensagem(id), esperado, String(id));
  const st = "3EB0" + "9F".repeat(9);
  assert.equal(chaveDaMensagem(wamid("5591900000001", st)), chaveDaMensagem("false_5591900000001@c.us_" + st));
});

test("reservarChave: só a primeira passa; liberar permite de novo", () => {
  assert.equal(reservarChave("CHAVE_TESTE_1"), true);
  assert.equal(reservarChave("CHAVE_TESTE_1"), false);
  liberarChave("CHAVE_TESTE_1");
  assert.equal(reservarChave("CHAVE_TESTE_1"), true);
});

test("normalizeOficialMessage: texto recebido com nome do perfil", () => {
  const n = normalizeOficialMessage(
    { from: "5591900000001", id: "wamid.X", timestamp: "1", type: "text", text: { body: "Oi" } },
    { nomes: { "5591900000001": "Cliente Um" } }
  );
  assert.equal(n.contactPhone, "5591900000001");
  assert.equal(n.fromMe, false);
  assert.equal(n.pushName, "Cliente Um");
  assert.equal(n.text, "Oi");
  assert.equal(n.media, null);
});

test("normalizeOficialMessage: eco do celular usa o destinatário", () => {
  const n = normalizeOficialMessage(
    { from: "559181190130", to: "5591900000001", id: "wamid.Y", type: "text", text: { body: "Tem sim" } },
    { fromMe: true }
  );
  assert.equal(n.contactPhone, "5591900000001");
  assert.equal(n.fromMe, true);
  assert.equal(n.pushName, null);
});

test("normalizeOficialMessage: mídia vira ref = id da Meta, legenda separada", () => {
  const n = normalizeOficialMessage({
    from: "5591900000001", id: "wamid.Z", type: "image",
    image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "fachada" },
  });
  assert.deepEqual(n.media, { tipo: "image", mimetype: "image/jpeg", fileName: null, caption: "fachada", ref: "MEDIA1" });
  assert.equal(n.text, "");
  const doc = normalizeOficialMessage({
    from: "5591900000001", id: "wamid.D", type: "document",
    document: { id: "M2", mime_type: "application/pdf", filename: "contrato.pdf" },
  });
  assert.equal(doc.media.fileName, "contrato.pdf");
  assert.equal(doc.media.tipo, "document");
  const audio = normalizeOficialMessage({
    from: "5591900000001", id: "wamid.A", type: "audio", audio: { id: "M3", mime_type: "audio/ogg; codecs=opus" },
  });
  assert.equal(audio.media.mimetype, "audio/ogg");
});

test("normalizeOficialMessage: botão, lista, localização e reação", () => {
  const base = { from: "5591900000001", id: "wamid.B" };
  assert.equal(normalizeOficialMessage({ ...base, type: "button", button: { text: "Quero saber mais" } }).text, "Quero saber mais");
  assert.equal(normalizeOficialMessage({ ...base, type: "interactive", interactive: { list_reply: { title: "Casa" } } }).text, "Casa");
  assert.match(
    normalizeOficialMessage({ ...base, type: "location", location: { latitude: -1.4, longitude: -48.5, name: "Praça" } }).text,
    /📍 Praça https:\/\/maps\.google\.com\/\?q=-1\.4,-48\.5/
  );
  const r = normalizeOficialMessage({ ...base, type: "reaction", reaction: { message_id: "wamid.ORIG", emoji: "👍" } });
  assert.deepEqual(r.reaction, { targetId: "wamid.ORIG", emoji: "👍" });
});

test("normalizeOficialMessage: ignora sistema / número estranho", () => {
  assert.equal(normalizeOficialMessage({ from: "5591900000001", id: "x", type: "system" }), null);
  assert.equal(normalizeOficialMessage({ from: "5591900000001", id: "x", type: "unsupported" }), null);
  assert.equal(normalizeOficialMessage({ from: "12345678901234567", id: "x", type: "text", text: { body: "a" } }), null);
  assert.equal(normalizeOficialMessage({ from: "5591900000001", type: "text" }), null);
});
