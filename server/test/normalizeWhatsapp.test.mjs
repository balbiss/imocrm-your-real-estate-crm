// node --test server/test/normalizeWhatsapp.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBaileysMessage,
  normalizeWahaMessage,
} from "../src/lib/normalizeWhatsapp.js";

test("baileys: mensagem de texto simples", () => {
  const n = normalizeBaileysMessage({
    key: { remoteJid: "5511999998888@s.whatsapp.net", id: "ABC123", fromMe: false },
    pushName: "Fulano",
    message: { conversation: "Oi, tudo bem?" },
  });
  assert.equal(n.sourceId, "ABC123");
  assert.equal(n.contactPhone, "5511999998888");
  assert.equal(n.fromMe, false);
  assert.equal(n.pushName, "Fulano");
  assert.equal(n.text, "Oi, tudo bem?");
  assert.equal(n.media, null);
  assert.equal(n.isGroup, false);
});

test("baileys: grupo e' sinalizado", () => {
  const n = normalizeBaileysMessage({
    key: { remoteJid: "123-456@g.us", id: "X" },
  });
  assert.equal(n.isGroup, true);
});

test("baileys: @lid usa o remoteJidAlt", () => {
  const n = normalizeBaileysMessage({
    key: {
      remoteJid: "99999@lid",
      remoteJidAlt: "5511988887777@s.whatsapp.net",
      id: "L1",
    },
    message: { extendedTextMessage: { text: "via lid" } },
  });
  assert.equal(n.contactPhone, "5511988887777");
  assert.equal(n.text, "via lid");
});

test("baileys: imagem vira media com ref = id da mensagem", () => {
  const n = normalizeBaileysMessage({
    key: { remoteJid: "5511999998888@s.whatsapp.net", id: "IMG1" },
    message: { imageMessage: { mimetype: "image/jpeg", caption: "olha isso" } },
  });
  assert.equal(n.media.tipo, "image");
  assert.equal(n.media.mimetype, "image/jpeg");
  assert.equal(n.media.ref, "IMG1");
  assert.equal(n.media.caption, "olha isso");
});

test("baileys: reacao", () => {
  const n = normalizeBaileysMessage({
    key: { remoteJid: "5511999998888@s.whatsapp.net", id: "R1" },
    message: { reactionMessage: { key: { id: "ALVO" }, text: "👍" } },
  });
  assert.deepEqual(n.reaction, { targetId: "ALVO", emoji: "👍" });
});

test("waha: mensagem de texto recebida", () => {
  const n = normalizeWahaMessage({
    id: "true_5511999998888@c.us_AAA",
    from: "5511999998888@c.us",
    to: "5512991410042@c.us",
    fromMe: false,
    body: "Bom dia",
    hasMedia: false,
    notifyName: "Cliente WAHA",
  });
  assert.equal(n.sourceId, "true_5511999998888@c.us_AAA");
  assert.equal(n.contactPhone, "5511999998888");
  assert.equal(n.fromMe, false);
  assert.equal(n.pushName, "Cliente WAHA");
  assert.equal(n.text, "Bom dia");
  assert.equal(n.media, null);
});

test("waha: fromMe usa o campo 'to' como contato", () => {
  const n = normalizeWahaMessage({
    id: "X",
    from: "5512991410042@c.us",
    to: "5511999998888@c.us",
    fromMe: true,
    body: "resposta do corretor pelo celular",
  });
  assert.equal(n.contactPhone, "5511999998888");
  assert.equal(n.fromMe, true);
});

test("waha: grupo sinalizado", () => {
  const n = normalizeWahaMessage({ id: "G", from: "123@g.us", fromMe: false });
  assert.equal(n.isGroup, true);
});

test("waha: midia com URL vira media com ref = URL", () => {
  const n = normalizeWahaMessage({
    id: "M1",
    from: "5511999998888@c.us",
    fromMe: false,
    body: "legenda",
    hasMedia: true,
    media: {
      url: "https://waha-oka.inoovaweb.cloud/api/files/M1.oga",
      mimetype: "audio/ogg; codecs=opus",
      filename: null,
    },
  });
  assert.equal(n.media.tipo, "audio");
  assert.equal(n.media.ref, "https://waha-oka.inoovaweb.cloud/api/files/M1.oga");
  assert.equal(n.media.caption, "legenda");
  assert.equal(n.text, ""); // texto vazio quando e' midia (a legenda vai no caption)
});

test("waha: payload sem id e' descartado", () => {
  assert.equal(normalizeWahaMessage({ from: "x@c.us" }), null);
});
