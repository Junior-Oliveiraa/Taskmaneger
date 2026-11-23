// Um criativo do design: imagens, link do arquivo e a aprovação dele.
import React, { useRef, useState } from 'react';
import { ClipboardPaste, ExternalLink, Pencil, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { Delivery } from '../../types';
import { entregaTravada, imagensDe, Rodada, situacaoDe } from '../../lib/aprovacao';
import { htmlTemTexto } from '../../lib/colagem';
import { fileToDataUrl, imageFilesFrom, imagensDoClipboard } from '../../lib/descriptionImages';
import { extensionForDataUrl, UPLOAD_LIMITS, uploadDataUrl } from '../../lib/storage';
import FullscreenImageEditor from '../FullscreenImageEditor';
import { FaixaAprovacao } from './Aprovacao';
import { LinhaBriefing } from './Briefing';
import { Imagem, Miniaturas, VerImagens } from './Imagens';
import { BOTAO_BORDA, BOTAO_GHOST, CAMPO, FOCO } from './Propriedade';

const comProtocolo = (url: string) => !url || /^https?:\/\//i.test(url) ? url : `https://${url}`;

export default function Criativo({ taskId, nome, criativo, rodada, cor, bloqueio, disabled, salvando, enviando, solicitanteId, onMudar, onExcluir, onEnviar, onDecidir, onCancelar }: {
  taskId: string;
  nome: string;
  criativo: Delivery;
  rodada?: Rodada;
  cor?: string;
  bloqueio?: string;
  disabled?: boolean;
  salvando?: boolean;
  /** O envio está sendo gravado: já não pode mudar. */
  enviando?: boolean;
  solicitanteId?: string;
  onMudar: (mudar: (d: Delivery) => Partial<Delivery>) => void;
  /** Só para o que nunca foi enviado. */
  onExcluir?: () => void;
  onEnviar: (aprovadorId: string) => void;
  onDecidir: (decisao: 'approved' | 'rejected', justificativa: string, anotadas: string[]) => void;
  onCancelar: () => void;
}) {
  const { currentUser } = useAuth();
  const [atual, setAtual] = useState(0);
  const [vendo, setVendo] = useState(false);
  const [rabiscando, setRabiscando] = useState(false);
  const [reprovando, setReprovando] = useState(false);
  const [anotadas, setAnotadas] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const imagens = imagensDe(criativo);
  const i = Math.min(atual, Math.max(0, imagens.length - 1));
  const editavel = !disabled && !enviando && !entregaTravada(criativo);
  const decide = !disabled && situacaoDe(criativo) === 'pendente' && (!criativo.approverId || criativo.approverId === currentUser?.id);
  const temRabisco = anotadas.some(Boolean);

  const comImagens = (lista: string[]): Partial<Delivery> => ({ imageUrls: lista, imageUrl: lista[0], thumbnailUrl: lista[0] });
  const adicionarUrls = (urls: string[]) => onMudar(d => comImagens([...imagensDe(d), ...urls]));

  const adicionar = async (arquivos: File[]) => {
    const validos = arquivos.filter(f => f.type.startsWith('image/'));
    setErro(validos.length < arquivos.length ? 'Só imagens podem ser enviadas aqui.' : null);
    if (validos.length === 0) return;
    setSubindo(n => n + validos.length);
    const urls: string[] = [];
    for (const f of validos) {
      try {
        const dataUrl = await fileToDataUrl(f);
        urls.push(await uploadDataUrl('attachments', `creatives/${taskId}/${criativo.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionForDataUrl(dataUrl)}`, dataUrl, UPLOAD_LIMITS.task));
      } catch (e: any) {
        setErro(`A imagem não foi enviada. ${e?.message || 'Tente de novo.'}`);
      } finally {
        setSubindo(n => n - 1);
      }
    }
    if (urls.length === 0) return;
    setAtual(imagens.length + urls.length - 1);
    adicionarUrls(urls);
  };

  const colar = (e: React.ClipboardEvent) => {
    if (!editavel) return;
    const arquivos = imageFilesFrom(e.clipboardData);
    if (arquivos.length > 0 && !htmlTemTexto(e.clipboardData.getData('text/html'))) {
      e.preventDefault();
      void adicionar(arquivos);
      return;
    }
    // Endereço de imagem colado fora do campo de link.
    const url = e.clipboardData.getData('text/plain').trim();
    if (!(e.target instanceof HTMLInputElement) && /^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?\S*)?$/i.test(url)) {
      e.preventDefault();
      adicionarUrls([url]);
    }
  };

  const colarPrint = async () => {
    const arquivos = await imagensDoClipboard();
    if (arquivos.length > 0) void adicionar(arquivos);
    else setErro('Nenhuma imagem copiada. Tire o print ou copie a imagem e tente de novo.');
  };

  return (
    <div className="flex flex-col gap-3" onPaste={colar}>
      <div
        tabIndex={editavel ? 0 : undefined}
        aria-label={editavel ? `Imagens de ${nome}: cole com Ctrl+V` : undefined}
        role={editavel ? 'group' : undefined}
        onDragOver={e => { if (editavel && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
        onDrop={e => {
          if (!editavel) return;
          e.preventDefault();
          setArrastando(false);
          void adicionar(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col rounded-xl border transition-colors ${arrastando ? 'border-blue-500/60 bg-blue-500/10' : imagens.length ? 'border-zinc-800' : 'border-dashed border-zinc-700'} ${FOCO}`}
      >
        {imagens.length > 0 && (
          <div className="relative group flex items-center justify-center min-h-40 p-3">
            <button
              type="button"
              onClick={() => (reprovando ? setRabiscando(true) : setVendo(true))}
              aria-label={reprovando ? `Rabiscar imagem ${i + 1}` : `Abrir imagem ${i + 1} em tela cheia`}
              title={reprovando ? 'Rabiscar os ajustes' : 'Abrir em tela cheia'}
              className={`max-w-full rounded-lg overflow-hidden ${FOCO}`}
            >
              <Imagem src={(reprovando && anotadas[i]) || imagens[i]} alt={`${nome}, imagem ${i + 1}`} className="max-h-[460px] max-w-full w-auto object-contain" />
            </button>
            {editavel && (
              <button
                type="button"
                onClick={() => onMudar(d => comImagens(imagensDe(d).filter(u => u !== imagens[i])))}
                aria-label={`Remover imagem ${i + 1}`}
                title="Remover imagem"
                className={`absolute top-3 right-3 size-8 [@media(pointer:coarse)]:size-10 inline-flex items-center justify-center rounded-lg bg-black/60 text-white hover:text-red-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity ${FOCO}`}
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
        )}
        {imagens.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 px-3 pb-3" role="group" aria-label="Imagens do criativo">
            {imagens.map((src, n) => (
              <button
                key={`${src}-${n}`}
                type="button"
                aria-pressed={n === i}
                aria-label={`Imagem ${n + 1}`}
                onClick={() => setAtual(n)}
                className={`h-14 min-w-10 overflow-hidden rounded-lg border transition-colors ${n === i ? 'border-zinc-400' : 'border-zinc-800 opacity-60 hover:opacity-100'} ${FOCO}`}
              >
                <Imagem src={src} alt="" pequena className="h-full w-auto object-contain" />
              </button>
            ))}
          </div>
        )}
        {imagens.length === 0 && !editavel && <p className="p-4 text-body text-zinc-500">Nenhuma imagem.</p>}
        {editavel && (
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-3 ${imagens.length ? 'border-t border-zinc-800' : ''}`}>
            <button type="button" onClick={() => arquivo.current?.click()} disabled={subindo > 0} className={BOTAO_BORDA}>
              <Upload size={15} aria-hidden /> {subindo > 0 ? 'Enviando…' : 'Adicionar imagem'}
            </button>
            <button type="button" onClick={() => void colarPrint()} disabled={subindo > 0} className={`${BOTAO_GHOST} h-9`}>
              <ClipboardPaste size={15} aria-hidden /> Colar print
            </button>
            <span className="text-body text-zinc-500">ou arraste as imagens para cá</span>
            {onExcluir && (
              <button type="button" onClick={onExcluir} className={`${BOTAO_GHOST} h-9 ml-auto hover:!text-red-400`}>
                <Trash2 size={15} aria-hidden /> Excluir criativo
              </button>
            )}
          </div>
        )}
      </div>

      {editavel ? (
        <div className="@container">
        <LinhaBriefing rotulo="Link do arquivo">
        <input
          key={criativo.figmaLink || ''}
          type="url"
          defaultValue={criativo.figmaLink || ''}
          onBlur={e => {
            const link = comProtocolo(e.target.value.trim());
            if (link !== (criativo.figmaLink || '')) onMudar(() => ({ figmaLink: link }));
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="Colar o link do Drive (opcional)"
          aria-label={`Link do arquivo de ${nome}`}
          className={`${CAMPO} h-9 [@media(pointer:coarse)]:h-10`}
        />
        </LinhaBriefing>
        </div>
      ) : criativo.figmaLink && (
        <a href={comProtocolo(criativo.figmaLink)} target="_blank" rel="noopener noreferrer" className={`${BOTAO_GHOST} self-start -ml-2.5`}>
          <ExternalLink size={15} aria-hidden /> Abrir arquivo
        </a>
      )}
      {erro && <p role="alert" className="text-body text-red-400">{erro}</p>}

      <FaixaAprovacao
        tipo="criativo"
        cor={cor}
        nome={nome}
        entrega={criativo}
        rodada={rodada}
        vazio={imagens.length === 0 || subindo > 0}
        bloqueio={bloqueio}
        disabled={disabled}
        salvando={salvando}
        solicitanteId={solicitanteId}
        onReprovando={v => { setReprovando(v && decide); if (!v) setAnotadas([]); }}
        anexos={imagens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRabiscando(true)} className={`${BOTAO_GHOST} -ml-2.5`}>
              <Pencil size={15} aria-hidden /> {temRabisco ? 'Editar rabiscos' : 'Rabiscar na imagem'}
            </button>
            {temRabisco && <>
              <Miniaturas imagens={anotadas.filter(Boolean)} rotulo="Ajustes rabiscados" />
              <button type="button" onClick={() => setAnotadas([])} className={BOTAO_GHOST}>Remover rabiscos</button>
            </>}
          </div>
        )}
        onEnviar={onEnviar}
        onDecidir={(decisao, motivo) => onDecidir(decisao, motivo, decisao === 'rejected' ? anotadas.filter(Boolean) : [])}
        onCancelar={onCancelar}
      />

      {vendo && <VerImagens imagens={imagens} inicial={i} onFechar={() => setVendo(false)} />}
      {rabiscando && (
        <FullscreenImageEditor
          imageUrls={imagens}
          initialIndex={i}
          initialAnnotatedDataUrls={anotadas}
          onSave={urls => { setAnotadas(urls); setRabiscando(false); }}
          onClose={() => setRabiscando(false)}
        />
      )}
      <input ref={arquivo} type="file" accept="image/*" multiple className="hidden" onChange={e => { void adicionar(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
  );
}
