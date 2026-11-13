import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Task, Subtask, SocialMediaApprovalData } from '../types';
import { Heart, MessageCircle, Send, Bookmark, User, CheckCircle2, X, Clock, ChevronLeft, ChevronRight, ChevronDown, Check, Upload, Link2, Loader2, ImagePlus } from 'lucide-react';
import TaskChat from './TaskChat';
import RichTextEditor from './RichTextEditor';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { UPLOAD_LIMITS, uploadToStorage, sanitizeFileName } from '../lib/storage';
import { CANAIS, FORMATOS } from '../lib/redeSocial';

interface SocialMediaApprovalProps {
  task: Task;
  allTasks: Task[];
  saveChange: (updates: Partial<Task>) => void;
  currentUser: any;
}

function MinimalSelect({ value, onChange, options, placeholder, disabled, className = '', openUp = true }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o: any) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-zinc-900/40 hover:bg-zinc-800/60 border border-zinc-800/50 rounded-md px-3 py-2 text-xs text-zinc-300 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="truncate pr-2 text-zinc-300 font-medium">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && !disabled && (
        <div className={`absolute ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} left-0 right-0 bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 py-1 max-h-48 overflow-y-auto animate-scale-in`}>
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">Nenhuma opção disponível</div>
          ) : (
            options.map((opt: any) => (
              <div 
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between hover:bg-zinc-800/50 transition-colors ${value === opt.value ? 'text-zinc-100 bg-zinc-800/30' : 'text-zinc-400'}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.avatarUrl ? (
                    <img src={opt.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : opt.initials ? (
                    <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-bold shrink-0 text-zinc-100">
                      {opt.initials}
                    </div>
                  ) : null}
                  <span className="truncate">{opt.label}</span>
                </div>
                {value === opt.value && <Check size={14} className="text-emerald-500 shrink-0 ml-2" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Alterna entre a entrega já aprovada e o conteúdo criado direto no painel. */
function SourceToggle({ value, onChange, disabled, approvedLabel, customLabel }: {
  value: 'approved' | 'custom';
  onChange: (v: 'approved' | 'custom') => void;
  disabled?: boolean;
  approvedLabel: string;
  customLabel: string;
}) {
  return (
    <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/50 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {([['approved', approvedLabel], ['custom', customLabel]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            value === key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SocialMediaApproval({ task, allTasks, saveChange, currentUser }: SocialMediaApprovalProps) {
  const approvalData: SocialMediaApprovalData = task.socialMediaApproval || {};
  const status = approvalData.status || 'pending';
  const isLocked = status === 'review_requested' || status === 'approved';

  const { allUsers } = useAuth();
  const { addNotification } = useNotifications();
  const [pendingApproverId, setPendingApproverId] = useState<string>(approvalData.approverId || '');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Reset slide index when image changes
  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [approvalData.selectedDesignDeliveryId]);

  // 1. Gather all Design deliveries from child tasks
  const designTasks = useMemo(() => {
    return allTasks.filter(t => 
      t.parentTaskId === task.id && 
      t.labels.some(l => l.name === 'Design')
    );
  }, [allTasks, task.id]);

  const approvedImages = useMemo(() => {
    const images: { taskId: string; deliveryId: string; url: string; urls: string[]; title: string }[] = [];
    designTasks.forEach(dt => {
      if (dt.designBriefing?.deliveries) {
        dt.designBriefing.deliveries.forEach((del, idx) => {
          if (del.status === 'approved' && (del.imageUrl || (del.imageUrls && del.imageUrls.length > 0))) {
            const urls = del.imageUrls && del.imageUrls.length > 0 ? del.imageUrls : [del.imageUrl].filter(Boolean) as string[];
            images.push({
              taskId: dt.id,
              deliveryId: del.id,
              url: urls[0],
              urls: urls,
              title: `${dt.title} - Imagem ${idx + 1}`
            });
          }
        });
      }
    });
    return images;
  }, [designTasks]);

  // 2. Gather all Copy texts from child tasks
  const copyTasks = useMemo(() => {
    return allTasks.filter(t => 
      t.parentTaskId === task.id && 
      t.labels.some(l => l.name === 'Copy')
    );
  }, [allTasks, task.id]);

  const approvedCopies = useMemo(() => {
    const copies: { taskId: string; editorId: string; content: string; title: string }[] = [];
    copyTasks.forEach(ct => {
      if (ct.copyBriefing?.copyEditors) {
        ct.copyBriefing.copyEditors.forEach(editor => {
          // Assuming we list all editors or only if the task itself is done? 
          // For now, let's list all copy editors in the child task. 
          // Ideally, we check if they are "approved", but Copy editors don't have a status field in CopyEditorItem.
          // The task itself might be 'done'.
          if (editor.content) {
             copies.push({
               taskId: ct.id,
               editorId: editor.id,
               content: editor.content,
               title: `${ct.title} - ${editor.name}`
             });
          }
        });
      }
    });
    return copies;
  }, [copyTasks]);

  // Selections
  const selectedImage = approvedImages.find(img => img.deliveryId === approvalData.selectedDesignDeliveryId);
  const selectedCopy = approvedCopies.find(c => c.editorId === approvalData.selectedCopyEditorId);

  const imageSource = approvalData.imageSource || 'approved';
  const copySource = approvalData.copySource || 'approved';
  const customImageUrls = approvalData.customImageUrls || [];

  // O salvamento do copy manual é debounced, então o handler precisa enxergar o
  // estado mais recente — sem o ref ele reescreveria com o approvalData de quando
  // o usuário começou a digitar.
  const approvalRef = useRef(approvalData);
  approvalRef.current = approvalData;

  const patch = useCallback((updates: Partial<SocialMediaApprovalData>) => {
    saveChange({ socialMediaApproval: { ...approvalRef.current, ...updates } });
  }, [saveChange]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState(approvalData.customImageFileLink || '');
  const [copyDraft, setCopyDraft] = useState(approvalData.customCopy || '');
  const [copySyncToken, setCopySyncToken] = useState(0);
  const copyDraftRef = useRef(copyDraft);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Acompanha edições vindas de outro usuário (realtime) sem atropelar o que está
  // sendo digitado aqui: enquanto houver save pendente, o texto local manda. O
  // syncToken é o único sinal que autoriza o editor a trocar o conteúdo.
  useEffect(() => {
    if (copySaveTimer.current) return;
    const incoming = approvalData.customCopy || '';
    if (incoming === copyDraftRef.current) return;
    copyDraftRef.current = incoming;
    setCopyDraft(incoming);
    setCopySyncToken(t => t + 1);
  }, [approvalData.customCopy]);

  useEffect(() => {
    setLinkDraft(approvalData.customImageFileLink || '');
  }, [approvalData.customImageFileLink]);

  useEffect(() => () => {
    if (copySaveTimer.current) clearTimeout(copySaveTimer.current);
  }, []);

  const displayUrls = imageSource === 'custom' ? customImageUrls : (selectedImage?.urls || []);
  const safeSlideIndex = Math.min(currentSlideIndex, Math.max(displayUrls.length - 1, 0));

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [imageSource, customImageUrls.length]);

  const uploadImages = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0 || isLocked) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const urls = await Promise.all(images.map(file => uploadToStorage(
        'attachments',
        `social-media/${task.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeFileName(file.name)}`,
        file,
        UPLOAD_LIMITS.task
      )));
      patch({
        imageSource: 'custom',
        customImageUrls: [...(approvalRef.current.customImageUrls || []), ...urls]
      });
    } catch (err: any) {
      setUploadError(err?.message || 'Não foi possível enviar a imagem.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeCustomImage = (url: string) => {
    patch({ customImageUrls: (approvalRef.current.customImageUrls || []).filter(u => u !== url) });
  };

  const commitLink = () => {
    const value = linkDraft.trim();
    if (value === (approvalData.customImageFileLink || '')) return;
    patch({ customImageFileLink: value || undefined });
  };

  const handleCopyDraftChange = (html: string) => {
    copyDraftRef.current = html;
    setCopyDraft(html);
    if (copySaveTimer.current) clearTimeout(copySaveTimer.current);
    copySaveTimer.current = setTimeout(() => {
      copySaveTimer.current = null;
      patch({ customCopy: html });
    }, 700);
  };

  /** Garante que o último texto digitado já foi persistido antes de uma ação. */
  const flushCopyDraft = (): Partial<SocialMediaApprovalData> => {
    if (!copySaveTimer.current) return {};
    clearTimeout(copySaveTimer.current);
    copySaveTimer.current = null;
    return { customCopy: copyDraftRef.current };
  };

  const hasImageReady = imageSource === 'custom'
    ? customImageUrls.length > 0 || !!approvalData.customImageFileLink
    : !!approvalData.selectedDesignDeliveryId;
  const hasCopyReady = copySource === 'custom'
    ? copyDraft.replace(/<[^>]*>/g, '').trim().length > 0
    : !!approvalData.selectedCopyEditorId;

  const handleImageSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deliveryId = e.target.value;
    const img = approvedImages.find(i => i.deliveryId === deliveryId);
    saveChange({
      socialMediaApproval: {
        ...approvalData,
        selectedDesignDeliveryId: deliveryId,
        selectedDesignTaskId: img?.taskId
      }
    });
  };

  const handleCopySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const editorId = e.target.value;
    const copy = approvedCopies.find(c => c.editorId === editorId);
    saveChange({
      socialMediaApproval: {
        ...approvalData,
        selectedCopyEditorId: editorId,
        selectedCopyTaskId: copy?.taskId
      }
    });
  };

  const handleSendForApproval = () => {
    if (!pendingApproverId) return;
    saveChange({
      socialMediaApproval: {
        ...approvalData,
        ...flushCopyDraft(),
        status: 'review_requested',
        approverId: pendingApproverId,
        requesterId: currentUser?.id
      }
    });
    addNotification({
      userId: pendingApproverId,
      taskId: task.id,
      targetId: 'socialMediaProps',
      type: 'review_requested',
      actorId: currentUser?.id || '',
      message: 'Aprovação de Publicação',
      details: `Você foi solicitado para aprovar a publicação de "${task.title}".`
    });
  };

  const handleApprove = () => {
    saveChange({
      status: 'done',
      socialMediaApproval: {
        ...approvalData,
        status: 'approved'
      }
    });
    if (approvalData.requesterId) {
      addNotification({
        userId: approvalData.requesterId,
        taskId: task.id,
        targetId: 'socialMediaProps',
        type: 'approved',
        actorId: currentUser?.id || '',
        message: 'Publicação Aprovada',
        details: `Sua publicação de "${task.title}" foi aprovada e a tarefa foi concluída.`
      });
    }
  };

  const handleReject = () => {
    saveChange({
      socialMediaApproval: {
        ...approvalData,
        status: 'rejected'
      }
    });
    if (approvalData.requesterId) {
      addNotification({
        userId: approvalData.requesterId,
        taskId: task.id,
        targetId: 'socialMediaProps',
        type: 'rejected',
        actorId: currentUser?.id || '',
        message: 'Publicação Reprovada',
        details: `Sua publicação de "${task.title}" foi reprovada e precisa de ajustes.`
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row view-gap w-full h-full p-2 overflow-y-auto bg-transparent">
      {/* LEFT COLUMN: IMAGE PREVIEW */}
      <div className="flex-1 min-w-[300px] flex flex-col rounded-md border border-zinc-800/60 overflow-hidden bg-transparent">
        <div className="p-0 border-b border-zinc-800/60 flex-1 flex flex-col bg-zinc-950/30">
           {displayUrls.length > 0 ? (
             <div className="w-full flex-1 flex items-start justify-center overflow-hidden relative group">
               <img src={displayUrls[safeSlideIndex]} alt="Criativo Selecionado" className="w-full h-auto block object-cover" />
               {displayUrls.length > 1 && (
                 <>
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       setCurrentSlideIndex(prev => prev === 0 ? displayUrls.length - 1 : prev - 1);
                     }}
                     className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors z-20 opacity-0 group-hover:opacity-100"
                   >
                     <ChevronLeft size={20} />
                   </button>
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       setCurrentSlideIndex(prev => prev === displayUrls.length - 1 ? 0 : prev + 1);
                     }}
                     className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors z-20 opacity-0 group-hover:opacity-100"
                   >
                     <ChevronRight size={20} />
                   </button>
                   <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 bg-black/40 px-2 py-1 rounded-full">
                     {displayUrls.map((_, idx) => (
                       <div
                         key={idx}
                         className={`w-1.5 h-1.5 rounded-full transition-all ${idx === safeSlideIndex ? 'bg-white scale-125' : 'bg-white/40'}`}
                       />
                     ))}
                   </div>
                 </>
               )}
               {imageSource === 'custom' && !isLocked && (
                 <button
                   onClick={(e) => { e.stopPropagation(); removeCustomImage(displayUrls[safeSlideIndex]); }}
                   title="Remover este print"
                   className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-colors z-20 opacity-0 group-hover:opacity-100"
                 >
                   <X size={14} />
                 </button>
               )}
             </div>
           ) : imageSource === 'custom' ? (
             <div
               onDragOver={(e) => { e.preventDefault(); }}
               onDrop={(e) => { e.preventDefault(); uploadImages(Array.from(e.dataTransfer.files || [])); }}
               onPaste={(e) => {
                 const files = Array.from(e.clipboardData?.files || []);
                 if (files.length) { e.preventDefault(); uploadImages(files); }
               }}
               onClick={() => !isLocked && fileInputRef.current?.click()}
               tabIndex={0}
               className={`w-full flex-1 min-h-[300px] short:min-h-[200px] flex flex-col items-center justify-center gap-2 border border-dashed border-zinc-800 m-3 rounded-md outline-none focus:border-zinc-600 transition-colors ${isLocked ? '' : 'cursor-pointer hover:border-zinc-700'}`}
             >
               {isUploading ? (
                 <Loader2 size={20} className="text-zinc-500 animate-spin" />
               ) : (
                 <ImagePlus size={20} className="text-zinc-600" />
               )}
               <span className="text-zinc-600 text-xs font-medium uppercase tracking-wider">
                 {isUploading ? 'Enviando...' : 'Solte, cole ou clique para enviar o print'}
               </span>
             </div>
           ) : (
             <div className="w-full flex-1 min-h-[300px] short:min-h-[200px] flex items-center justify-center">
                <span className="text-zinc-600 text-xs font-medium uppercase tracking-wider">Nenhuma imagem selecionada</span>
             </div>
           )}
        </div>
        
        <div className="p-4 bg-zinc-950/50">
          <div className="flex items-center justify-between mb-3 text-zinc-400">
            <div className="flex gap-4">
              <Heart size={18} className="hover:text-zinc-200 cursor-pointer transition-colors" />
              <MessageCircle size={18} className="hover:text-zinc-200 cursor-pointer transition-colors" />
              <Send size={18} className="hover:text-zinc-200 cursor-pointer transition-colors" />
            </div>
            <Bookmark size={18} className="hover:text-zinc-200 cursor-pointer transition-colors" />
          </div>
          <div className="flex items-center justify-between mb-2.5">
            <SourceToggle
              value={imageSource}
              onChange={(v) => patch({ imageSource: v })}
              disabled={isLocked}
              approvedLabel="Aprovada"
              customLabel="Enviar print"
            />
            {imageSource === 'custom' && !isLocked && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-zinc-800/50 transition-colors disabled:opacity-50"
              >
                {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {customImageUrls.length > 0 ? 'Adicionar' : 'Enviar'}
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              uploadImages(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />

          {imageSource === 'approved' ? (
            <div className="relative z-30">
              <MinimalSelect
                value={approvalData.selectedDesignDeliveryId || ''}
                onChange={(val: string) => handleImageSelect({ target: { value: val } } as any)}
                options={approvedImages.map(img => ({ value: img.deliveryId, label: img.title }))}
                placeholder="Selecionar Imagem..."
                disabled={isLocked}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {customImageUrls.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
                  {customImageUrls.map((url, idx) => (
                    <div key={url} className="relative shrink-0 group/thumb">
                      <img
                        src={url}
                        alt=""
                        onClick={() => setCurrentSlideIndex(idx)}
                        className={`w-12 h-12 object-cover rounded cursor-pointer border transition-colors ${idx === safeSlideIndex ? 'border-zinc-400' : 'border-zinc-800 hover:border-zinc-600'}`}
                      />
                      {!isLocked && (
                        <button
                          onClick={() => removeCustomImage(url)}
                          className="absolute -top-1 -right-1 p-0.5 bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-red-400 rounded-full opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/50 rounded-md px-3 py-2">
                <Link2 size={14} className="text-zinc-500 shrink-0" />
                <input
                  type="url"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onBlur={commitLink}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  disabled={isLocked}
                  placeholder="Link do arquivo (Drive, Dropbox...)"
                  className="flex-1 bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none disabled:opacity-50"
                />
                {approvalData.customImageFileLink && (
                  <a
                    href={approvalData.customImageFileLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                  >
                    Abrir
                  </a>
                )}
              </div>

              {uploadError && <span className="text-[11px] text-red-400">{uploadError}</span>}
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE COLUMN: COPY & AUTHORIZE */}
      <div className="flex-1 min-w-[300px] flex flex-col gap-4">
        <div className="flex-1 flex flex-col bg-transparent rounded-md border border-zinc-800/60 p-5 relative group">
          {/* Header Profile */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center overflow-hidden">
               <User size={16} />
            </div>
            <span className="text-sm font-medium text-zinc-200">uchoaempreendimentos</span>
          </div>

          {/* Agenda da publicação: alimenta o módulo Rede Social. A data é o prazo da tarefa. */}
          <div className="mb-4 grid grid-cols-[1fr_1fr_auto] gap-2 relative z-40">
            <MinimalSelect
              value={approvalData.canal || ''}
              onChange={(val: string) => patch({ canal: val || undefined })}
              options={[{ value: '', label: 'Sem canal' }, ...CANAIS.map(c => ({ value: c, label: c }))]}
              placeholder="Canal"
              openUp={false}
            />
            <MinimalSelect
              value={approvalData.formato || ''}
              onChange={(val: string) => patch({ formato: val || undefined })}
              options={[{ value: '', label: 'Sem formato' }, ...FORMATOS.map(f => ({ value: f, label: f }))]}
              placeholder="Formato"
              openUp={false}
            />
            <input
              type="time"
              aria-label="Horário da publicação"
              value={approvalData.horario || ''}
              onChange={(e) => patch({ horario: e.target.value || undefined })}
              className="w-[96px] bg-zinc-900/40 hover:bg-zinc-800/60 border border-zinc-800/50 rounded-md px-2.5 py-2 text-xs text-zinc-300 font-medium outline-none [color-scheme:dark]"
            />
          </div>

          <div className="mb-3 flex items-center justify-between gap-2">
            <SourceToggle
              value={copySource}
              onChange={(v) => patch({ copySource: v })}
              disabled={isLocked}
              approvedLabel="Aprovado"
              customLabel="Escrever"
            />
          </div>

          {copySource === 'approved' ? (
            <>
              <div className="mb-4 relative z-20">
                <MinimalSelect
                  value={approvalData.selectedCopyEditorId || ''}
                  onChange={(val: string) => handleCopySelect({ target: { value: val } } as any)}
                  options={approvedCopies.map(copy => ({ value: copy.editorId, label: copy.title }))}
                  placeholder="Selecionar Editor (Copy)..."
                  disabled={isLocked}
                />
              </div>

              {/* Copy Text Preview */}
              <div className="flex-1 overflow-y-auto text-[13px] text-zinc-400 whitespace-pre-wrap pr-2 scrollbar-thin leading-relaxed">
                {selectedCopy ? (
                   <div dangerouslySetInnerHTML={{ __html: selectedCopy.content }} className="prose prose-invert prose-sm max-w-none" />
                ) : (
                   <div className="space-y-2 opacity-20 pointer-events-none mt-2">
                     <div className="h-1.5 w-full bg-zinc-400 rounded-full"></div>
                     <div className="h-1.5 w-11/12 bg-zinc-400 rounded-full"></div>
                     <div className="h-1.5 w-4/5 bg-zinc-400 rounded-full"></div>
                     <div className="h-1.5 w-full bg-zinc-400 rounded-full"></div>
                     <div className="h-1.5 w-3/4 bg-zinc-400 rounded-full"></div>
                   </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-[200px] overflow-hidden">
              <RichTextEditor
                taskId={`social-copy-${task.id}`}
                content={copyDraft}
                variant="borderless"
                wrapperClassName="h-full"
                readOnly={isLocked}
                syncToken={copySyncToken}
                onChange={handleCopyDraftChange}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        {status === 'pending' || status === 'rejected' ? (
          <div className="flex flex-col gap-3 w-full mt-2">
            <div className="relative z-10">
              <MinimalSelect
                value={pendingApproverId}
                onChange={(val: string) => setPendingApproverId(val)}
                options={allUsers.map(u => ({ 
                  value: u.id, 
                  label: u.name,
                  avatarUrl: u.avatarUrl,
                  initials: u.initials
                }))}
                placeholder="Selecione o aprovador..."
                openUp={true}
              />
            </div>
            <button 
              onClick={handleSendForApproval}
              disabled={!pendingApproverId || !hasImageReady || !hasCopyReady}
              className="w-full py-3 rounded-md font-semibold tracking-wide text-xs transition-colors bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send size={14} /> Enviar para Aprovação
            </button>
          </div>
        ) : status === 'review_requested' ? (
          currentUser?.id === approvalData.approverId ? (
            <div className="flex gap-3 w-full mt-2">
              <button 
                onClick={handleReject}
                className="flex-1 py-3 rounded-md font-semibold tracking-wide text-xs bg-transparent hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <X size={14} /> Reprovar
              </button>
              <button 
                onClick={handleApprove}
                className="flex-1 py-3 rounded-md font-semibold tracking-wide text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={14} /> Aprovar
              </button>
            </div>
          ) : (
            <div className="w-full py-3 mt-2 text-center text-xs font-medium text-zinc-500 border border-dashed border-zinc-800 rounded-md flex flex-col items-center gap-1">
              <Clock size={16} className="text-zinc-600 mb-1" />
              Aguardando aprovação de<br/>
              <span className="text-zinc-400">{allUsers.find(u => u.id === approvalData.approverId)?.name}</span>
            </div>
          )
        ) : status === 'approved' ? (
          <div className="w-full py-3 mt-2 rounded-md font-semibold tracking-wide text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center gap-2">
            <CheckCircle2 size={14} /> Aprovado e Finalizado
          </div>
        ) : null}
      </div>

      {/* RIGHT COLUMN: CHAT */}
      <div className="flex-1 min-w-[300px] flex flex-col bg-transparent rounded-md border border-zinc-800/60 overflow-hidden relative">
        <div className="h-full relative opacity-90 hover:opacity-100 transition-opacity">
          <TaskChat task={task} onUpdate={(messages) => saveChange({ chatMessages: messages })} />
        </div>
      </div>
    </div>
  );
}
