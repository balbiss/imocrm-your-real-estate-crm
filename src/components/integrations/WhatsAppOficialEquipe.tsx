import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BadgeCheck, Loader2, RefreshCw, FileText, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  ConfigOficial,
  MembroEquipe,
  Modelo,
  apagarModelo,
  cadastroIncorporado,
  conectarOficial,
  criarModelo,
  desligarOficial,
  formatarNumero,
  getConfigOficial,
  getEquipe,
  getModelos,
} from "@/lib/oficial";

const ROTULO_PAPEL: Record<string, string> = { dono: "Dono", gerente: "Gerente", corretor: "Corretor" };

// Painel do dono/gerente: liga/desliga a API oficial do WhatsApp de cada pessoa da equipe e
// cuida dos modelos de mensagem (aprovados pela Meta).
export function WhatsAppOficialEquipe() {
  const [cfg, setCfg] = useState<ConfigOficial | null>(null);
  const [equipe, setEquipe] = useState<MembroEquipe[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [desligando, setDesligando] = useState<MembroEquipe | null>(null);
  const [modelosAberto, setModelosAberto] = useState(false);

  const carregar = () =>
    getEquipe()
      .then(setEquipe)
      .catch((e) => toast.error(e.message));

  useEffect(() => {
    getConfigOficial().then(setCfg);
    carregar();
  }, []);

  const ligar = async (m: MembroEquipe) => {
    if (!cfg?.configurado) return;
    setOcupado(m.userId);
    try {
      const cadastro = await cadastroIncorporado(cfg);
      const r = await conectarOficial(m.userId, cadastro);
      toast.success(
        r.avisoSync
          ? `API oficial ligada, mas: ${r.avisoSync}`
          : `API oficial ligada no WhatsApp de ${m.nome}! Peça pra deixar o WhatsApp Business aberto no celular por alguns minutos.`
      );
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Não deu pra ligar a API oficial");
    } finally {
      setOcupado(null);
    }
  };

  const confirmarDesligar = async () => {
    if (!desligando) return;
    const m = desligando;
    setDesligando(null);
    setOcupado(m.userId);
    try {
      await desligarOficial(m.userId);
      toast.success(`API oficial desligada de ${m.nome}.`);
      carregar();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const algumaLigada = !!equipe?.some((m) => m.oficial?.ativa);

  return (
    <Card className="border-none shadow-soft bg-white md:col-span-2">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-50">
              <BadgeCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-saas-sm font-bold text-slate-700">WhatsApp API oficial da equipe</h3>
              <p className="text-saas-xs text-slate-400 leading-relaxed max-w-2xl">
                Liga a API oficial da Meta no WhatsApp de cada corretor. Mais estável e sem risco de bloqueio nas
                respostas, e o número continua no WhatsApp Business do celular e na conexão por QR Code. Se o cliente
                escreveu nas últimas 24h, a resposta sai pela oficial. Depois disso, pela conexão por QR Code ou por um
                modelo aprovado.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 border border-slate-200" onClick={carregar} title="Atualizar">
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            </Button>
            <Button
              variant="outline"
              className="h-8 text-[10px] font-bold uppercase tracking-wider border-slate-200"
              disabled={!algumaLigada}
              onClick={() => setModelosAberto(true)}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Modelos de mensagem
            </Button>
          </div>
        </div>

        {cfg && !cfg.configurado && (
          <p className="text-saas-xs text-amber-600 bg-amber-50 rounded-lg p-3">
            A API oficial ainda não foi configurada no servidor. Fale com o suporte.
          </p>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-saas-xs text-slate-500 leading-relaxed">
          <b className="text-slate-600">Como ligar:</b> o número precisa estar no <b>WhatsApp Business</b> (não no
          WhatsApp comum). Clique em <b>Ligar API oficial</b> e entre com o Facebook que administra o portfólio da
          imobiliária. Escolha "conectar o WhatsApp Business que já uso". A Meta mostra um QR Code, que o corretor lê
          com o WhatsApp Business do celular dele.
        </div>

        {!equipe ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 text-slate-300 animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {equipe.map((m) => (
              <div key={m.userId} className="py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-saas-sm font-semibold text-slate-700 truncate">{m.nome}</span>
                    <Badge variant="outline" className="text-[9px] font-bold uppercase border-slate-200 text-slate-400 h-5 px-1.5">
                      {ROTULO_PAPEL[m.role] || m.role}
                    </Badge>
                    {m.bloqueado && (
                      <Badge variant="outline" className="text-[9px] font-bold uppercase border-red-100 bg-red-50 text-red-500 h-5 px-1.5">
                        Bloqueado
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    QR Code:{" "}
                    {m.naoOficial
                      ? `${m.naoOficial.provider === "baileys" ? "Baileys" : "WAHA"} · ${m.naoOficial.connected ? "conectado" : "desconectado"}${m.naoOficial.numero ? ` · ${formatarNumero(m.naoOficial.numero)}` : ""}`
                      : "não conectado"}
                  </p>
                </div>
                <div className="md:w-72 text-[11px]">
                  {m.oficial?.ativa ? (
                    <span className="text-emerald-600 font-bold">● Oficial ligada · {formatarNumero(m.oficial.numero)}</span>
                  ) : m.oficial ? (
                    <span className="text-amber-600 font-bold">Oficial desligada{m.oficial.erro ? `: ${m.oficial.erro}` : ""}</span>
                  ) : (
                    <span className="text-slate-400">Sem API oficial</span>
                  )}
                  {m.oficial?.ativa && m.oficial.erro && (
                    <span className="block text-amber-600">Último erro: {m.oficial.erro}</span>
                  )}
                </div>
                <div className="flex gap-2 md:w-48 md:justify-end">
                  {m.oficial?.ativa ? (
                    <Button
                      variant="outline"
                      className="h-8 text-[10px] font-bold uppercase tracking-wider border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-600"
                      disabled={ocupado === m.userId}
                      onClick={() => setDesligando(m)}
                    >
                      {ocupado === m.userId && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      Desligar oficial
                    </Button>
                  ) : (
                    <Button
                      className="h-8 text-[10px] font-bold uppercase tracking-wider"
                      disabled={!cfg?.configurado || ocupado !== null || m.bloqueado}
                      onClick={() => ligar(m)}
                    >
                      {ocupado === m.userId && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      {m.oficial ? "Religar API oficial" : "Ligar API oficial"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!desligando} onOpenChange={(v) => !v && setDesligando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar a API oficial de {desligando?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens voltam a sair só pela conexão por QR Code (se estiver conectada). O número continua no
              WhatsApp Business do celular.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarDesligar}>Desligar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {modelosAberto && <ModelosDialog onClose={() => setModelosAberto(false)} />}
    </Card>
  );
}

const STATUS_MODELO: Record<string, [string, string]> = {
  APPROVED: ["Aprovado", "text-emerald-600"],
  PENDING: ["Em análise", "text-amber-600"],
  REJECTED: ["Rejeitado", "text-red-600"],
  PAUSED: ["Pausado", "text-amber-600"],
  DISABLED: ["Desativado", "text-slate-400"],
  IN_APPEAL: ["Em recurso", "text-amber-600"],
};

// Lista, cria e apaga os modelos de uma conta do WhatsApp da imobiliária.
function ModelosDialog({ onClose }: { onClose: () => void }) {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof getModelos>> | null>(null);
  const [wabaId, setWabaId] = useState<string | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [apagando, setApagando] = useState<Modelo | null>(null);

  const carregar = (waba?: string) => {
    setErro(null);
    getModelos(waba)
      .then((d) => {
        setDados(d);
        setWabaId(d.wabaId || undefined);
      })
      .catch((e) => setErro(e.message));
  };
  useEffect(() => {
    carregar();
  }, []);

  const confirmarApagar = async () => {
    if (!apagando || !wabaId) return;
    const m = apagando;
    setApagando(null);
    try {
      await apagarModelo(wabaId, m.nome);
      toast.success("Modelo apagado");
      carregar(wabaId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modelos de mensagem</DialogTitle>
          <DialogDescription>
            Pela API oficial, depois de 24h sem o cliente escrever, só dá pra puxar conversa com um modelo aprovado pela
            Meta. A análise leva de minutos a 24h. A Meta cobra por modelo enviado.
          </DialogDescription>
        </DialogHeader>

        {criando && wabaId ? (
          <NovoModelo
            wabaId={wabaId}
            onFim={(ok) => {
              setCriando(false);
              if (ok) carregar(wabaId);
            }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {dados && dados.contas.length > 1 && (
                <Select value={wabaId} onValueChange={(v) => carregar(v)}>
                  <SelectTrigger className="h-8 w-72 text-xs">
                    <SelectValue placeholder="Conta do WhatsApp" />
                  </SelectTrigger>
                  <SelectContent>
                    {dados.contas.map((c) => (
                      <SelectItem key={c.wabaId} value={c.wabaId} className="text-xs">
                        {c.numeros.map((n) => n.nome).join(", ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="flex-1 text-[11px] text-slate-400">
                {dados?.contas.find((c) => c.wabaId === wabaId)?.numeros.map((n) => n.nome).join(", ")
                  ? `Valem para: ${dados?.contas.find((c) => c.wabaId === wabaId)?.numeros.map((n) => n.nome).join(", ")}`
                  : ""}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 border border-slate-200" onClick={() => carregar(wabaId)} title="Atualizar">
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              </Button>
              <Button className="h-8 text-[10px] font-bold uppercase tracking-wider" disabled={!wabaId} onClick={() => setCriando(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Criar modelo
              </Button>
            </div>

            {erro && <p className="text-xs text-red-600">{erro}</p>}
            {!dados && !erro && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 text-slate-300 animate-spin" />
              </div>
            )}
            {dados && !dados.modelos.length && (
              <p className="text-xs text-slate-400">
                Nenhum modelo ainda. Exemplo de primeiro modelo: "Olá {"{{1}}"}! Aqui é da Hinode Imóveis. Recebemos seu
                interesse no imóvel. Podemos conversar por aqui?"
              </p>
            )}
            {dados?.modelos.map((m) => {
              const [txt, cor] = STATUS_MODELO[m.status] || [m.status, "text-slate-400"];
              return (
                <div key={m.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <b className="text-xs flex-1 min-w-0 truncate">{m.nome}</b>
                    <span className="text-[10px] text-slate-400">
                      {m.categoria === "MARKETING" ? "Marketing" : m.categoria === "UTILITY" ? "Utilidade" : m.categoria}
                    </span>
                    <span className={`text-[10px] font-bold ${cor}`}>{txt}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setApagando(m)} title="Apagar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {m.cabecalho && <p className="text-xs font-bold mt-2">{m.cabecalho}</p>}
                  <p className="text-xs mt-1 whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                  {m.rodape && <p className="text-[11px] text-slate-400 mt-1">{m.rodape}</p>}
                  {m.botoes.length > 0 && <p className="text-[11px] text-slate-400 mt-1">Botões: {m.botoes.join(" · ")}</p>}
                  {m.motivo && <p className="text-[11px] text-red-600 mt-1">Motivo da Meta: {m.motivo}</p>}
                </div>
              );
            })}
          </div>
        )}

        <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar o modelo "{apagando?.nome}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Ele some da conta do WhatsApp. A Meta não deixa criar outro com o mesmo nome por 30 dias.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmarApagar}>Apagar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// Modelo novo: texto com {{1}}, {{2}}... + um exemplo pra cada (a Meta exige).
function NovoModelo({ wabaId, onFim }: { wabaId: string; onFim: (ok: boolean) => void }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [cabecalho, setCabecalho] = useState("");
  const [texto, setTexto] = useState(
    "Olá {{1}}! Aqui é da Hinode Imóveis. Recebemos seu interesse no imóvel e queremos te ajudar. Podemos conversar por aqui?"
  );
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState("");
  const [exemplos, setExemplos] = useState<string[]>(["Maria"]);
  const [enviando, setEnviando] = useState(false);
  const vars = [...new Set([...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  useEffect(() => {
    setExemplos((ex) => vars.map((_, i) => ex[i] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vars.join(",")]);
  const nomeLimpo = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const enviar = async () => {
    setEnviando(true);
    try {
      await criarModelo({
        wabaId,
        nome: nomeLimpo,
        categoria,
        idioma: "pt_BR",
        texto,
        exemplos,
        cabecalho: cabecalho.trim() || null,
        rodape: rodape.trim() || null,
        botoes: botoes.split("\n").map((b) => b.trim()).filter(Boolean),
      });
      toast.success("Modelo enviado pra análise da Meta");
      onFim(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const rotulo = "block text-[11px] font-bold text-slate-500 mt-3 mb-1";
  return (
    <div>
      <label className={rotulo}>Nome (só pra achar depois)</label>
      <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: primeiro contato formulario" className="h-9 text-xs" />
      {nomeLimpo && (
        <p className="text-[11px] text-slate-400 mt-1">
          Vai ficar: <code>{nomeLimpo}</code>
        </p>
      )}
      <label className={rotulo}>Tipo</label>
      <Select value={categoria} onValueChange={(v) => setCategoria(v as "UTILITY" | "MARKETING")}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="UTILITY" className="text-xs">Utilidade: resposta a um cadastro do cliente (mais barato)</SelectItem>
          <SelectItem value="MARKETING" className="text-xs">Marketing: oferta, novidade, convite</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[11px] text-slate-400 mt-1">Se a Meta achar que é propaganda, ela mesma muda pra Marketing.</p>
      <label className={rotulo}>Título (opcional, até 60 letras)</label>
      <Input value={cabecalho} onChange={(e) => setCabecalho(e.target.value)} maxLength={60} className="h-9 text-xs" />
      <label className={rotulo}>Mensagem: use {"{{1}}"}, {"{{2}}"}… nas partes que mudam (ex: o nome)</label>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={1024} className="text-xs" />
      {vars.map((n, i) => (
        <div key={n} className="flex items-center gap-2 mt-2">
          <span className="text-[11px] w-28 text-slate-500">Exemplo de {"{{" + n + "}}"}</span>
          <Input
            value={exemplos[i] || ""}
            onChange={(e) => setExemplos((ex) => ex.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={n === 1 ? "Maria" : "exemplo"}
            className="h-8 text-xs"
          />
        </div>
      ))}
      <label className={rotulo}>Rodapé (opcional)</label>
      <Input value={rodape} onChange={(e) => setRodape(e.target.value)} maxLength={60} placeholder="ex: Responda SAIR pra não receber mais" className="h-9 text-xs" />
      <label className={rotulo}>Botões de resposta rápida (opcional, até 3, um por linha)</label>
      <Textarea value={botoes} onChange={(e) => setBotoes(e.target.value)} rows={2} placeholder={"Quero saber mais\nAgora não"} className="text-xs" />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" className="h-9 text-xs" onClick={() => onFim(false)}>
          Voltar
        </Button>
        <Button className="h-9 text-xs" onClick={enviar} disabled={enviando || !nomeLimpo || !texto.trim()}>
          {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          Enviar pra análise
        </Button>
      </div>
    </div>
  );
}
