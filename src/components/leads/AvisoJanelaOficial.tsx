import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Modelo, SituacaoConversa, enviarModeloNaConversa, getModelosDaConversa, getSituacaoConversa } from "@/lib/oficial";

// Faixa do chat pra quem tem a API oficial ligada: fora da janela de 24h e sem a conexão por QR
// Code, texto solto não chega -- só modelo aprovado. Com a janela aberta, deixa um atalho discreto
// pra mandar modelo mesmo assim.
export function AvisoJanelaOficial({ leadId, qtdMensagens, abrirModelo, onAbrirModelo }: {
  leadId: string;
  qtdMensagens: number;
  abrirModelo: boolean;
  onAbrirModelo: (aberto: boolean) => void;
}) {
  const [sit, setSit] = useState<SituacaoConversa | null>(null);

  useEffect(() => {
    let vivo = true;
    getSituacaoConversa(leadId)
      .then((r) => vivo && setSit(r))
      .catch(() => vivo && setSit(null));
    return () => {
      vivo = false;
    };
  }, [leadId, qtdMensagens]);

  if (!sit?.oficial) return null;
  const soModelo = !sit.janelaAberta && !sit.naoOficialNoAr;

  return (
    <>
      {soModelo ? (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-800">
          <span className="flex-1">
            Faz mais de 24h que o cliente não escreve. Pela API oficial, agora só dá pra mandar um <b>modelo aprovado</b>.
            Texto solto não chega.
          </span>
          <Button size="sm" className="h-7 text-[11px] shrink-0" onClick={() => onAbrirModelo(true)}>
            Enviar modelo
          </Button>
        </div>
      ) : (
        <div className="px-4 pt-2 text-right">
          <button
            type="button"
            onClick={() => onAbrirModelo(true)}
            className="text-[11px] text-[#54656F] underline hover:text-[#111B21]"
          >
            Enviar modelo da API oficial
          </button>
        </div>
      )}
      {abrirModelo && <EnviarModeloDialog leadId={leadId} nomeSugerido={sit.nomeSugerido || ""} onClose={() => onAbrirModelo(false)} />}
    </>
  );
}

function EnviarModeloDialog({ leadId, nomeSugerido, onClose }: { leadId: string; nomeSugerido: string; onClose: () => void }) {
  const [lista, setLista] = useState<Modelo[] | null>(null);
  const [sel, setSel] = useState<Modelo | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    getModelosDaConversa(leadId)
      .then(setLista)
      .catch((e) => {
        toast.error(e.message);
        setLista([]);
      });
  }, [leadId]);

  const escolher = (m: Modelo) => {
    setSel(m);
    setValores(Array.from({ length: m.variaveis }, (_, i) => (i === 0 ? nomeSugerido : "")));
  };
  const previa = sel ? sel.texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`) : "";

  const enviar = async () => {
    if (!sel) return;
    setEnviando(true);
    try {
      await enviarModeloNaConversa(leadId, sel.nome, sel.idioma, valores);
      toast.success("Modelo enviado");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar modelo</DialogTitle>
          <DialogDescription>Mensagem aprovada pela Meta. Sai pela API oficial do seu WhatsApp e é cobrada pela Meta.</DialogDescription>
        </DialogHeader>
        {!lista && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 text-slate-300 animate-spin" />
          </div>
        )}
        {lista && !lista.length && (
          <p className="text-xs text-slate-500">Nenhum modelo aprovado ainda. O dono ou gerente cria em Integrações › Modelos de mensagem.</p>
        )}
        {!sel ? (
          (lista || []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => escolher(m)}
              className="block w-full text-left border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors"
            >
              <b className="text-xs">{m.nome}</b>
              <span className="block text-xs text-slate-500 mt-1 truncate">{m.texto}</span>
            </button>
          ))
        ) : (
          <div className="space-y-2">
            {valores.map((v, i) => (
              <div key={i}>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {`{{${i + 1}}}`}
                  {i === 0 ? " (normalmente o nome)" : ""}
                </label>
                <Input value={v} onChange={(e) => setValores((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))} className="h-9 text-xs" />
              </div>
            ))}
            <p className="text-[11px] font-bold text-slate-500 pt-2">Como o cliente vai ver</p>
            <div className="rounded-lg bg-[#D9FDD3] p-3 text-[13px] whitespace-pre-wrap leading-snug">
              {sel.cabecalho && <b className="block mb-1">{sel.cabecalho}</b>}
              {previa}
              {sel.rodape && <span className="block mt-1 text-[11px] text-slate-500">{sel.rodape}</span>}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" className="h-9 text-xs" onClick={sel ? () => setSel(null) : onClose}>
            {sel ? "Voltar" : "Fechar"}
          </Button>
          {sel && (
            <Button className="h-9 text-xs" onClick={enviar} disabled={enviando || valores.some((v) => !v.trim())}>
              {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Enviar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
