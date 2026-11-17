import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, MapPin, RefreshCw, Users } from 'lucide-react';
import { VisitaLink, ativarVisitaLink, fetchVisitaLinks, renovarVisitaLink, visitaPublicaUrl } from '../../lib/visitaPublica';

/**
 * Links do cadastro de visitas: um por stand (local fixo, para a recepcionista)
 * e um genérico do supervisor. Quem tem o link cadastra visitas, então dá para
 * desativar ou gerar um novo (o antigo para de funcionar).
 */
export default function LinksVisita() {
  const queryClient = useQueryClient();
  const links = useQuery({ queryKey: ['visitaLinks'], queryFn: fetchVisitaLinks, staleTime: 30_000 });
  const [copiado, setCopiado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const copiar = async (l: VisitaLink) => {
    try {
      await navigator.clipboard.writeText(visitaPublicaUrl(l.token));
      setCopiado(l.id);
      window.setTimeout(() => setCopiado(c => (c === l.id ? null : c)), 1800);
    } catch {
      setErro('Não foi possível copiar. Abra o link e copie da barra de endereço.');
    }
  };

  const executar = async (l: VisitaLink, acao: () => Promise<unknown>) => {
    setErro(null);
    setOcupado(l.id);
    try { await acao(); } catch (e: any) { setErro(e?.message || 'Não foi possível salvar.'); }
    finally { setOcupado(null); queryClient.invalidateQueries({ queryKey: ['visitaLinks'] }); }
  };

  const renovar = (l: VisitaLink) => {
    if (!window.confirm(`Gerar um novo link para "${l.nome}"? O link atual para de funcionar e precisa ser trocado no celular de quem usa.`)) return;
    executar(l, () => renovarVisitaLink(l.id));
  };

  const icone = 'p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-medium text-zinc-100">Links do cadastro de visitas</p>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Página para as recepcionistas registrarem as visitas, sem login. O link de cada stand já vem com o local; o do supervisor pergunta.
        </p>
      </div>
      {links.isLoading && <p className="text-[12px] text-zinc-500">Carregando…</p>}
      {links.error && <p className="text-[12px] text-rose-300">Não foi possível carregar os links (a migration foi aplicada?).</p>}
      <ul className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800/80">
        {(links.data ?? []).map(l => (
          <li key={l.id} className={`flex items-center gap-2 px-3 py-2 ${l.ativo ? '' : 'opacity-60'}`}>
            {l.local ? <MapPin size={13} className="text-zinc-500 shrink-0" /> : <Users size={13} className="text-zinc-500 shrink-0" />}
            <span className="flex-1 min-w-0 text-[12px] text-zinc-200 truncate" title={l.nome}>{l.nome}</span>
            <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500 cursor-pointer" title={l.ativo ? 'Desativar o link' : 'Reativar o link'}>
              <input
                type="checkbox" className="accent-blue-500" checked={l.ativo} disabled={ocupado === l.id}
                onChange={e => executar(l, () => ativarVisitaLink(l.id, e.target.checked))}
              />
              Ativo
            </label>
            <button type="button" className={icone} onClick={() => copiar(l)} disabled={!l.ativo} title="Copiar link">
              {copiado === l.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
            <a className={icone} href={visitaPublicaUrl(l.token)} target="_blank" rel="noreferrer" title="Abrir a página">
              <ExternalLink size={13} />
            </a>
            <button type="button" className={icone} onClick={() => renovar(l)} disabled={ocupado === l.id} title="Gerar novo link (o atual para de funcionar)">
              <RefreshCw size={13} className={ocupado === l.id ? 'animate-spin' : ''} />
            </button>
          </li>
        ))}
      </ul>
      {erro && <p className="text-[12px] text-rose-300">{erro}</p>}
    </div>
  );
}
