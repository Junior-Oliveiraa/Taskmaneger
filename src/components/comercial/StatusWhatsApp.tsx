import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWhatsAppStatus, WhatsAppStatus } from '../../lib/api';

// Selo "WhatsApp online" ao lado da engrenagem das Propostas: sem o número
// conectado, os avisos ao Diretor e as respostas 1/2 param em silêncio.

const ESTILO: Record<WhatsAppStatus['estado'] | 'carregando', { rotulo: string; dot: string; caixa: string }> = {
  online:     { rotulo: 'WhatsApp online',      dot: 'bg-emerald-400',            caixa: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' },
  conectando: { rotulo: 'WhatsApp conectando',  dot: 'bg-amber-300 animate-pulse', caixa: 'border-amber-500/25 bg-amber-500/10 text-amber-200' },
  offline:    { rotulo: 'WhatsApp offline',     dot: 'bg-rose-400',               caixa: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  erro:       { rotulo: 'WhatsApp sem resposta', dot: 'bg-rose-400',              caixa: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  desativado: { rotulo: 'WhatsApp desativado',  dot: 'bg-zinc-500',               caixa: 'border-zinc-700 bg-zinc-800/40 text-zinc-400' },
  carregando: { rotulo: 'WhatsApp…',            dot: 'bg-zinc-600 animate-pulse', caixa: 'border-zinc-800 bg-zinc-900/40 text-zinc-500' },
};

function fmtNumero(n: string) {
  const d = n.replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
}

export default function StatusWhatsApp({ className = '' }: { className?: string }) {
  const q = useQuery({
    queryKey: ['whatsappStatus'],
    queryFn: fetchWhatsAppStatus,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
  });
  const estado = q.isLoading ? 'carregando' : q.isError ? 'erro' : q.data!.estado;
  const s = ESTILO[estado];
  const d = q.data;

  const dica = [
    s.rotulo,
    d?.nome || d?.numero ? `Número: ${[d?.nome, d?.numero ? fmtNumero(d.numero) : null].filter(Boolean).join(' · ')}` : null,
    d?.instancia ? `Instância: ${d.instancia}` : null,
    estado === 'offline' ? 'Reconecte lendo o QR code no Evolution Manager.' : null,
    d?.detalhe || (q.isError ? String((q.error as Error)?.message) : null),
    q.dataUpdatedAt ? `Verificado às ${new Date(q.dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (clique para verificar de novo)` : null,
  ].filter(Boolean).join('\n');

  return (
    <button
      type="button"
      onClick={() => q.refetch()}
      title={dica}
      aria-label={s.rotulo}
      className={`inline-flex items-center gap-1.5 h-7 rounded-md border px-2 text-[11px] font-medium shrink-0 transition-opacity hover:opacity-80 ${s.caixa} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${q.isFetching && !q.isLoading ? 'animate-pulse' : ''}`} />
      <span className="hidden sm:inline">{s.rotulo}</span>
    </button>
  );
}
