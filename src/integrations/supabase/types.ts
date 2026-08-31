export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      colunas_kanban: {
        Row: {
          cor: string
          created_at: string
          id: string
          imobiliaria_id: string
          nome: string
          posicao: number
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          imobiliaria_id: string
          nome: string
          posicao?: number
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          imobiliaria_id?: string
          nome?: string
          posicao?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colunas_kanban_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_distribuicao: {
        Row: {
          created_at: string
          id: string
          imobiliaria_id: string
          modo: string
          tempo_limite_atendimento: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          imobiliaria_id: string
          modo?: string
          tempo_limite_atendimento?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          imobiliaria_id?: string
          modo?: string
          tempo_limite_atendimento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_distribuicao_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: true
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      descartes_leads: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          motivo: string
          observacao: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          motivo: string
          observacao?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          motivo?: string
          observacao?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "descartes_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descartes_leads_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      distribuicao_log: {
        Row: {
          corretor_id: string | null
          created_at: string | null
          id: string
          imobiliaria_id: string | null
          lead_id: string | null
          tipo: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string | null
          id?: string
          imobiliaria_id?: string | null
          lead_id?: string | null
          tipo?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string | null
          id?: string
          imobiliaria_id?: string | null
          lead_id?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribuicao_log_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_log_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribuicao_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_plantao: {
        Row: {
          corretor_id: string | null
          created_at: string | null
          dia_semana: number | null
          hora_fim: string
          hora_inicio: string
          id: string
          imobiliaria_id: string | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string | null
          dia_semana?: number | null
          hora_fim: string
          hora_inicio: string
          id?: string
          imobiliaria_id?: string | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string | null
          dia_semana?: number | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          imobiliaria_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_plantao_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_plantao_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      filas_atendimento: {
        Row: {
          corretor_id: string | null
          created_at: string | null
          id: string
          imobiliaria_id: string | null
          posicao: number
          status_on: boolean | null
        }
        Insert: {
          corretor_id?: string | null
          created_at?: string | null
          id?: string
          imobiliaria_id?: string | null
          posicao: number
          status_on?: boolean | null
        }
        Update: {
          corretor_id?: string | null
          created_at?: string | null
          id?: string
          imobiliaria_id?: string | null
          posicao?: number
          status_on?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "filas_atendimento_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filas_atendimento_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      imobiliarias: {
        Row: {
          ai_prompt: string | null
          ai_tone: string | null
          cnpj: string | null
          created_at: string
          email: string
          global_ai_enabled: boolean | null
          id: string
          nome: string
          owner_id: string
          papi_instance_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ai_prompt?: string | null
          ai_tone?: string | null
          cnpj?: string | null
          created_at?: string
          email: string
          global_ai_enabled?: boolean | null
          id?: string
          nome: string
          owner_id: string
          papi_instance_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ai_prompt?: string | null
          ai_tone?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string
          global_ai_enabled?: boolean | null
          id?: string
          nome?: string
          owner_id?: string
          papi_instance_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      imoveis: {
        Row: {
          area: number | null
          banheiros: number | null
          caracteristicas: Json | null
          cidade: string | null
          created_at: string
          descricao: string | null
          endereco: string | null
          estado: string | null
          finalidade: string | null
          fotos: string[] | null
          id: string
          imobiliaria_id: string
          preco: number | null
          quartos: number | null
          tipo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          area?: number | null
          banheiros?: number | null
          caracteristicas?: Json | null
          cidade?: string | null
          created_at?: string
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          finalidade?: string | null
          fotos?: string[] | null
          id?: string
          imobiliaria_id: string
          preco?: number | null
          quartos?: number | null
          tipo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          area?: number | null
          banheiros?: number | null
          caracteristicas?: Json | null
          cidade?: string | null
          created_at?: string
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          finalidade?: string | null
          fotos?: string[] | null
          id?: string
          imobiliaria_id?: string
          preco?: number | null
          quartos?: number | null
          tipo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imoveis_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_config: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          imobiliaria_id: string
          integration_id: string
          status: string
          total_leads: number | null
          ultimo_lead_em: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          imobiliaria_id: string
          integration_id: string
          status?: string
          total_leads?: number | null
          ultimo_lead_em?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          imobiliaria_id?: string
          integration_id?: string
          status?: string
          total_leads?: number | null
          ultimo_lead_em?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_config_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_historico_corretores: {
        Row: {
          atribuido_em: string | null
          corretor_id: string
          id: string
          lead_id: string
          motivo: string | null
          removido_em: string | null
        }
        Insert: {
          atribuido_em?: string | null
          corretor_id: string
          id?: string
          lead_id: string
          motivo?: string | null
          removido_em?: string | null
        }
        Update: {
          atribuido_em?: string | null
          corretor_id?: string
          id?: string
          lead_id?: string
          motivo?: string | null
          removido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_historico_corretores_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_corretores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          alerta_visita_17h_ciente: boolean | null
          alerta_visita_2h_ciente: boolean | null
          bairro_interesse: string | null
          cadencia_chamada: number | null
          coluna_kanban_id: string | null
          corretor_id: string | null
          created_at: string
          data_atribuicao: string | null
          data_fechamento: string | null
          data_ultima_chamada: string | null
          data_visita: string | null
          descartado_em: string | null
          descartado_por: string | null
          descarte_pendente_aprovacao: boolean | null
          email: string | null
          favorito: boolean | null
          fila_tipo: string | null
          id: string
          imobiliaria_id: string
          imovel_id: string | null
          lembrete_follow_up: string | null
          link_drive: string | null
          motivo_descarte: string | null
          nome: string
          origem: string | null
          primeiro_contato_em: string | null
          referencia: string | null
          renda_familiar: number | null
          saldo_fgts: number | null
          score: number | null
          sla_vencido: boolean | null
          status: Database["public"]["Enums"]["lead_status"]
          status_visita: string | null
          telefone: string
          temperatura: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_contato: number | null
          tipo_imovel_interesse: string | null
          tipo_visita: string | null
          ultima_acao_at: string | null
          ultima_interacao: string | null
          updated_at: string
          valor_entrada: number | null
          valor_estimado: number | null
          valor_venda: number | null
        }
        Insert: {
          alerta_visita_17h_ciente?: boolean | null
          alerta_visita_2h_ciente?: boolean | null
          bairro_interesse?: string | null
          cadencia_chamada?: number | null
          coluna_kanban_id?: string | null
          corretor_id?: string | null
          created_at?: string
          data_atribuicao?: string | null
          data_fechamento?: string | null
          data_ultima_chamada?: string | null
          data_visita?: string | null
          descartado_em?: string | null
          descartado_por?: string | null
          descarte_pendente_aprovacao?: boolean | null
          email?: string | null
          favorito?: boolean | null
          fila_tipo?: string | null
          id?: string
          imobiliaria_id: string
          imovel_id?: string | null
          lembrete_follow_up?: string | null
          link_drive?: string | null
          motivo_descarte?: string | null
          nome: string
          origem?: string | null
          primeiro_contato_em?: string | null
          referencia?: string | null
          renda_familiar?: number | null
          saldo_fgts?: number | null
          score?: number | null
          sla_vencido?: boolean | null
          status?: Database["public"]["Enums"]["lead_status"]
          status_visita?: string | null
          telefone: string
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_contato?: number | null
          tipo_imovel_interesse?: string | null
          tipo_visita?: string | null
          ultima_acao_at?: string | null
          ultima_interacao?: string | null
          updated_at?: string
          valor_entrada?: number | null
          valor_estimado?: number | null
          valor_venda?: number | null
        }
        Update: {
          alerta_visita_17h_ciente?: boolean | null
          alerta_visita_2h_ciente?: boolean | null
          bairro_interesse?: string | null
          cadencia_chamada?: number | null
          coluna_kanban_id?: string | null
          corretor_id?: string | null
          created_at?: string
          data_atribuicao?: string | null
          data_fechamento?: string | null
          data_ultima_chamada?: string | null
          data_visita?: string | null
          descartado_em?: string | null
          descartado_por?: string | null
          descarte_pendente_aprovacao?: boolean | null
          email?: string | null
          favorito?: boolean | null
          fila_tipo?: string | null
          id?: string
          imobiliaria_id?: string
          imovel_id?: string | null
          lembrete_follow_up?: string | null
          link_drive?: string | null
          motivo_descarte?: string | null
          nome?: string
          origem?: string | null
          primeiro_contato_em?: string | null
          referencia?: string | null
          renda_familiar?: number | null
          saldo_fgts?: number | null
          score?: number | null
          sla_vencido?: boolean | null
          status?: Database["public"]["Enums"]["lead_status"]
          status_visita?: string | null
          telefone?: string
          temperatura?: Database["public"]["Enums"]["lead_temperatura"] | null
          tentativas_contato?: number | null
          tipo_imovel_interesse?: string | null
          tipo_visita?: string | null
          ultima_acao_at?: string | null
          ultima_interacao?: string | null
          updated_at?: string
          valor_entrada?: number | null
          valor_estimado?: number | null
          valor_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_coluna_kanban_id_fkey"
            columns: ["coluna_kanban_id"]
            isOneToOne: false
            referencedRelation: "colunas_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_descartado_por_fkey"
            columns: ["descartado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_imovel_id_fkey"
            columns: ["imovel_id"]
            isOneToOne: false
            referencedRelation: "imoveis"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_interacoes: {
        Row: {
          autor_id: string
          conteudo: string
          created_at: string
          id: string
          lead_id: string
          tipo: string
        }
        Insert: {
          autor_id: string
          conteudo: string
          created_at?: string
          id?: string
          lead_id: string
          tipo: string
        }
        Update: {
          autor_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          lead_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_interacoes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_followup: {
        Row: {
          concluido: boolean | null
          corretor_id: string
          created_at: string | null
          datetime: string
          id: string
          lead_id: string
          observacao: string | null
        }
        Insert: {
          concluido?: boolean | null
          corretor_id: string
          created_at?: string | null
          datetime: string
          id?: string
          lead_id: string
          observacao?: string | null
        }
        Update: {
          concluido?: boolean | null
          corretor_id?: string
          created_at?: string | null
          datetime?: string
          id?: string
          lead_id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_followup_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembretes_followup_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      links_uteis: {
        Row: {
          created_at: string
          id: string
          imobiliaria_id: string
          titulo: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          imobiliaria_id: string
          titulo: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          imobiliaria_id?: string
          titulo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_uteis_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_whatsapp: {
        Row: {
          conteudo: string
          corretor_id: string | null
          created_at: string | null
          direcao: string
          id: string
          imobiliaria_id: string
          lead_id: string
          lida: boolean
          metadata: Json | null
          status: string | null
          tipo: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          conteudo: string
          corretor_id?: string | null
          created_at?: string | null
          direcao: string
          id?: string
          imobiliaria_id: string
          lead_id: string
          lida?: boolean
          metadata?: Json | null
          status?: string | null
          tipo?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          conteudo?: string
          corretor_id?: string | null
          created_at?: string | null
          direcao?: string
          id?: string
          imobiliaria_id?: string
          lead_id?: string
          lida?: boolean
          metadata?: Json | null
          status?: string | null
          tipo?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_corretor_id_fkey"
            columns: ["corretor_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string | null
          id: string
          imobiliaria_id: string
          lead_id: string | null
          lida: boolean | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          imobiliaria_id: string
          lead_id?: string | null
          lida?: boolean | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          imobiliaria_id?: string
          lead_id?: string | null
          lida?: boolean | null
          tipo?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          avatar_url: string | null
          created_at: string
          em_almoco: boolean
          em_plantao: boolean | null
          id: string
          imobiliaria_id: string | null
          nome: string
          role: Database["public"]["Enums"]["user_role"]
          status_roleta: boolean | null
          telefone: string | null
          ultimo_checkin: string | null
          ultimo_checkin_roleta: string | null
          ultimo_lead_recebido_em: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          em_almoco?: boolean
          em_plantao?: boolean | null
          id: string
          imobiliaria_id?: string | null
          nome: string
          role?: Database["public"]["Enums"]["user_role"]
          status_roleta?: boolean | null
          telefone?: string | null
          ultimo_checkin?: string | null
          ultimo_checkin_roleta?: string | null
          ultimo_lead_recebido_em?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          em_almoco?: boolean
          em_plantao?: boolean | null
          id?: string
          imobiliaria_id?: string | null
          nome?: string
          role?: Database["public"]["Enums"]["user_role"]
          status_roleta?: boolean | null
          telefone?: string | null
          ultimo_checkin?: string | null
          ultimo_checkin_roleta?: string | null
          ultimo_lead_recebido_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      templates_mensagem: {
        Row: {
          anexo_nome: string | null
          anexo_tipo: string | null
          anexo_url: string | null
          assunto: string | null
          conteudo: string
          created_at: string
          criado_por: string
          etapa_funil: Database["public"]["Enums"]["lead_status"] | null
          id: string
          imobiliaria_id: string
          tipo: string | null
          titulo: string
        }
        Insert: {
          anexo_nome?: string | null
          anexo_tipo?: string | null
          anexo_url?: string | null
          assunto?: string | null
          conteudo: string
          created_at?: string
          criado_por: string
          etapa_funil?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          imobiliaria_id: string
          tipo?: string | null
          titulo: string
        }
        Update: {
          anexo_nome?: string | null
          anexo_tipo?: string | null
          anexo_url?: string | null
          assunto?: string | null
          conteudo?: string
          created_at?: string
          criado_por?: string
          etapa_funil?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          imobiliaria_id?: string
          tipo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_mensagem_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      treinamentos: {
        Row: {
          created_at: string
          id: string
          imobiliaria_id: string
          titulo: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          imobiliaria_id: string
          titulo: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          imobiliaria_id?: string
          titulo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "treinamentos_imobiliaria_id_fkey"
            columns: ["imobiliaria_id"]
            isOneToOne: false
            referencedRelation: "imobiliarias"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          ai_active: boolean | null
          ai_prompt: string | null
          connected: boolean
          created_at: string
          id: string
          jid: string | null
          phone_number: string | null
          provider: string
          qr_code: string | null
          session_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_active?: boolean | null
          ai_prompt?: string | null
          connected?: boolean
          created_at?: string
          id?: string
          jid?: string | null
          phone_number?: string | null
          provider?: string
          qr_code?: string | null
          session_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_active?: boolean | null
          ai_prompt?: string | null
          connected?: boolean
          created_at?: string
          id?: string
          jid?: string | null
          phone_number?: string | null
          provider?: string
          qr_code?: string | null
          session_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_lead_por_telefone: {
        Args: { telefone_busca: string }
        Returns: {
          id: string
          imobiliaria_id: string
        }[]
      }
      distribuir_leads_massa: {
        Args: { p_corretor_id: string; p_lead_ids: string[]; p_tipo: string }
        Returns: undefined
      }
      get_auth_imobiliaria_id: { Args: never; Returns: string }
      get_auth_role: { Args: never; Returns: string }
      get_conversas: {
        Args: { p_corretor_id?: string }
        Returns: {
          corretor_id: string
          corretor_nome: string
          imobiliaria_id: string
          lead_id: string
          lead_nome: string
          lead_telefone: string
          nao_lidas: number
          ultima_direcao: string
          ultima_mensagem: string
          ultima_mensagem_em: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_next_broker_on_duty: { Args: never; Returns: string }
      puxar_mais_rebatidas: {
        Args: { p_corretor_id: string; p_cidade: string | null }
        Returns: number
      }
      entrar_na_roleta: { Args: { p_corretor_id: string }; Returns: undefined }
      registrar_embaralhamento: {
        Args: { p_imobiliaria_id: string | null }
        Returns: number
      }
      get_next_corretor_rodizio: {
        Args: { p_imobiliaria_id: string }
        Returns: {
          corretor_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      marcar_conversa_lida: { Args: { p_lead_id: string }; Returns: undefined }
      registrar_lead_integracao: {
        Args: { p_imobiliaria_id: string; p_integration_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "dono" | "gerente" | "corretor"
      lead_status:
        | "novo"
        | "em_atendimento"
        | "qualificado"
        | "desqualificado"
        | "venda_concluida"
        | "rebatida"
        | "tarefas"
        | "agendado"
        | "visitou"
        | "pendente"
        | "aprovado"
        | "futuros"
        | "cobrar_doc"
        | "reprovado"
      lead_temperatura: "quente" | "morno" | "frio"
      user_role: "dono" | "gerente" | "corretor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["dono", "gerente", "corretor"],
      lead_status: [
        "novo",
        "em_atendimento",
        "qualificado",
        "desqualificado",
        "venda_concluida",
        "rebatida",
        "tarefas",
        "agendado",
        "visitou",
        "pendente",
        "aprovado",
        "futuros",
        "cobrar_doc",
        "reprovado",
      ],
      lead_temperatura: ["quente", "morno", "frio"],
      user_role: ["dono", "gerente", "corretor"],
    },
  },
} as const
