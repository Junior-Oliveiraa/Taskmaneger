import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, Settings, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SeletorResponsavel } from './PropostaChat';
import { fetchAprovadorPropostas, salvarAprovadorPropostas } from '../../lib/comercialApi';

/**
 * Configurações das propostas (engrenagem ao lado de "Nova proposta").
 * Por ora: quem é o aprovador, que recebe no WhatsApp as propostas enviadas
 * para aprovação e pode responder 1/2. Só master/administrador vê e altera
 * (o banco também garante: trigger whatsapp_config_aprovador).
 */
export default function ConfigPropostas({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { allUsers } = useAuth();
  const atual = useQuery({ queryKey: ['aprovadorPropostas'], queryFn: fetchAprovadorPropostas, staleTime: 30_000 });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const diretores = useMemo(
    () => allUsers.filter(u => u.perfil === 'master' || u.perfil === 'administrador'),
    [allUsers],
  );
  const aprovador = diretores.find(u => u.id === atual.data) ?? null;
  const semTelefone = aprovador && (aprovador.phone || '').replace(/\D/g, '').length < 10;

  const trocar = async (id: string | null) => {
    setErro(null);
    setSalvando(true);
    try {
      await salvarAprovadorPropostas(id);
      queryClient.setQueryData(['aprovadorPropostas'], id);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível salvar o aprovador.');
    } finally {
      setSalvando(false);
      queryClient.invalidateQueries({ queryKey: ['aprovadorPropostas'] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#121215] shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
        role="dialog" aria-label="Configurações das propostas"
      >
        <header className="flex items-center justify-between px-5 h-12 border-b border-zinc-800/70">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
            <Settings size={15} className="text-zinc-400" /> Configurações das propostas
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60" title="Fechar (Esc)">
            <X size={15} />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <div>
            <p className="text-[13px] font-medium text-zinc-100">Aprovador das propostas</p>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Recebe no WhatsApp as propostas enviadas para aprovação e pode responder 1 para aprovar ou 2 para recusar.
              Só usuários master ou administrador.
            </p>
          </div>

          <SeletorResponsavel
            usuarios={diretores}
            valor={atual.data ?? null}
            onChange={trocar}
            desabilitado={salvando || atual.isLoading}
          />

          {!atual.isLoading && !aprovador && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-300">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              Sem aprovador: nenhuma mensagem é enviada quando uma proposta vai para aprovação.
            </p>
          )}
          {semTelefone && (
            <p className="flex items-start gap-1.5 text-[12px] text-amber-300">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {aprovador!.name} não tem telefone no perfil: não vai receber o WhatsApp.
            </p>
          )}
          {aprovador && !semTelefone && (
            <p className="flex items-center gap-1.5 text-[12px] text-emerald-300/90">
              <MessageCircle size={13} className="shrink-0" />
              Avisos vão para {aprovador.name} · {aprovador.phone}
            </p>
          )}
          {erro && <p className="text-[12px] text-rose-300">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
