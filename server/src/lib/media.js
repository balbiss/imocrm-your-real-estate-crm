import { randomUUID } from "crypto";
import { supabaseAdmin } from "../supabase.js";

const EXT_BY_MIME_FALLBACK = "bin";

// Sobe bytes crus pro bucket whatsapp_media e devolve a URL publica, igual a
// Edge Function whatsapp-webhook antiga fazia.
export async function uploadWhatsappMedia(buffer, mimetype, originalFileName) {
  const ext = originalFileName?.includes(".")
    ? originalFileName.split(".").pop()
    : mimetype?.split("/")?.[1]?.split(";")?.[0] || EXT_BY_MIME_FALLBACK;

  const safeFileName = originalFileName
    ? `${randomUUID()}_${originalFileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`
    : `${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("whatsapp_media")
    .upload(safeFileName, buffer, { contentType: mimetype, upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabaseAdmin.storage.from("whatsapp_media").getPublicUrl(safeFileName);
  return data.publicUrl;
}
