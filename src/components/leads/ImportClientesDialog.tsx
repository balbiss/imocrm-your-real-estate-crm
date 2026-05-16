import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";

interface ImportClientesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportClientesDialog({ open, onOpenChange }: ImportClientesDialogProps) {
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<any[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csvContent = "nome,email,telefone,origem,valor_estimado\nJoão Silva,joao@exemplo.com,11999999999,Manual,500000\nMaria Oliveira,maria@exemplo.com,11888888888,Site,750000";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_importacao_clientes.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast.error("Erro ao ler o arquivo CSV.");
          return;
        }
        setPreviewData(results.data);
      },
    });
  };

  const startImport = async () => {
    if (previewData.length === 0) return;

    setIsImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: perfil } = await supabase
        .from("perfis")
        .select("imobiliaria_id")
        .eq("id", user.id)
        .single();

      if (!perfil) throw new Error("Perfil não encontrado");

      const leadsToInsert = previewData.map(item => ({
        nome: item.nome || "Sem Nome",
        email: item.email || null,
        telefone: item.telefone || "",
        origem: item.origem || "Importação",
        valor_estimado: parseFloat(item.valor_estimado) || 0,
        imobiliaria_id: perfil.imobiliaria_id,
        corretor_id: user.id,
        status: "novo"
      }));

      const { error } = await supabase.from("leads").insert(leadsToInsert);

      if (error) throw error;

      toast.success(`${leadsToInsert.length} clientes importados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["clientes-list"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onOpenChange(false);
      setPreviewData([]);
    } catch (error: any) {
      toast.error("Erro na importação: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar Clientes
          </DialogTitle>
          <DialogDescription>
            Suba uma lista de clientes via CSV para sua base.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-slate-400 mt-0.5" />
            <div className="space-y-1">
              <p className="text-saas-sm font-bold text-slate-700">Atenção ao formato</p>
              <p className="text-saas-xs text-slate-500 leading-relaxed">
                Certifique-se de que seu arquivo CSV possui as colunas: 
                <code className="bg-slate-200 px-1 rounded mx-1">nome</code>, 
                <code className="bg-slate-200 px-1 rounded mx-1">email</code>, 
                <code className="bg-slate-200 px-1 rounded mx-1">telefone</code>, 
                <code className="bg-slate-200 px-1 rounded mx-1">origem</code> e 
                <code className="bg-slate-200 px-1 rounded mx-1">valor_estimado</code>.
              </p>
              <Button 
                variant="link" 
                className="h-auto p-0 text-primary text-saas-xs font-bold"
                onClick={downloadTemplate}
              >
                <Download className="h-3 w-3 mr-1" /> Baixar modelo de exemplo
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 hover:bg-slate-50 transition-colors cursor-pointer group"
               onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".csv"
              onChange={handleFileUpload}
            />
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <p className="text-saas-sm font-bold text-slate-700">Clique para selecionar</p>
            <p className="text-saas-xs text-slate-500">ou arraste o arquivo CSV aqui</p>
          </div>

          {previewData.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="text-saas-sm font-bold text-emerald-700">
                {previewData.length} registros prontos para importar
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            disabled={previewData.length === 0 || isImporting}
            onClick={startImport}
          >
            {isImporting ? "Importando..." : "Iniciar Importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
