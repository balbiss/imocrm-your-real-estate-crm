// Endpoint chamado pelo motor de follow-up no n8n. Auth por ?secret= (igual aos
// webhooks), NÃO por JWT -- o n8n não tem sessão de usuário. Recebe uma linha
// de followup_proximo_lote(), manda a mensagem pelo WhatsApp do corretor
// (WAHA/Baileys via providerFor), grava em mensagens_whatsapp com canal
// 'followup' e chama followup_registrar_envio pra avançar a sequência.
import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";
import { providerFor } from "../whatsappProvider.js";
import { checkSecret } from "../lib/webhookSecret.js";
import { renderTemplate, primeiroNome } from "../lib/template.js";
import { sendMessageComRetry } from "../lib/sendComRetry.js";

export const automacaoRouter = Router();

// Baixa o anexo (imagem/vídeo/pdf do criativo da campanha, subido no Supabase
// Storage pela tela de Follow-ups) e devolve em base64 pro formato que
// provider.sendMessage já espera (mesmo shape usado pro chat manual). Falha
// de download não pode travar o follow-up -- cai pra texto puro nesse caso.
async function baixarAnexoBase64(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.toString("base64");
  } catch (err) {
    console.error("Falha ao baixar anexo do follow-up:", err.message);
    return null;
  }
}

const CAMPO_WAHA_POR_TIPO = { imagem: "image", video: "video", documento: "document" };
const TIPO_MENSAGEM_POR_ANEXO = { imagem: "image", video: "video", documento: "document" };

// Solta a reserva do lote quando este envio não acontece (sem conexão,
// reivindicação recusada) -- senão o corretor fica 15min contado como
// "envio em voo" no followup_proximo_lote e nada dele sai nesse intervalo.
async function liberarReserva(execucaoId) {
  await supabaseAdmin.from("followup_execucoes").update({ reservado_em: null }).eq("id", execucaoId);
}

automacaoRouter.post("/followup/enviar", async (req, res) => {
  if (!checkSecret(req, res)) return;

  try {
    const {
      execucao_id,
      lead_id,
      corretor_id,
      imobiliaria_id,
      telefone,
      telefone_alternativo,
      passo_ordem,
      conteudo,
      lead_nome,
      lead_origem,
      corretor_nome,
      anexo_url,
      anexo_tipo,
      anexo_nome,
      anexo_mimetype,
    } = req.body || {};

    if (!execucao_id || !lead_id || !corretor_id || !telefone || (!conteudo && !anexo_url)) {
      return res.status(400).json({ error: "payload incompleto" });
    }

    // Instância do corretor dono do lead.
    const { data: instance } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .eq("user_id", corretor_id)
      .maybeSingle();

    if (!instance?.phone_number || !instance.connected) {
      // Não é erro -- a execução fica pra próxima passada do motor.
      await liberarReserva(execucao_id);
      return res.json({ skipped: "sem_conexao" });
    }

    const provider = providerFor(instance);

    // Imóvel casado pela referência do anúncio (mesmo texto de leads.origem) --
    // pedido do dono (12/09) pra não precisar subir a imagem do criativo na
    // mão em cada fluxo: cadastra o imóvel uma vez com essa referência e o
    // follow-up puxa foto/título/descrição/preço sozinho.
    let imovel = null;
    if (lead_origem && imobiliaria_id) {
      const { data } = await supabaseAdmin
        .from("imoveis")
        .select("titulo, descricao, preco, fotos")
        .eq("imobiliaria_id", imobiliaria_id)
        .eq("referencia_anuncio", lead_origem)
        .maybeSingle();
      imovel = data || null;
    }

    // {imovel_foto} não é texto -- é sinal pra anexar a foto de capa do
    // imóvel casado. Tira o token (e a quebra de linha ao redor) ANTES de
    // renderizar o resto das variáveis normais.
    const pedeFotoImovel = /\{imovel_foto\}/i.test(conteudo || "");
    const conteudoSemTokenFoto = (conteudo || "").replace(/\n?\s*\{imovel_foto\}\s*\n?/gi, "\n").trim();

    const texto = conteudoSemTokenFoto
      ? renderTemplate(conteudoSemTokenFoto, {
          nome: primeiroNome(lead_nome),
          corretor: corretor_nome || "",
          origem: lead_origem || "",
          bairro: "",
          imovel_titulo: imovel?.titulo || "",
          imovel_descricao: imovel?.descricao || "",
          imovel_preco: imovel?.preco
            ? Number(imovel.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : "",
        })
      : "";

    let jid = await provider.resolveJid(telefone);
    if (!jid && telefone_alternativo) {
      jid = await provider.resolveJid(telefone_alternativo);
    }
    if (!jid) {
      // Pode ser número fora do WhatsApp OU sessão WAHA momentaneamente fora
      // do ar -- por isso reaproveita o MESMO mecanismo de 3 tentativas do
      // erro de envio (followup_registrar_erro), em vez de escalar na
      // primeira falha: se for só a sessão temporariamente fora do ar, some
      // sozinho na próxima passada (tentativas_erro zera a cada envio OK);
      // se for número que realmente não tem WhatsApp, na 3ª falha avisa
      // corretor + dono/gerente (pedido real: "número sem WhatsApp" ficava
      // tentando pra sempre, escondido, sem avisar ninguém).
      await supabaseAdmin.rpc("followup_registrar_erro", {
        p_execucao_id: execucao_id,
        p_erro: "número não encontrado no WhatsApp (ou conexão momentaneamente fora do ar)",
      });
      return res.json({ skipped: "jid_nao_resolvido" });
    }

    // Anexo a mandar: o que o corretor subiu na mão no passo (prioridade) OU,
    // se o texto pedir {imovel_foto} e não tiver anexo manual, a foto de capa
    // do imóvel casado pela campanha.
    let urlAnexoFinal = anexo_url || null;
    let tipoAnexoFinal = anexo_tipo || null;
    let mimetypeAnexoFinal = anexo_mimetype || null;
    let nomeAnexoFinal = anexo_nome || null;
    if (!urlAnexoFinal && pedeFotoImovel && imovel?.fotos?.[0]) {
      urlAnexoFinal = imovel.fotos[0];
      tipoAnexoFinal = "imagem";
      nomeAnexoFinal = "foto-imovel.jpg";
    }

    // Baixa o anexo (criativo da campanha ou foto do imóvel) e manda junto,
    // com o texto como legenda. Falha no download cai pra texto puro em vez
    // de travar o follow-up.
    let anexoBase64 = null;
    if (urlAnexoFinal) anexoBase64 = await baixarAnexoBase64(urlAnexoFinal);

    const campoWaha = urlAnexoFinal && anexoBase64 ? CAMPO_WAHA_POR_TIPO[tipoAnexoFinal] || "document" : null;
    const messageContent = campoWaha
      ? { [campoWaha]: anexoBase64, mimetype: mimetypeAnexoFinal || undefined, fileName: nomeAnexoFinal || undefined, caption: texto || undefined }
      : { text: texto };

    // Reivindica (execução, passo) IMEDIATAMENTE antes de mandar: só um
    // chamador por passo recebe "ok". Bug real 21-22/09: passadas do motor
    // que se sobrepõem mandavam o mesmo passo 2x, e o 2º contava como o
    // passo seguinte (40 leads descartados antes da hora). Também reconfere
    // se o cliente respondeu / corretor falou / lead mudou de mãos desde o lote.
    const { data: reivindicacao, error: reivErr } = await supabaseAdmin.rpc("followup_reivindicar_envio", {
      p_execucao_id: execucao_id,
      p_passo_ordem: passo_ordem,
    });
    if (reivErr || reivindicacao !== "ok") {
      if (reivErr) console.error("followup_reivindicar_envio falhou:", reivErr.message);
      await liberarReserva(execucao_id);
      return res.json({ skipped: reivErr ? "reivindicacao_falhou" : reivindicacao });
    }

    let result;
    try {
      result = await sendMessageComRetry(provider, jid, messageContent);
    } catch (sendErr) {
      // Falha de verdade no envio (ex: bug conhecido do WAHA/GOWS "no LID
      // found" -- https://github.com/devlikeapro/waha/issues/1714, sem fix
      // upstream). Sem isso, ficaria tentando de novo pra sempre escondido.
      // followup_registrar_erro já desiste na 3ª tentativa e avisa o
      // corretor + dono/gerente.
      console.error("Falha ao enviar follow-up:", sendErr.message);
      await supabaseAdmin.rpc("followup_registrar_erro", {
        p_execucao_id: execucao_id,
        p_erro: sendErr.message?.slice(0, 500) || "erro desconhecido no envio",
      });
      return res.json({ erro_registrado: true, detail: sendErr.message });
    }
    const messageId = result?.data?.key?.id || null;

    // Mesma convenção já usada pelo Chat manual pra anexo (WhatsAppChat.tsx):
    // "[Anexo]: <url>\n<legenda>" -- é isso que a tela de conversa procura
    // pra renderizar a miniatura em vez de texto puro.
    const conteudoSalvo = campoWaha
      ? `[Anexo]: ${urlAnexoFinal}${texto ? `\n${texto}` : ""}`
      : texto;
    const tipoSalvo = campoWaha ? TIPO_MENSAGEM_POR_ANEXO[tipoAnexoFinal] || "document" : "text";

    // Grava a mensagem no fio (mesmo padrão do webhook: upsert idempotente pelo
    // whatsapp_message_id). canal='followup' -> o chat mostra com selo 🤖 e o
    // followup_proximo_lote NÃO conta isso como "corretor assumiu".
    let mensagemWhatsappId = null;
    if (messageId) {
      const { data: msgRow } = await supabaseAdmin
        .from("mensagens_whatsapp")
        .upsert(
          {
            lead_id,
            imobiliaria_id: imobiliaria_id || null,
            corretor_id,
            conteudo: conteudoSalvo,
            direcao: "outbound",
            status: "sent",
            whatsapp_message_id: messageId,
            tipo: tipoSalvo,
            canal: "followup",
            lida: true,
            metadata: { followup: true, passo: passo_ordem },
          },
          { onConflict: "whatsapp_message_id", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      mensagemWhatsappId = msgRow?.id || null;
    }

    // Avança a sequência (registra followup_envios + agenda o próximo passo ou
    // conclui). Feito aqui no backend -- se o n8n cair depois do envio, não
    // re-manda na próxima passada.
    const { error: rpcError } = await supabaseAdmin.rpc("followup_registrar_envio", {
      p_execucao_id: execucao_id,
      p_whatsapp_message_id: messageId,
      p_conteudo: texto,
      p_mensagem_whatsapp_id: mensagemWhatsappId,
      p_passo_ordem: passo_ordem,
    });
    if (rpcError) {
      console.error("followup_registrar_envio falhou:", rpcError.message);
      return res.status(500).json({ error: "registro_falhou", detail: rpcError.message });
    }

    await supabaseAdmin
      .from("leads")
      .update({ ultima_acao_at: new Date().toISOString() })
      .eq("id", lead_id);

    res.json({ success: true, whatsapp_message_id: messageId });
  } catch (err) {
    console.error("Erro no envio de follow-up:", err);
    res.status(500).json({ error: err.message });
  }
});
