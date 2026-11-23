// Documentos da tarefa: arquivos e links, com pedido de aprovação por item.
import React, { useRef, useState } from 'react';
import { Check, Download, ExternalLink, FileText, Link2, Upload, UserPlus, X } from 'lucide-react';
import type { Attachment } from '../../types';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { uploadToStorage, UPLOAD_LIMITS, sanitizeFileName } from '../../lib/storage';
import { BOTAO_BORDA, BOTAO_GHOST, BOTAO_ICONE, FOCO, ItemMenu, Menu } from './Propriedade';

const novoId = () => `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const formatarTamanho = (bytes: number) => {
  if (bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const SELO_APROVACAO: Record<string, { rotulo: string; cls: string }> = {
  pending: { rotulo: 'Em análise', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  approved: { rotulo: 'Aprovado', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  rejected: { rotulo: 'Reprovado', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

const CAMPO = `min-w-0 h-9 px-3 rounded-lg bg-[#161619] border border-white/10 hover:border-zinc-600 text-body text-zinc-200 placeholder-zinc-500 outline-none focus:!border-blue-500/60 transition-colors`;

export default function Anexos({ attachments = [], onUpdate, taskId, taskTitle, taskAssigneeId, disabled }: {
  attachments?: Attachment[];
  onUpdate: (newAttachments: Attachment[]) => void;
  taskId: string;
  taskTitle: string;
  taskAssigneeId?: string;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkAberto, setLinkAberto] = useState(false);
  const [docName, setDocName] = useState('');
  const [docLink, setDocLink] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const { allUsers: USERS, currentUser } = useAuth();
  const sortedUsers = currentUser
    ? [currentUser, ...USERS.filter(u => u.id !== currentUser.id)]
    : USERS;
  const { addNotification } = useNotifications();

  const enviarArquivos = async (arquivos: File[]) => {
    if (arquivos.length === 0 || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(
        arquivos.map(async file => {
          const attId = novoId();
          const path = `tasks/${taskId}/${attId}_${sanitizeFileName(file.name)}`;
          const url = await uploadToStorage('attachments', path, file, UPLOAD_LIMITS.task);
          return { id: attId, name: file.name, url, size: file.size, isLink: false, approvalStatus: 'none' as const };
        })
      );
      onUpdate([...attachments, ...uploaded]);
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao enviar arquivo.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsUploading(false);
    }
  };

  const fecharLink = () => { setLinkAberto(false); setDocName(''); setDocLink(''); };

  const handleAddLink = () => {
    if (!docName || !docLink) return;
    onUpdate([...attachments, { id: novoId(), name: docName, url: docLink, size: 0, isLink: true, approvalStatus: 'none' }]);
    fecharLink();
  };

  const updateAttachmentStatus = (id: string, updates: Partial<Attachment>) => {
    const att = attachments.find(a => a.id === id);
    if (!att) return;

    if (updates.approvalStatus === 'pending' && updates.approverId) {
      addNotification({
        userId: updates.approverId,
        actorId: currentUser?.id || 'system',
        taskId: taskId,
        targetId: att.id,
        type: 'review_requested',
        message: 'Aprovação de Documento',
        details: `Você foi selecionado para aprovar o documento "${att.name}" na tarefa "${taskTitle}".`
      });
    } else if ((updates.approvalStatus === 'approved' || updates.approvalStatus === 'rejected') && taskAssigneeId) {
      const aprovado = updates.approvalStatus === 'approved';
      addNotification({
        userId: taskAssigneeId,
        actorId: currentUser?.id || 'system',
        taskId: taskId,
        targetId: att.id,
        type: updates.approvalStatus,
        message: aprovado ? 'Documento Aprovado' : 'Documento Reprovado',
        details: `O documento "${att.name}" na tarefa "${taskTitle}" foi ${aprovado ? 'aprovado' : 'reprovado'}.`
      });
    }

    onUpdate(attachments.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const VISIVEL_HOVER = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity';

  return (
    <div className="flex flex-col gap-3">
      {attachments.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-900">
          {attachments.map(att => {
            const selo = att.approvalStatus ? SELO_APROVACAO[att.approvalStatus] : undefined;
            const Icone = att.isLink ? Link2 : FileText;
            return (
              <li id={`target-${att.id}`} key={att.id} className="group flex flex-wrap items-center gap-x-3 min-h-11 -mx-2 px-2 rounded-lg hover:bg-[#161619] transition-colors">
                <Icone size={16} className="shrink-0 text-zinc-400" aria-hidden />
                <span className="min-w-0 max-w-full text-body text-zinc-200 truncate" title={att.name}>{att.name}</span>
                {!att.isLink && att.size > 0 && <span className="shrink-0 text-body text-zinc-500 tabular-nums">{formatarTamanho(att.size)}</span>}
                {selo && <span className={`shrink-0 inline-flex items-center h-6 px-2 rounded-md border text-caption font-medium ${selo.cls}`}>{selo.rotulo}</span>}

                <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
                  {att.approvalStatus === 'pending' && !disabled && (
                    <>
                      <button type="button" onClick={() => updateAttachmentStatus(att.id, { approvalStatus: 'approved' })} className={`${BOTAO_GHOST} hover:!text-emerald-400`}>
                        <Check size={14} aria-hidden /> Aprovar
                      </button>
                      <button type="button" onClick={() => updateAttachmentStatus(att.id, { approvalStatus: 'rejected' })} className={`${BOTAO_GHOST} hover:!text-red-400`}>
                        <X size={14} aria-hidden /> Reprovar
                      </button>
                    </>
                  )}
                  {(!att.approvalStatus || att.approvalStatus === 'none') && !disabled && (
                    <div className={VISIVEL_HOVER}>
                      <Menu rotulo="Enviar para aprovação" classe={BOTAO_GHOST} alinhar="right" largura="w-60" gatilho={<><UserPlus size={14} aria-hidden /> <span className="hidden sm:inline">Enviar para aprovação</span></>}>
                        {fechar => sortedUsers.map(u => (
                          <ItemMenu key={u.id} onClick={() => { fechar(); updateAttachmentStatus(att.id, { approverId: u.id, approvalStatus: 'pending' }); }}>
                            <img src={u.avatarUrl} alt="" className="size-5 rounded-full object-cover shrink-0" />
                            <span className="truncate">{u.name}</span>
                          </ItemMenu>
                        ))}
                      </Menu>
                    </div>
                  )}
                  <a
                    href={att.url}
                    target={att.isLink ? '_blank' : undefined}
                    rel={att.isLink ? 'noreferrer' : undefined}
                    download={!att.isLink ? att.name : undefined}
                    className={BOTAO_GHOST}
                  >
                    {att.isLink ? <ExternalLink size={14} aria-hidden /> : <Download size={14} aria-hidden />}
                    {att.isLink ? 'Abrir' : 'Baixar'}
                  </a>
                  {!disabled && (
                    <button type="button" onClick={() => onUpdate(attachments.filter(a => a.id !== att.id))} aria-label={`Remover ${att.name}`} title="Remover" className={`${BOTAO_ICONE} ${VISIVEL_HOVER} hover:!text-red-400`}>
                      <X size={15} aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (linkAberto ? (
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" autoFocus value={docName} onChange={e => setDocName(e.target.value)} placeholder="Nome" aria-label="Nome do documento" className={`${CAMPO} flex-1 basis-40`} />
          <input
            type="text"
            value={docLink}
            onChange={e => setDocLink(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
            placeholder="https://"
            aria-label="Endereço do link"
            className={`${CAMPO} flex-[2] basis-56`}
          />
          <button type="button" onClick={handleAddLink} disabled={!docName || !docLink} className={BOTAO_BORDA}>Adicionar link</button>
          <button type="button" onClick={fecharLink} className={`${BOTAO_GHOST} h-9`}>Cancelar</button>
        </div>
      ) : (
        <div
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
          onDrop={e => {
            e.preventDefault();
            setArrastando(false);
            enviarArquivos(Array.from(e.dataTransfer.files));
          }}
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl border border-dashed transition-colors ${arrastando ? 'border-blue-500/60 bg-blue-500/10' : 'border-zinc-700'}`}
        >
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={BOTAO_BORDA}>
            <Upload size={15} aria-hidden /> {isUploading ? 'Enviando…' : 'Adicionar arquivo'}
          </button>
          <button type="button" onClick={() => setLinkAberto(true)} className={`${BOTAO_GHOST} h-9 ${FOCO}`}>
            <Link2 size={15} aria-hidden /> Adicionar link
          </button>
          <span className="text-body text-zinc-500">ou arraste os arquivos para cá</span>
        </div>
      ))}

      {uploadError && <p role="alert" className="text-body text-red-400">{uploadError}</p>}

      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={e => enviarArquivos(Array.from(e.target.files ?? []))} />
    </div>
  );
}
