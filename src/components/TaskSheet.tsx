import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { 
  X, 
  Trash2, 
  CheckSquare, 
  Square, 
  Plus, 
  Calendar as CalendarIcon, 
  Tag as TagIcon, 
  User as UserIcon, 
  Folder as FolderIcon,
  Flag,
  CircleDot,
  Trash,
  CheckCircle2,
  Bookmark,
  Clock,
  HelpCircle,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Layers,
  Inbox,
  PenTool,
  Type,
  DollarSign,
  Share2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Maximize2,
  Minimize2,
  XSquare,
  Bell,
  FileText,
  Paperclip,
  Link2,
  UserPlus,
  Check,
  ExternalLink,
  Download,
  GitFork,
  Columns,
  Search,
  Lock,
  Unlock,
  Repeat,
  GripVertical,
  History as HistoryIcon
} from 'lucide-react';
import DatePicker from './DatePicker';
import ReminderBell from './ReminderBell';
import RichTextEditor from './RichTextEditor';
import DesignProperties from './DesignProperties';
import CopyProperties from './CopyProperties';
import BudgetProperties from './BudgetProperties';
import PlanningProperties from './PlanningProperties';
import RoutineProperties from './RoutineProperties';
import SocialMediaApproval from './SocialMediaApproval';
import TaskChat from './TaskChat';
import TaskHistoryPanel from './TaskHistoryPanel';
import { Task, Subtask, TaskStatus, TaskPriority, Label, Project, Attachment, PendingDeadlineChange } from '../types';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { uploadToStorage, UPLOAD_LIMITS, sanitizeFileName } from '../lib/storage';
import { useSyncManager } from '../lib/SyncManager';
import { logTaskFieldHistory } from '../lib/api';
import ProjetoPicker from './marketing/ProjetoPicker';
import { useMarketingProjetos, formatarData } from '../lib/marketingProjetos';

type EditorPresence = { name: string; avatarUrl?: string; color: string };

interface TaskSheetProps {
  task: Task | null;
  isOpen: boolean;
  onClose: (localTaskState?: any) => void;
  projects: Project[];
  allLabels: Label[];
  onUpdateTask: (updated: Task) => void;
  onDeleteTask: (taskId: string) => void;
  allTasks?: Task[];
  onAddTask?: (task: Task) => void;
  onSelectTask?: (task: Task) => void;
  isCompareChild?: boolean;
  editingBy?: EditorPresence;
  editingMap?: Record<string, EditorPresence>;
  cooldown?: { name: string, expiresAt: number };
  briefingsLoading?: boolean;
}

const priorities: { value: TaskPriority; label: string; badgeStyle: string; icon: React.ReactNode }[] = [
  { value: 'no_priority', label: 'Sem Prioridade', badgeStyle: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/15 hover:bg-zinc-500/20', icon: null },
  { value: 'low', label: 'Baixa', badgeStyle: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15 hover:bg-emerald-500/20', icon: <ArrowDown size={10} className="shrink-0" /> },
  { value: 'medium', label: 'Média', badgeStyle: 'text-blue-400 bg-blue-500/10 border-blue-500/15 hover:bg-blue-500/20', icon: null },
  { value: 'high', label: 'Alta', badgeStyle: 'text-orange-400 bg-orange-500/10 border-orange-500/15 hover:bg-orange-500/20', icon: <ArrowUp size={10} className="shrink-0" /> },
  { value: 'urgent', label: 'Urgente', badgeStyle: 'text-red-400 bg-red-500/10 border-red-500/15 hover:bg-red-500/20', icon: <AlertTriangle size={10} className="shrink-0" /> },
];

const statuses: { value: TaskStatus; label: string; color: string; dotColor: string; icon: React.ReactNode }[] = [
  { value: 'no_forecast', label: 'Sem previsão', color: 'bg-slate-700/50 text-slate-300', dotColor: 'bg-slate-500', icon: <Inbox size={12} className="shrink-0" /> },
  { value: 'todo', label: 'A fazer', color: 'bg-blue-900/40 text-blue-300 border border-blue-500/20', dotColor: 'bg-blue-500', icon: <HelpCircle size={12} className="shrink-0" /> },
  { value: 'in_progress', label: 'Em progresso', color: 'bg-amber-900/40 text-amber-300 border border-amber-500/20', dotColor: 'bg-amber-500', icon: <Clock size={12} className="shrink-0 animate-pulse" /> },
  { value: 'paused', label: 'Pausado', color: 'bg-red-900/40 text-red-300 border border-red-500/20', dotColor: 'bg-red-400', icon: <AlertTriangle size={12} className="shrink-0" /> },
  { value: 'approval', label: 'Aprovação', color: 'bg-purple-900/40 text-purple-300 border border-purple-500/20', dotColor: 'bg-purple-500', icon: <HelpCircle size={12} className="shrink-0" /> },
  { value: 'rework', label: 'Refação', color: 'bg-orange-900/40 text-orange-300 border border-orange-500/20', dotColor: 'bg-orange-500', icon: <ArrowDown size={12} className="shrink-0" /> },
  { value: 'implementation', label: 'Implementação', color: 'bg-blue-900/40 text-blue-300 border border-blue-500/20', dotColor: 'bg-blue-500', icon: <Layers size={12} className="shrink-0" /> },
  { value: 'done', label: 'Concluído', color: 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/20', dotColor: 'bg-emerald-500', icon: <CheckCircle2 size={12} className="shrink-0" /> },
];

const AttachmentsSection = ({ attachments = [], onUpdate, taskId, taskTitle, taskAssigneeId, disabled }: { attachments?: Attachment[], onUpdate: (newAttachments: Attachment[]) => void, taskId: string, taskTitle: string, taskAssigneeId?: string, disabled?: boolean }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<'link' | 'file'>('link');
  const [docName, setDocName] = useState('');
  const [docLink, setDocLink] = useState('');
  const [approverMenuOpenFor, setApproverMenuOpenFor] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { allUsers: USERS, currentUser } = useAuth();
  const sortedUsers = currentUser
    ? [currentUser, ...USERS.filter(u => u.id !== currentUser.id)]
    : USERS;
  const { addNotification } = useNotifications();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async file => {
          const attId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const safeName = sanitizeFileName(file.name);
          const path = `tasks/${taskId}/${attId}_${safeName}`;
          const url = await uploadToStorage('attachments', path, file, UPLOAD_LIMITS.task);
          return { id: attId, name: docName || file.name, url, size: file.size, isLink: false, approvalStatus: 'none' as const };
        })
      );
      onUpdate([...attachments, ...uploaded]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      resetAddState();
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao enviar arquivo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddLink = () => {
    if (!docName || !docLink) return;
    const newAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: docName,
      url: docLink,
      size: 0,
      isLink: true,
      approvalStatus: 'none' as const
    };
    onUpdate([...attachments, newAttachment]);
    resetAddState();
  };

  const resetAddState = () => {
    setIsAdding(false);
    setDocName('');
    setDocLink('');
  };

  const removeAttachment = (id: string) => {
    onUpdate(attachments.filter(a => a.id !== id));
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
    } else if (updates.approvalStatus === 'approved' || updates.approvalStatus === 'rejected') {
      if (taskAssigneeId) {
        addNotification({
          userId: taskAssigneeId,
          actorId: currentUser?.id || 'system',
          taskId: taskId,
          targetId: att.id,
          type: updates.approvalStatus === 'approved' ? 'approved' : 'rejected',
          message: updates.approvalStatus === 'approved' ? 'Documento Aprovado' : 'Documento Reprovado',
          details: `O documento "${att.name}" na tarefa "${taskTitle}" foi ${updates.approvalStatus === 'approved' ? 'aprovado' : 'reprovado'}.`
        });
      }
    }

    onUpdate(attachments.map(a => a.id === id ? { ...a, ...updates } : a));
    setApproverMenuOpenFor(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {attachments.map(att => (
            <div id={`target-${att.id}`} key={att.id} className="group relative flex items-center justify-between p-2 rounded-md border border-zinc-800/60 bg-[#121214] hover:bg-[#18181b] hover:border-zinc-700/80 transition-all">
              <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                <div className="w-6 h-6 rounded bg-zinc-800/50 flex items-center justify-center shrink-0">
                  {att.isLink ? <Link2 size={12} className="text-zinc-400" /> : <FileText size={12} className="text-zinc-400" />}
                </div>
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  <span className="text-xs font-medium text-zinc-200 truncate">{att.name}</span>
                  {!att.isLink && <span className="text-[10px] text-zinc-600 font-mono">{formatSize(att.size)}</span>}
                  
                  {/* Status Badges */}
                  {att.approvalStatus === 'pending' && (
                    <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                      Em análise
                    </span>
                  )}
                  {att.approvalStatus === 'approved' && (
                    <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      Aprovado
                    </span>
                  )}
                  {att.approvalStatus === 'rejected' && (
                    <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                      Reprovado
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {/* Approval Action Buttons (visible when pending) */}
                {att.approvalStatus === 'pending' && (
                  <div className="flex items-center gap-0.5 mr-2">
                    <button type="button" onClick={() => updateAttachmentStatus(att.id, { approvalStatus: 'approved' })} className="p-1 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors" title="Aprovar">
                      <Check size={13} strokeWidth={3} />
                    </button>
                    <button type="button" onClick={() => updateAttachmentStatus(att.id, { approvalStatus: 'rejected' })} className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Reprovar">
                      <X size={13} strokeWidth={3} />
                    </button>
                  </div>
                )}

                {/* Send to Approval Button (hover) */}
                {(!att.approvalStatus || att.approvalStatus === 'none') && (
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setApproverMenuOpenFor(approverMenuOpenFor === att.id ? null : att.id)}
                      className="p-1 px-2 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1"
                    >
                      <UserPlus size={11} /> Enviar para aprovação
                    </button>

                    {/* Approver Dropdown */}
                    {approverMenuOpenFor === att.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 overflow-hidden animate-fade-in">
                        <div className="px-2 py-1.5 border-b border-zinc-800/80">
                          <span className="text-[10px] font-semibold text-zinc-500 uppercase">Selecionar Aprovador</span>
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {sortedUsers.map(u => (
                            <button
                              type="button"
                              key={u.id}
                              onClick={() => updateAttachmentStatus(att.id, { approverId: u.id, approvalStatus: 'pending' })}
                              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 transition-colors text-left"
                            >
                              <img src={u.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                              <span className="text-xs text-zinc-300">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Always visible Open button */}
                <a 
                  href={att.url} 
                  target={att.isLink ? "_blank" : undefined}
                  download={!att.isLink ? att.name : undefined} 
                  className="p-1 px-2 text-[10px] font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors flex items-center gap-1"
                >
                  {att.isLink ? <ExternalLink size={11} /> : <Download size={11} />}
                  Abrir
                </a>

                {/* Remove Button (hover) */}
                <button type="button" onClick={() => removeAttachment(att.id)} className="p-1 ml-1 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors opacity-0 group-hover:opacity-100" title="Remover">
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Add New Attachment */}
      {!disabled && !isAdding ? (
        <button 
          type="button"
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/30 rounded-lg text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-all"
        >
          <Plus size={13} />
          Anexar documento ou link
        </button>
      ) : !disabled && (
        <div className="flex items-center gap-2 p-1.5 border border-zinc-800 rounded-lg bg-[#0e0e10] animate-fade-in">
          <input
            type="text"
            autoFocus
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Nome do documento..."
            className="flex-1 min-w-[120px] bg-transparent border-none text-xs text-zinc-200 placeholder-zinc-600 focus:ring-0 px-2 h-7"
          />
          <div className="w-[1px] h-4 bg-zinc-800" />
          
          {addMode === 'link' ? (
            <input
              type="text"
              value={docLink}
              onChange={(e) => setDocLink(e.target.value)}
              placeholder="Colar link..."
              className="flex-1 min-w-[150px] bg-transparent border-none text-xs text-zinc-200 placeholder-zinc-600 focus:ring-0 px-2 h-7"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLink();
                }
              }}
            />
          ) : (
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-w-[150px] flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 px-2 h-7 transition-colors"
            >
              <Paperclip size={12} /> Selecionar do computador
            </button>
          )}

          <div className="flex items-center gap-1 shrink-0 px-1">
            <button 
              type="button"
              onClick={() => setAddMode(addMode === 'link' ? 'file' : 'link')}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 bg-zinc-900 rounded hover:bg-zinc-800 transition-colors"
              title={addMode === 'link' ? "Mudar para Arquivo" : "Mudar para Link"}
            >
              {addMode === 'link' ? <Paperclip size={12} /> : <Link2 size={12} />}
            </button>
            <button
              type="button"
              onClick={addMode === 'link' ? handleAddLink : () => fileInputRef.current?.click()}
              disabled={!docName || (addMode === 'link' && !docLink) || isUploading}
              className="px-3 h-7 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? '...' : 'Add'}
            </button>
            <button type="button" onClick={resetAddState} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {isUploading && (
        <p className="text-[11px] text-blue-400 px-1">Enviando arquivo...</p>
      )}
      {uploadError && (
        <p className="text-[11px] text-red-400 px-1">{uploadError}</p>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="*"
        multiple
        onChange={handleFileChange}
      />
    </div>
  );
};

const TitleInput = ({ taskId, initialValue, onChange, missingTitle, disabled }: { taskId: string, initialValue: string, onChange: (val: string) => void, missingTitle: boolean, disabled?: boolean }) => {
  const [val, setVal] = useState(initialValue);
  
  useEffect(() => {
    if (disabled || val === initialValue) return; // Keep uncontrolled if they type. But wait, if disabled we DO want to update.
    // Actually, just:
    if (disabled) setVal(initialValue);
  }, [initialValue, disabled]);

  useEffect(() => {
    // Only reset on new task
    setVal(initialValue);
  }, [taskId]);

  return (
    <textarea
      value={val}
      disabled={disabled}
      onChange={(e) => {
        if (disabled) return;
        setVal(e.target.value);
        onChange(e.target.value);
      }}
      placeholder="Dê um nome para sua tarefa..."
      rows={2}
      className={`w-full bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none focus:border-0 outline-none text-2xl font-bold placeholder-zinc-500 resize-none leading-tight ${missingTitle ? 'text-red-400 placeholder:text-red-400/50' : 'text-zinc-100'} ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
    />
  );
};

const SubtaskInput = ({ subtaskId, initialValue, onChange, onKeyDown, disabled, completed, canceled }: { subtaskId: string, initialValue: string, onChange: (val: string) => void, onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void, disabled?: boolean, completed?: boolean, canceled?: boolean }) => {
  const [val, setVal] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (disabled) setVal(initialValue);
  }, [initialValue, disabled]);
  
  useEffect(() => setVal(initialValue), [subtaskId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [val]);

  let textStyle = "text-zinc-300";
  if (canceled) {
    textStyle = "text-zinc-500 line-through";
  } else if (completed) {
    textStyle = "text-zinc-400"; // Maybe slightly subdued for completed too, but primarily canceled needs line-through
  }

  return (
    <textarea
      ref={textareaRef}
      id={`subtask-input-${subtaskId}`}
      rows={1}
      value={val}
      disabled={disabled}
      onChange={(e) => {
        if (disabled) return;
        setVal(e.target.value);
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (onKeyDown) onKeyDown(e);
      }}
      className={`flex-1 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none focus:border-0 outline-none text-xs font-normal ${textStyle} placeholder-zinc-600 resize-none overflow-hidden block w-full py-0 ${disabled ? 'opacity-70 cursor-not-allowed' : ''} transition-colors`}
      placeholder="Descreva a subtarefa..."
    />
  );
};

const SubtaskRow = ({
  subtask,
  index,
  effectiveLock,
  sortedUsers,
  subtaskAssigneeMenuOpenFor,
  setSubtaskAssigneeMenuOpenFor,
  onToggle,
  onEditTitle,
  onKeyDown,
  onSetAssignee,
  onSetReminder,
  onDelete,
}: {
  subtask: Subtask;
  index: number;
  effectiveLock?: boolean;
  sortedUsers: any[];
  subtaskAssigneeMenuOpenFor: string | null;
  setSubtaskAssigneeMenuOpenFor: (id: string | null) => void;
  onToggle: (id: string) => void;
  onEditTitle: (id: string, val: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, id: string) => void;
  onSetAssignee: (id: string, userId: string) => void;
  onSetReminder: (id: string, update: { reminderDate?: string; reminderType?: '3h' | '1d' | 'custom' | 'seen' }) => void;
  onDelete: (id: string) => void;
}) => {
  const dragControls = useDragControls();
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState<'top' | 'bottom'>('bottom');

  useEffect(() => {
    if (subtaskAssigneeMenuOpenFor === subtask.id && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        setPopoverPosition('top');
      } else {
        setPopoverPosition('bottom');
      }
    }
  }, [subtaskAssigneeMenuOpenFor, subtask.id]);

  return (
    <Reorder.Item
      id={`target-${subtask.id}`}
      value={subtask.id}
      dragListener={false}
      dragControls={dragControls}
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      style={{ marginLeft: `${(subtask.level || 0) * 1.5}rem` }}
      className="flex items-center justify-between py-1 px-1 -mx-1 rounded group transition-colors border-b border-transparent hover:bg-zinc-800/40 hover:border-zinc-800/50"
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {!effectiveLock && (
          <span
            onPointerDown={(e) => dragControls.start(e)}
            className="shrink-0 flex items-center justify-center text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity -ml-1 mt-[1.5px]"
            style={{ touchAction: 'none' }}
            title="Arrastar para reordenar"
          >
            <GripVertical size={13} />
          </span>
        )}
        <button onClick={() => onToggle(subtask.id)} disabled={!!effectiveLock} className="shrink-0 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed mt-[1.5px]">
          {subtask.completed ? (
            <CheckSquare size={13} className="text-emerald-400/50" />
          ) : subtask.canceled ? (
            <XSquare size={13} className="text-red-400/50" />
          ) : (
            <Square size={13} className="text-gray-500 hover:text-gray-300" />
          )}
        </button>
        <SubtaskInput
          subtaskId={subtask.id}
          initialValue={subtask.title}
          disabled={!!effectiveLock}
          completed={subtask.completed}
          canceled={subtask.canceled}
          onChange={(val) => onEditTitle(subtask.id, val)}
          onKeyDown={(e) => onKeyDown(e, index, subtask.id)}
        />
      </div>
      {!effectiveLock && (
      <div className={`flex items-center ml-2 shrink-0 gap-1 transition-opacity ${subtask.assigneeId || subtask.reminderType || ((subtask.completed || subtask.canceled) && subtask.completedAt) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {(subtask.completed || subtask.canceled) && subtask.completedAt && (
          <div className="flex flex-col items-center justify-center text-[9px] font-mono text-zinc-500 leading-[10px] mr-1" title={subtask.canceled ? "Cancelado em" : "Concluído em"}>
            <span>{new Date(subtask.completedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            <span>{new Date(subtask.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        {/* Assignee Dropdown */}
        <div className="relative" ref={containerRef}>
          <button
            type="button"
            onClick={() => setSubtaskAssigneeMenuOpenFor(subtaskAssigneeMenuOpenFor === subtask.id ? null : subtask.id)}
            className={`p-1 rounded flex items-center gap-1 text-[10px] font-medium transition-colors hover:bg-zinc-800/80 ${subtask.assigneeId ? '' : 'text-zinc-500 hover:text-blue-400'}`}
            title={subtask.assigneeId ? "Alterar responsável" : "Definir responsável"}
          >
            {subtask.assigneeId ? (
              <img src={sortedUsers.find(u => u.id === subtask.assigneeId)?.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
            ) : (
              <UserIcon size={14} />
            )}
          </button>

          {subtaskAssigneeMenuOpenFor === subtask.id && (
            <div ref={menuRef} className={`absolute right-0 ${popoverPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} w-48 bg-[#18181b] border border-zinc-800 rounded-md shadow-xl z-50 overflow-hidden animate-fade-in`}>
              <div className="px-2 py-1.5 border-b border-zinc-800/80">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Responsável pelo Item</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => onSetAssignee(subtask.id, '')}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 transition-colors text-left text-zinc-400"
                >
                  <UserIcon size={12} />
                  <span className="text-xs">Remover responsável</span>
                </button>
                {sortedUsers.map(u => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => onSetAssignee(subtask.id, u.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <img src={u.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                    <span className="text-xs text-zinc-300">{u.name}</span>
                    {subtask.assigneeId === u.id && <Check size={12} className="text-blue-400 ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lembrete do item do checklist */}
        <ReminderBell
          reminderDate={subtask.reminderDate}
          reminderType={subtask.reminderType}
          onChange={(update) => onSetReminder(subtask.id, update)}
          size={11}
          showLabel={true}
          align="right"
          disableAutoScroll={true}
        />
        <button
          onClick={() => onDelete(subtask.id)}
          className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/80 rounded transition-colors"
          title="Remover"
        >
          <Trash2 size={12} />
        </button>
      </div>
      )}
    </Reorder.Item>
  );
};

export default function TaskSheet({
  task,
  isOpen,
  onClose,
  projects,
  allLabels,
  onUpdateTask,
  onDeleteTask,
  allTasks = [],
  onAddTask,
  onSelectTask,
  isCompareChild = false,
  editingBy,
  editingMap,
  cooldown,
  briefingsLoading = false
}: TaskSheetProps) {
  const { allUsers: USERS, currentUser } = useAuth();
  const sortedUsers = currentUser
    ? [currentUser, ...USERS.filter(u => u.id !== currentUser.id)]
    : USERS;
  const { addNotification, notifications } = useNotifications();
  const { setDescriptionBase, onDescriptionConflict } = useSyncManager();
  const titleRef = useRef(task?.title || '');
  const descriptionRef = useRef(task?.description || '');
  // Última descrição conhecida como vinda do servidor. Serve para dois fins:
  // detectar se o texto no editor tem edições locais ainda não salvas, e não
  // reprocessar o mesmo valor a cada render.
  const lastServerDescRef = useRef<string | null>(null);
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const descTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Value of description/copyBriefing when this editing session started (task
  // opened). Used to log one history entry per session, on close, instead of
  // one per autosave.
  const descSessionBaselineRef = useRef<string>('');
  const copyBriefingSessionBaselineRef = useRef<string>('{}');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'no_priority');
  const [projectId, setProjectId] = useState(task?.projectId || '');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [taskLabels, setTaskLabels] = useState<Label[]>(task?.labels || []);
  const [dueDate, setDueDate] = useState<string | undefined>(task?.dueDate);
  const [reminderDate, setReminderDate] = useState<string | undefined>(task?.reminderDate);
  const [assigneeId, setAssigneeId] = useState<string | undefined>(task?.assigneeId);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [isPriorityOpen, setPriorityOpen] = useState(false);
  const [isProjectOpen, setProjectOpen] = useState(false);
  const [isAssigneeOpen, setAssigneeOpen] = useState(false);
  const [isLabelsExpanded, setIsLabelsExpanded] = useState(false);
  const [subtaskAssigneeMenuOpenFor, setSubtaskAssigneeMenuOpenFor] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [descColumns, setDescColumns] = useState(1);
  const [deadlineRequestDraft, setDeadlineRequestDraft] = useState<{ date: string | undefined; reason: string } | null>(null);
  // Hierarquia de datas: prazo da tarefa ≤ entrega do projeto (ou do portfólio).
  const { limiteDaTarefa } = useMarketingProjetos();
  const limitePrazo = task?.id ? limiteDaTarefa(task.id) : null;
  const [erroPrazo, setErroPrazo] = useState<string | null>(null);
  useEffect(() => { setErroPrazo(null); }, [task?.id]);
  const prazoForaDoLimite = (d?: string | null) => {
    if (!d || !limitePrazo || d.slice(0, 10) <= limitePrazo.data) return false;
    setErroPrazo(`O prazo não pode passar da entrega do projeto "${limitePrazo.projeto}" (${formatarData(limitePrazo.data)}).`);
    return true;
  };

  const plainDesc = (descriptionRef.current || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
  const missingTitle = !(titleRef.current && titleRef.current.trim());
  const missingDesc = !plainDesc;
  const missingLabel = !(taskLabels && taskLabels.length > 0);
  const missingProject = !projectId;
  const missingAssignee = !assigneeId;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isFullscreenDesc, setIsFullscreenDesc] = useState(false);
  const [descEditorKey, setDescEditorKey] = useState(0);
  // Autoriza o editor a substituir seu conteúdo pelo do servidor (ver camada A
  // em RichTextEditor). Só é incrementado quando não há edição local pendente.
  const [descSyncToken, setDescSyncToken] = useState(0);
  
  const [prevTaskId, setPrevTaskId] = useState(task?.id);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    properties: true,
    description: true,
    hierarchy: true,
    checklist: true,
    designProps: true,
    copyProps: true,
    planningProps: true,
    budgetProps: true,
    socialMediaProps: true,
    attachments: true
  });

  useEffect(() => {
    const handleOpenSection = (e: any) => {
      const payload = e.detail;
      if (!payload) return;
      
      const section = typeof payload === 'string' ? payload : payload.section;
      const targetId = typeof payload === 'string' ? undefined : payload.targetId;

      if (section && isOpen) {
        setOpenSections(prev => {
          const newSections = { ...prev };
          // Expand the targeted section
          newSections[section] = true;
          return newSections;
        });
        // Chat-mention notifications land on the description section, but the
        // chat side panel has its own isChatOpen toggle that persists across
        // task switches — force it open so the mentioned comment is visible.
        if (targetId && (targetId.startsWith('task-chat-') || targetId.startsWith('sienge-chat-'))) {
          setIsChatOpen(true);
        }
        let attempts = 0;
        let scrolledToFallback = false;
        // Deliveries/creatives live in the on-demand briefing columns, which can take
        // several seconds to arrive. 15 tries (1.5s) gave up long before the target
        // element existed, so the user landed on an empty section. Keep polling for
        // the real target for ~8s, while scrolling to the section right away so the
        // wait happens with the loading skeleton in view.
        const MAX_ATTEMPTS = 80;
        const tryScroll = () => {
          let el = null;
          let fallbackEl = document.getElementById(`section-${section}`);

          if (targetId && targetId !== section && targetId !== task?.id) {
            el = document.getElementById(`target-${targetId}`);

            // Try to find by title if targetId is missing but we know it's a subtask (old notifications)
            if (!el && (!targetId || targetId === 'checklist')) {
              // This is handled below or we can't reliably do it here without the notification payload
            }
          }

          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('animate-highlight-glow', 'rounded-md');
            setTimeout(() => {
              el.classList.remove('animate-highlight-glow', 'rounded-md');
            }, 2200);
            return;
          }

          // Target not in the DOM yet: park the viewport on the section so the
          // loading state is visible, then keep waiting for the target itself.
          if (fallbackEl && !scrolledToFallback) {
            scrolledToFallback = true;
            fallbackEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (!targetId) {
              fallbackEl.classList.add('animate-highlight-glow', 'rounded-md');
              setTimeout(() => {
                fallbackEl.classList.remove('animate-highlight-glow', 'rounded-md');
              }, 2200);
            }
          }

          if (attempts < MAX_ATTEMPTS) {
            attempts++;
            setTimeout(tryScroll, 100);
          }
        };
        setTimeout(tryScroll, 100);
      }
    };
    window.addEventListener('openTaskSection', handleOpenSection);
    return () => window.removeEventListener('openTaskSection', handleOpenSection);
  }, [isOpen]);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Hierarquia tem três estados, percorridos ao clicar no título:
  // recolhida (ícone) → normal → maximizada (toma o espaço de Documentos) → recolhida.
  const [isHierarchyMaximized, setIsHierarchyMaximized] = useState(false);
  const attachmentsBeforeMaximizeRef = useRef(true);

  const cycleHierarchy = () => {
    if (!openSections.hierarchy) {
      setOpenSections(prev => ({ ...prev, hierarchy: true }));
      return;
    }
    if (!isHierarchyMaximized) {
      // Guarda o estado de Documentos para devolvê-lo ao sair do modo maximizado.
      attachmentsBeforeMaximizeRef.current = openSections.attachments;
      setOpenSections(prev => ({ ...prev, attachments: false }));
      setIsHierarchyMaximized(true);
      return;
    }
    setIsHierarchyMaximized(false);
    setOpenSections(prev => ({
      ...prev,
      hierarchy: false,
      attachments: attachmentsBeforeMaximizeRef.current,
    }));
  };

  const [animatingToIndex, setAnimatingToIndex] = useState<number | null>(null);
  const [currentVisibleIndex, setCurrentVisibleIndex] = useState<number>(-1);
  const [isLinkDropdownOpen, setIsLinkDropdownOpen] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [draggedChildId, setDraggedChildId] = useState<string | null>(null);
  const [dragOverChildId, setDragOverChildId] = useState<string | null>(null);
  
  const [compareTaskId, setCompareTaskId] = useState<string | null>(null);
  const [isCompareSearchOpen, setIsCompareSearchOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [compareSearchQuery, setCompareSearchQuery] = useState('');

  const [effectiveLock, setEffectiveLock] = useState<EditorPresence | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (editingBy) {
      setEffectiveLock(editingBy);
      setIsSyncing(false);
    } else if (cooldown && cooldown.expiresAt > Date.now()) {
      setEffectiveLock({ name: cooldown.name, color: 'blue' });
      setIsSyncing(true);
      const timeLeft = cooldown.expiresAt - Date.now();
      const timer = setTimeout(() => {
        setEffectiveLock(null);
        setIsSyncing(false);
      }, timeLeft);
      return () => clearTimeout(timer);
    } else {
      setEffectiveLock(null);
      setIsSyncing(false);
    }
  }, [editingBy, cooldown]);

  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id);
    let newLock: EditorPresence | null = editingBy || null;
    let newSyncing = false;
    if (!editingBy && cooldown && cooldown.expiresAt > Date.now()) {
      newLock = { name: cooldown.name, color: 'blue' };
      newSyncing = true;
    }
    setEffectiveLock(newLock);
    setIsSyncing(newSyncing);
    titleRef.current = task?.title || '';
    descriptionRef.current = task?.description || '';
    descSessionBaselineRef.current = task?.description || '';
    copyBriefingSessionBaselineRef.current = JSON.stringify(task?.copyBriefing || {});
    // Outra tarefa: zera a referência para o efeito de sync tratar como carga
    // inicial e registrar a base nova (senão compararia com o texto da anterior).
    lastServerDescRef.current = null;
    setStatus(task?.status || 'todo');
    setPriority(task?.priority || 'no_priority');
    setProjectId(task?.projectId || '');
    setTaskLabels(task?.labels || []);
    setDueDate(task?.dueDate || '');
    setReminderDate(task?.reminderDate || '');
    setAssigneeId(task?.assigneeId);
    setSubtasks(task?.subtasks || []);
    setShowDeleteConfirm(false);
    setIsHierarchyMaximized(false);

    setAnimatingToIndex(null);
    setCurrentVisibleIndex(-1);
  }

  useEffect(() => {
    if (effectiveLock && task) {
      titleRef.current = task.title || '';
      descriptionRef.current = task.description || '';
      setSubtasks(task.subtasks || []);
    }
  }, [task, effectiveLock]);

  // Camada A — adota no editor a descrição que chegou do servidor (Realtime ou
  // refetch). Sem isto o editor congela no texto do momento em que abriu, e o
  // primeiro clique reenvia esse texto obsoleto por cima do de quem editou depois.
  useEffect(() => {
    if (!task) return;
    const server = task.description || '';
    const previousServer = lastServerDescRef.current;
    if (server === previousServer) return;

    // Se o texto no editor já divergia do último valor do servidor, o usuário tem
    // edições locais em aberto: não sobrescreve. O guard da camada C decide quem
    // fica quando esse texto for gravado.
    const hasLocalEdits = previousServer !== null && descriptionRef.current !== previousServer;
    if (hasLocalEdits) return;

    lastServerDescRef.current = server;
    setDescriptionBase(task.id, server);
    if (server === descriptionRef.current) return;
    descriptionRef.current = server;
    setDescSyncToken(t => t + 1);
  }, [task?.id, task?.description]);

  // O write local foi recusado pelo guard (camada C): o texto no editor está
  // baseado numa versão que já não existe. Zerar a referência faz o efeito acima
  // tratar o próximo valor do servidor como carga inicial e adotá-lo, em vez de
  // preservar edições locais que nunca serão aceitas.
  useEffect(() => {
    return onDescriptionConflict((taskId) => {
      if (taskId !== task?.id) return;
      lastServerDescRef.current = null;
    });
  }, [onDescriptionConflict, task?.id]);

  useEffect(() => {
    if (task && task.status && task.status !== status) {
      setStatus(task.status);
    }
  }, [task?.status]);

  useEffect(() => {
    if (task && task.labels) {
      setTaskLabels(task.labels);
    }
  }, [JSON.stringify(task?.labels)]);

  const primaryLabelId = taskLabels.length > 0 ? taskLabels[0]?.id : null;
  const primaryLabelData = primaryLabelId ? allLabels.find(l => l.id === primaryLabelId) : null;
  const primaryColorString = primaryLabelData ? primaryLabelData.color : 'text-blue-500';
  const baseColorMatch = primaryColorString.match(/text-([a-z]+)-\d+/);
  const baseColor = baseColorMatch ? baseColorMatch[1] : 'blue';

  const getTheme = (color: string) => {
    switch (color) {
      case 'yellow': return { line: 'bg-yellow-600/80', text: 'text-yellow-400', dotBg: 'bg-yellow-500/20', dotBorder: 'border-yellow-500/50', dotInner: 'bg-yellow-500', btnBg: 'bg-yellow-600', btnHover: 'hover:bg-yellow-500', focusRing: 'focus:ring-yellow-500/50', focusBorder: 'focus:border-yellow-500/50', badgeBg: 'bg-yellow-500/10', badgeBorder: 'border-yellow-500/20', badgeHover: 'hover:bg-yellow-500/20' };
      case 'pink': return { line: 'bg-pink-600/80', text: 'text-pink-400', dotBg: 'bg-pink-500/20', dotBorder: 'border-pink-500/50', dotInner: 'bg-pink-500', btnBg: 'bg-pink-600', btnHover: 'hover:bg-pink-500', focusRing: 'focus:ring-pink-500/50', focusBorder: 'focus:border-pink-500/50', badgeBg: 'bg-pink-500/10', badgeBorder: 'border-pink-500/20', badgeHover: 'hover:bg-pink-500/20' };
      case 'emerald': return { line: 'bg-emerald-600/80', text: 'text-emerald-400', dotBg: 'bg-emerald-500/20', dotBorder: 'border-emerald-500/50', dotInner: 'bg-emerald-500', btnBg: 'bg-emerald-600', btnHover: 'hover:bg-emerald-500', focusRing: 'focus:ring-emerald-500/50', focusBorder: 'focus:border-emerald-500/50', badgeBg: 'bg-emerald-500/10', badgeBorder: 'border-emerald-500/20', badgeHover: 'hover:bg-emerald-500/20' };
      case 'purple': return { line: 'bg-purple-600/80', text: 'text-purple-400', dotBg: 'bg-purple-500/20', dotBorder: 'border-purple-500/50', dotInner: 'bg-purple-500', btnBg: 'bg-purple-600', btnHover: 'hover:bg-purple-500', focusRing: 'focus:ring-purple-500/50', focusBorder: 'focus:border-purple-500/50', badgeBg: 'bg-purple-500/10', badgeBorder: 'border-purple-500/20', badgeHover: 'hover:bg-purple-500/20' };
      case 'orange': return { line: 'bg-orange-600/80', text: 'text-orange-400', dotBg: 'bg-orange-500/20', dotBorder: 'border-orange-500/50', dotInner: 'bg-orange-500', btnBg: 'bg-orange-600', btnHover: 'hover:bg-orange-500', focusRing: 'focus:ring-orange-500/50', focusBorder: 'focus:border-orange-500/50', badgeBg: 'bg-orange-500/10', badgeBorder: 'border-orange-500/20', badgeHover: 'hover:bg-orange-500/20' };
      default: return { line: 'bg-blue-600/80', text: 'text-blue-400', dotBg: 'bg-blue-500/20', dotBorder: 'border-blue-500/50', dotInner: 'bg-blue-500', btnBg: 'bg-blue-600', btnHover: 'hover:bg-blue-500', focusRing: 'focus:ring-blue-500/50', focusBorder: 'focus:border-blue-500/50', badgeBg: 'bg-blue-500/10', badgeBorder: 'border-blue-500/20', badgeHover: 'hover:bg-blue-500/20' };
    }
  };
  
  const theme = getTheme(baseColor);
  const themeTextColor = theme.text;

  const childTasksRaw = allTasks ? allTasks.filter(t => t.parentTaskId === task?.id) : [];
  const hasManualHierarchyOrder = childTasksRaw.some(t => t.hierarchyOrder != null);
  const childTasks = childTasksRaw.slice().sort((a, b) => {
    if (hasManualHierarchyOrder) {
      const orderA = a.hierarchyOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.hierarchyOrder ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    }
    // Default: earliest deadline first; tasks without a due date sort last.
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const handleReorderChildTask = (draggedId: string, targetId: string) => {
    if (draggedId === targetId || !onUpdateTask) return;
    const ids = childTasks.map(t => t.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = childTasks.slice();
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    reordered.forEach((t, idx) => {
      if (t.hierarchyOrder !== idx) {
        onUpdateTask({ ...t, hierarchyOrder: idx } as Task);
      }
    });
  };

  let ThemeIcon = TagIcon;
  if (primaryLabelData?.name === 'Design') ThemeIcon = PenTool;
  else if (primaryLabelData?.name === 'Copy') ThemeIcon = Type;
  else if (primaryLabelData?.name === 'Tarefa') ThemeIcon = CheckSquare;
  else if (primaryLabelData?.name === 'Orçamento') ThemeIcon = DollarSign;
  else if (primaryLabelData?.name === 'Social Media') ThemeIcon = Share2;

  useEffect(() => {
    if (!task) return;
    if (JSON.stringify(subtasks) === JSON.stringify(task.subtasks)) return;
    const timer = setTimeout(() => {
      saveChange({ subtasks });
    }, 500);
    return () => clearTimeout(timer);
  }, [subtasks]);

  useEffect(() => {
    if (animatingToIndex !== null && currentVisibleIndex !== animatingToIndex) {
      const step = currentVisibleIndex < animatingToIndex ? 1 : -1;
      const timer = setTimeout(() => {
        setCurrentVisibleIndex(prev => prev + step);
      }, 100);
      return () => clearTimeout(timer);
    } else if (animatingToIndex !== null && currentVisibleIndex === animatingToIndex) {
      const finishTimer = setTimeout(() => {
        setAnimatingToIndex(null);
      }, 100);
      return () => clearTimeout(finishTimer);
    }
  }, [animatingToIndex, currentVisibleIndex]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, projectId, assigneeId, taskLabels]);

  if (!isOpen || !task) return null;

  const saveChange = (updates: Partial<Task>) => {
    if (!task || effectiveLock) return;
    onUpdateTask({ ...updates, id: task.id } as Task);
  };

  const isDeadlineAdmin = Number(currentUser?.permissionLevel) === 1;
  const pendingDeadlineChange = task?.pendingDeadlineChange || null;

  const formatDeadlineForNotif = (d: string | null | undefined) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem prazo';

  const handleDeadlinePicked = (newDate: string | undefined) => {
    if (!task || effectiveLock) return;
    setErroPrazo(null);
    if (prazoForaDoLimite(newDate)) return;
    // Aprovação só faz sentido quando existe um prazo para ser alterado. Na primeira
    // definição (tarefa ainda sem prazo) qualquer um grava direto.
    const isFirstDeadline = !task.dueDate;
    if (isDeadlineAdmin || isFirstDeadline) {
      let newStatus = status;
      if (status === 'no_forecast' && newDate) newStatus = 'todo';
      else if (status === 'todo' && !newDate) newStatus = 'no_forecast';
      setDueDate(newDate);
      setStatus(newStatus);
      saveChange({ dueDate: newDate, status: newStatus });
      return;
    }
    // Não-admins não alteram o prazo direto: precisam justificar e enviar para aprovação do Cidnei.
    setDeadlineRequestDraft({ date: newDate, reason: '' });
  };

  const submitDeadlineChangeRequest = () => {
    if (!task || !currentUser || !deadlineRequestDraft) return;
    const reason = deadlineRequestDraft.reason.trim();
    if (!reason) return;

    const pending: PendingDeadlineChange = {
      requestedDueDate: deadlineRequestDraft.date || null,
      previousDueDate: task.dueDate || null,
      reason,
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      requestedAt: new Date().toISOString()
    };
    onUpdateTask({ id: task.id, pendingDeadlineChange: pending } as Task);

    const admin = USERS.find(u => Number(u.permissionLevel) === 1);
    if (admin) {
      addNotification({
        userId: admin.id,
        actorId: currentUser.id,
        taskId: task.id,
        type: 'deadline_change_requested',
        message: `${currentUser.name} solicitou alteração de prazo em "${task.title || 'Tarefa'}"`,
        details: `De ${formatDeadlineForNotif(pending.previousDueDate)} para ${formatDeadlineForNotif(pending.requestedDueDate)}. Motivo: ${reason}`,
        targetId: 'deadline'
      });
    }
    setDeadlineRequestDraft(null);
  };

  const approveDeadlineChange = () => {
    if (!task || !currentUser || !pendingDeadlineChange) return;
    const p = pendingDeadlineChange;
    if (prazoForaDoLimite(p.requestedDueDate)) return;
    let newStatus = status;
    if (status === 'no_forecast' && p.requestedDueDate) newStatus = 'todo';
    else if (status === 'todo' && !p.requestedDueDate) newStatus = 'no_forecast';
    setDueDate(p.requestedDueDate || undefined);
    setStatus(newStatus);
    onUpdateTask({ id: task.id, dueDate: p.requestedDueDate || undefined, status: newStatus, pendingDeadlineChange: null } as Task);
    addNotification({
      userId: p.requestedBy,
      actorId: currentUser.id,
      taskId: task.id,
      type: 'deadline_changed',
      message: `Sua solicitação de alteração de prazo em "${task.title || 'Tarefa'}" foi aprovada`,
      details: `Novo prazo: ${formatDeadlineForNotif(p.requestedDueDate)}`,
      targetId: 'deadline'
    });
  };

  const rejectDeadlineChange = () => {
    if (!task || !currentUser || !pendingDeadlineChange) return;
    const p = pendingDeadlineChange;
    onUpdateTask({ id: task.id, pendingDeadlineChange: null } as Task);
    addNotification({
      userId: p.requestedBy,
      actorId: currentUser.id,
      taskId: task.id,
      type: 'deadline_change_rejected',
      message: `O prazo de "${task.title || 'Tarefa'}" não pode ser alterado`,
      details: `Sua solicitação (motivo: "${p.reason}") foi recusada pelo Cidnei. O prazo permanece ${formatDeadlineForNotif(p.previousDueDate)}.`,
      targetId: 'deadline'
    });
  };

  const stripHtml = (html: string) =>
    (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // Logs one history entry per editing session (called when the task is
  // closed) instead of one per autosave, comparing the value from when the
  // session started against the value when it ended.
  const flushSessionHistory = () => {
    if (!task || !currentUser) return;

    const descBase = stripHtml(descSessionBaselineRef.current);
    const descNow = stripHtml(descriptionRef.current || '');
    if (descNow !== descBase) {
      logTaskFieldHistory(task.id, 'description', descBase, descNow, currentUser.id).catch(console.error);
    }

    const copyBase = copyBriefingSessionBaselineRef.current;
    const copyNow = JSON.stringify(task.copyBriefing || {});
    if (copyNow !== copyBase) {
      logTaskFieldHistory(task.id, 'copy_briefing', null, null, currentUser.id).catch(console.error);
    }
  };

  const toggleSubtask = (subId: string) => {
    setSubtasks(prev => prev.map(s => {
      if (s.id !== subId) return s;
      if (!s.completed && !s.canceled) {
        // Mark as completed and set timestamp
        return { ...s, completed: true, canceled: false, completedAt: new Date().toISOString() };
      } else if (s.completed && !s.canceled) {
        // Move to canceled and re-stamp the moment do cancelamento
        return { ...s, completed: false, canceled: true, completedAt: new Date().toISOString() };
      } else {
        // Reset to neutral
        return { ...s, completed: false, canceled: false, completedAt: undefined };
      }
    }));
  };

  const handleSetSubtaskReminder = (subId: string, update: { reminderDate?: string; reminderType?: '3h' | '1d' | 'custom' | 'seen' }) => {
    setSubtasks(prev => prev.map(s => s.id === subId
      ? { ...s, reminderDate: update.reminderDate, reminderType: update.reminderType }
      : s
    ));
  };

  const handleSetSubtaskAssignee = (subId: string, userId: string) => {
    setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, assigneeId: userId || undefined } : s));
    setSubtaskAssigneeMenuOpenFor(null);
    
    if (userId && task) {
      const sub = subtasks.find(s => s.id === subId);
      addNotification({
        userId: userId,
        actorId: currentUser?.id || 'system',
        taskId: task.id,
        targetId: subId,
        type: 'task_assigned',
        message: 'Responsável por Item',
        details: `Você foi marcado como responsável pelo item "${sub?.title}" na tarefa "${task.title}".`
      });
    }
  };

  const handleEditSubtaskTitle = (subId: string, newTitle: string) => {
    setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, title: newTitle } : s));
  };

  const handleDeleteSubtask = (subId: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== subId));
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, index: number, subId: string) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const currentLevel = subtasks[index].level || 0;
      
      if (e.shiftKey) {
        if (currentLevel > 0) {
          setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, level: currentLevel - 1 } : s));
        }
      } else {
        const prevLevel = index > 0 ? (subtasks[index - 1].level || 0) : 0;
        if (currentLevel <= prevLevel) {
          setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, level: currentLevel + 1 } : s));
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const newId = `sub-${Date.now()}`;
      const newSubtask: Subtask = { 
        id: newId, 
        title: '', 
        completed: false,
        level: subtasks[index].level || 0
      };
      
      setSubtasks(prev => {
        const copy = [...prev];
        copy.splice(index + 1, 0, newSubtask);
        return copy;
      });

      setTimeout(() => {
        document.getElementById(`subtask-input-${newId}`)?.focus();
      }, 50);
    } else if (e.key === 'Backspace') {
      const target = e.currentTarget;
      const currentLevel = subtasks[index].level || 0;
      
      if (target.selectionStart === 0 && target.selectionEnd === 0) {
        if (currentLevel > 0) {
          e.preventDefault();
          setSubtasks(prev => prev.map(s => s.id === subId ? { ...s, level: currentLevel - 1 } : s));
        } else if (subtasks[index].title === '') {
          e.preventDefault();
          handleDeleteSubtask(subId);
          if (index > 0) {
            setTimeout(() => {
              const prevInput = document.getElementById(`subtask-input-${subtasks[index - 1].id}`);
              if (prevInput) {
                prevInput.focus();
                (prevInput as HTMLInputElement).setSelectionRange(9999, 9999);
              }
            }, 50);
          }
        }
      }
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newId = `sub-${Date.now()}`;
    const newSub: Subtask = {
      id: newId,
      title: newSubtaskTitle.trim(),
      completed: false
    };
    setSubtasks(prev => [...prev, newSub]);
    setNewSubtaskTitle('');
  };

  const toggleLabel = (label: Label) => {
    const isCurrentlySelected = taskLabels.some(l => l?.id === label.id);
    if (isCurrentlySelected) return;
    
    if (taskLabels.length >= 1) {
      saveChange({ 
        labels: [label],
        designBriefing: undefined
      });
      setTaskLabels([label]);
      setIsLabelsExpanded(false);
      setToastMessage('A classe da tarefa foi substituída. Cada tarefa permite apenas 1 classe simultaneamente.');
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      setTaskLabels([label]);
      saveChange({ labels: [label] });
      setIsLabelsExpanded(false);
    }
  };

  const handleAddChildTask = () => {
    if (!onAddTask) return;
    const newId = crypto.randomUUID();
    const newTask: any = {
      id: newId,
      title: '',
      description: '',
      status: 'no_forecast',
      priority: 'medium',
      projectId: '',
      labels: [],
      subtasks: [],
      createdAt: new Date().toISOString().split('T')[0],
      parentTaskId: task.id,
      _isLocal: true,
    };
    onAddTask(newTask as Task);
    if (onSelectTask) {
      onSelectTask(newTask);
    }
  };



  const handleCreateTaskClass = () => {
    if (!task) return;
    
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    flushSessionHistory();
    saveChange({ title: titleRef.current, description: descriptionRef.current });

    onClose({
      ...task,
      title: titleRef.current,
      description: descriptionRef.current,
      projectId,
      assigneeId,
      labels: taskLabels
    });
  };

  const handleClose = (e?: any) => {
    if (!task) {
      onClose();
      return;
    }

    // Flush debounced local state immediately
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);

    flushSessionHistory();
    saveChange({
      title: titleRef.current,
      description: descriptionRef.current
    });

    // Pass the full task object to avoid triggering false positive validation errors
    // Since App.tsx's handleCloseTaskSheet uses this strictly for validation (and doesn't save it),
    // it is perfectly safe to pass ...task.
    onClose({
      ...task,
      title: titleRef.current,
      description: descriptionRef.current,
      projectId,
      assigneeId,
      labels: taskLabels
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-xs flex justify-end animate-fade-in pointer-events-none">
        <div className="flex-1 pointer-events-auto" onMouseDown={handleClose} />
      </div>

      <div className={isCompareChild 
        ? "h-full bg-[#0c0c0e] flex flex-col text-zinc-200 w-full relative z-0 overflow-hidden" 
        : `fixed top-0 right-0 bottom-0 z-50 bg-[#0c0c0e] border-l border-zinc-900 shadow-2xl flex flex-col animate-slide-in text-zinc-200 transition-all duration-300 ${compareTaskId ? 'w-full' : 'w-full md:w-[75vw] nb:w-[85vw] nbs:w-[92vw]'}`
      }>
        
        <div className="h-14 short:h-11 px-4 border-b border-zinc-900 flex items-center justify-between shrink-0 bg-[#08080a] relative">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-zinc-900 px-2.5 py-1 rounded font-mono text-zinc-400 font-semibold border border-zinc-900">
              {task.taskCode || 'NOVO'}
            </span>
            <span className="text-[10px] text-zinc-650 font-mono">
              Criado em {task.createdAt}
            </span>
          </div>

          <div className="flex items-center gap-1 relative">
            {compareTaskId && (
              <button
                onClick={() => {
                  setCompareTaskId(null);
                  setCompareSearchQuery('');
                }}
                className="mr-2 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded text-xs font-semibold uppercase tracking-wider transition-all"
              >
                Encerrar Comparação
              </button>
            )}

            <button
              onClick={() => setIsCompareSearchOpen(!isCompareSearchOpen)}
              className={`p-1.5 rounded transition-all flex items-center gap-1 text-[11px] font-medium ${compareTaskId ? 'bg-blue-500 text-white' : 'text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10'}`}
              title="Comparar com outra tarefa"
            >
              <Columns size={15} />
            </button>

            {isCompareSearchOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#121214] border border-zinc-800 rounded-md shadow-xl p-2 z-50">
                <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-[#08080a] border border-zinc-800 rounded">
                  <Search size={12} className="text-zinc-500" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Buscar tarefa..."
                    value={compareSearchQuery}
                    onChange={e => setCompareSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-zinc-200 outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1 pr-1 scrollbar-thin">
                  {allTasks
                    .filter(t => t.id !== task.id && (t.title.toLowerCase().includes(compareSearchQuery.toLowerCase()) || t.id.toLowerCase().includes(compareSearchQuery.toLowerCase())))
                    .slice(0, 10)
                    .map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setCompareTaskId(t.id);
                          setIsCompareSearchOpen(false);
                          setCompareSearchQuery('');
                        }}
                        className="text-left px-2 py-1.5 hover:bg-zinc-800 rounded flex flex-col gap-0.5"
                      >
                        <span className="text-[10px] font-mono text-zinc-500">{t.taskCode || t.id}</span>
                        <span className="text-xs font-medium text-zinc-300 truncate w-full">{t.title}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setIsHistoryOpen(true)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 rounded transition-all"
              title="Ver histórico de alterações"
            >
              <HistoryIcon size={15} />
            </button>

            {/* Tarefa privada — só nível 1 alterna. Quem não é nível 1 nem chega
                a ver uma tarefa privada (a RLS filtra), então o botão só aparece
                para quem pode usá-lo. */}
            {Number(currentUser?.permissionLevel) === 1 && (
              <button
                onClick={() => saveChange({ isPrivate: !task.isPrivate })}
                disabled={!!effectiveLock}
                className={`p-1.5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  task.isPrivate
                    ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
                }`}
                title={task.isPrivate
                  ? 'Tarefa privada — visível somente para você. Clique para torná-la visível ao time.'
                  : 'Tornar tarefa privada (oculta para todo o time)'}
              >
                {task.isPrivate ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
            )}

            <div className="w-[1px] h-4 bg-zinc-800 mx-1"></div>

            {Number(currentUser?.permissionLevel) === 1 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                title="Excluir Tarefa"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 rounded transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {task.isPrivate && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-400">
            <Lock size={11} />
            <span>Tarefa privada — visível somente para administradores.</span>
          </div>
        )}

        {effectiveLock && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b text-xs font-medium"
            style={{ background: `${effectiveLock.color}18`, borderColor: `${effectiveLock.color}30`, color: effectiveLock.color }}
          >
            {isSyncing ? <Clock size={11} className="animate-pulse" /> : <Lock size={11} />}
            <span>
              {isSyncing 
                ? `${effectiveLock.name} finalizou a edição. Sincronizando os últimos dados...` 
                : `${effectiveLock.name} está editando esta tarefa agora — visualização somente leitura`}
            </span>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Main Task Panel */}
          <div className="flex-1 overflow-y-auto view-pad space-y-6 short:space-y-4 scrollbar-thin border-r border-zinc-900">
          
          {task.routine?.active && (
            <div className="mb-4 bg-purple-500/10 border border-purple-500/30 text-purple-400 p-3 rounded-md flex items-center justify-between text-xs animate-pulse">
              <div className="flex items-center gap-2 font-medium">
                <Repeat size={14} />
                <span>Esta tarefa está criando cópias em modo rotina.</span>
              </div>
              <button
                onClick={() => saveChange({ routine: { ...task.routine, active: false } as any })}
                className="p-1 hover:bg-purple-500/20 rounded transition-colors text-purple-300"
                title="Desativar Rotina"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {task.routineOriginId && (
            <div className="mb-4 bg-zinc-800/50 border border-zinc-700 text-zinc-400 p-3 rounded-md flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Repeat size={14} />
                <span>Esta tarefa foi gerada automaticamente por uma rotina.</span>
              </div>
            </div>
          )}

          <div className="mb-2 flex items-start gap-3 relative">
            <div className={`mt-[2px] shrink-0 ${themeTextColor}`}>
              <ThemeIcon size={28} />
            </div>
            <TitleInput
              taskId={task.id}
              initialValue={effectiveLock ? (task.title || '') : titleRef.current}
              missingTitle={missingTitle}
              disabled={!!effectiveLock}
              onChange={(val) => {
                titleRef.current = val;
                if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
                titleTimerRef.current = setTimeout(() => saveChange({ title: val }), 500);
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => toggleSection('properties')}
              className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-opacity w-full text-left`}
            >
              {openSections.properties ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Propriedades
            </button>
            {openSections.properties && (
              <div className="bg-[#08080a]/40 p-5 rounded-md border border-zinc-900 flex flex-col gap-5 text-xs animate-fade-in z-50 relative">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {statuses.map((s, idx) => {
                  const isNormallyActive = status === s.value && animatingToIndex === null;
                  const isAnimActive = animatingToIndex !== null && currentVisibleIndex === idx;
                  const isLit = isNormallyActive || isAnimActive;

                  const activeColorStyle = primaryLabelData?.color || 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
                  const activeDotStyle = themeTextColor.replace('text-', 'bg-');

                  return (
                    <button
                      key={s.value}
                      disabled={!!effectiveLock}
                      onClick={() => {
                        if (status === s.value || effectiveLock) return;
                        const startIdx = statuses.findIndex(x => x.value === status);
                        const targetIdx = idx;
                        
                        setCurrentVisibleIndex(startIdx);
                        setAnimatingToIndex(targetIdx);

                        setStatus(s.value);
                        saveChange({ status: s.value });
                      }}
                      className={`px-2.5 py-1 rounded-md transition-all duration-150 font-medium text-xs flex items-center gap-1.5 ${
                        isLit 
                          ? activeColorStyle 
                          : 'bg-zinc-950 text-zinc-600 border border-transparent hover:bg-zinc-900 hover:text-zinc-400 shadow-none'
                      } ${isAnimActive ? 'scale-105 shadow-lg brightness-125 z-10' : 'scale-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {!isLit && <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      <span className={`${!isLit ? 'opacity-60 grayscale' : ''}`}>{s.icon}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-6 border-t border-zinc-900/50 pt-3 relative z-30">
              <div className="flex flex-col gap-1.5 relative min-w-[120px]">
                <span className="text-zinc-500 font-medium font-sans flex items-center gap-1.5"><Flag size={13} className="opacity-60" /> Prioridade</span>
                <button
                  type="button"
                  disabled={!!effectiveLock}
                  onClick={() => !effectiveLock && setPriorityOpen(!isPriorityOpen)}
                  onBlur={() => setTimeout(() => setPriorityOpen(false), 200)}
                  className={`inline-flex items-center justify-between gap-1.5 text-[10px] font-sans font-medium px-2 py-1 rounded border min-h-[26px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${priorities.find(p => p.value === priority)?.badgeStyle}`}
                >
                  <div className="flex items-center gap-1.5">
                    {priorities.find(p => p.value === priority)?.icon}
                    <span>{priorities.find(p => p.value === priority)?.label}</span>
                  </div>
                  <span className="text-[10px] opacity-60 ml-1">▼</span>
                </button>

                {isPriorityOpen && (
                  <div className="absolute top-full left-0 w-full mt-1.5 bg-[#121214] border border-zinc-800 rounded-[8px] shadow-2xl p-1.5 z-50 flex flex-col gap-1">
                    {priorities.map(p => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setPriority(p.value);
                          saveChange({ priority: p.value });
                          setPriorityOpen(false);
                        }}
                        className="w-full flex"
                      >
                        <div className={`w-full flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded border ${p.badgeStyle}`}>
                          {p.icon}
                          <span>{p.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 relative min-w-[140px]">
                <span className={`${missingProject ? 'text-red-400' : 'text-zinc-500'} font-medium font-sans flex items-center gap-1.5`}><FolderIcon size={13} className="opacity-60" /> Empreendimento</span>
                <button
                  type="button"
                  disabled={!!effectiveLock}
                  onClick={() => !effectiveLock && setProjectOpen(!isProjectOpen)}
                  onBlur={() => setTimeout(() => setProjectOpen(false), 200)}
                  className="inline-flex items-center justify-between gap-1.5 text-[10px] font-sans font-medium px-2 py-1 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 min-h-[26px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="truncate max-w-[150px]">{projects.find(p => p.id === projectId)?.name || 'Selecionar...'}</span>
                  <span className="text-[10px] opacity-60 ml-1">▼</span>
                </button>

                {isProjectOpen && (
                  <div className="absolute top-full left-0 w-full mt-1.5 bg-[#121214] border border-zinc-800 rounded-[8px] shadow-2xl p-1.5 z-50 flex flex-col gap-1 max-h-[200px] overflow-y-auto scrollbar-thin">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setProjectId(p.id);
                          saveChange({ projectId: p.id });
                          setProjectOpen(false);
                        }}
                        className="w-full flex"
                      >
                        <div className="w-full flex items-center justify-start text-[10px] px-2 py-1.5 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 transition-colors">
                          {p.name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {task?.id && <ProjetoPicker taskId={task.id} dueDate={dueDate} disabled={!!effectiveLock} />}

              <div id="section-deadline"className="flex flex-col gap-1.5 min-w-[120px]">
                <span className="text-zinc-500 font-medium font-sans flex items-center gap-1.5"><CalendarIcon size={13} className="opacity-60" /> Prazo</span>
                <DatePicker
                  value={dueDate}
                  disabled={!!effectiveLock || !!pendingDeadlineChange}
                  onChange={handleDeadlinePicked}
                  maxDate={limitePrazo?.data}
                />
                {limitePrazo && !erroPrazo && (
                  <span className="text-[10px] text-zinc-500">Até {formatarData(limitePrazo.data)} (projeto)</span>
                )}
                {erroPrazo && <span className="text-[10px] text-red-400 max-w-[220px]">{erroPrazo}</span>}
                {pendingDeadlineChange && (
                  <div className="mt-1.5 flex flex-col gap-1.5 p-2 rounded-md border border-amber-500/30 bg-amber-500/5 max-w-[260px]">
                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                      {isDeadlineAdmin ? 'Solicitação de alteração de prazo' : 'Aguardando aprovação do Cidnei'}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {pendingDeadlineChange.requestedByName || 'Alguém'} pediu para mudar de{' '}
                      <b className="text-zinc-300">{formatDeadlineForNotif(pendingDeadlineChange.previousDueDate)}</b> para{' '}
                      <b className="text-zinc-300">{formatDeadlineForNotif(pendingDeadlineChange.requestedDueDate)}</b>.
                    </span>
                    <span className="text-[10px] text-zinc-500 italic">"{pendingDeadlineChange.reason}"</span>
                    {isDeadlineAdmin && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          onClick={approveDeadlineChange}
                          className="flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={rejectDeadlineChange}
                          className="flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                        >
                          Recusar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 relative min-w-[140px]">
                <span className={`${missingAssignee ? 'text-red-400' : 'text-zinc-500'} font-medium font-sans flex items-center gap-1.5`}><UserIcon size={13} className="opacity-60" /> Responsável</span>
                <button
                  type="button"
                  disabled={!!effectiveLock}
                  onClick={() => !effectiveLock && setAssigneeOpen(!isAssigneeOpen)}
                  onBlur={() => setTimeout(() => setAssigneeOpen(false), 200)}
                  className="inline-flex items-center justify-between gap-1.5 text-[10px] font-sans font-medium px-2 py-1 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 min-h-[26px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                    {assigneeId && USERS.find(u => u.id === assigneeId) ? (
                      <>
                        <img src={USERS.find(u => u.id === assigneeId)?.avatarUrl} alt="Avatar" className="w-4 h-4 rounded-full object-cover" />
                        <span>{USERS.find(u => u.id === assigneeId)?.name}</span>
                      </>
                    ) : (
                      <span>Sem responsável</span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-60 ml-1">▼</span>
                </button>

                {isAssigneeOpen && (
                  <div className="absolute top-full left-0 w-full mt-1.5 bg-[#121214] border border-zinc-800 rounded-[8px] shadow-2xl p-1.5 z-50 flex flex-col gap-1 max-h-[200px] overflow-y-auto scrollbar-thin">
                    <button
                      onClick={() => {
                        setAssigneeId(undefined);
                        saveChange({ assigneeId: undefined });
                        setAssigneeOpen(false);
                      }}
                      className="w-full flex items-center justify-start text-[10px] px-2 py-1.5 rounded border text-zinc-400 bg-transparent border-transparent hover:bg-zinc-800 transition-colors"
                    >
                      Sem responsável
                    </button>
                    {sortedUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setAssigneeId(u.id);
                          saveChange({ assigneeId: u.id });
                          setAssigneeOpen(false);
                        }}
                        className="w-full flex"
                      >
                        <div className="w-full flex items-center gap-1.5 justify-start text-[10px] px-2 py-1.5 rounded border text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 transition-colors">
                          <img src={u.avatarUrl} alt={u.name} className="w-4 h-4 rounded-full object-cover" />
                          <span>{u.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div id="section-reminder" className="flex flex-col gap-1.5 relative min-w-[140px]">
                <span className="text-zinc-500 font-medium font-sans flex items-center gap-1.5"><Bell size={13} className="opacity-60" /> Lembrete</span>
                <DatePicker
                  value={reminderDate || ''}
                  disabled={!!effectiveLock}
                  onChange={(date) => {
                    if (effectiveLock) return;
                    setReminderDate(date);
                    saveChange({ reminderDate: date });
                  }}
                  enableTime={true}
                  onQuickAdd={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const val = `${tomorrow.toISOString().split('T')[0]}T09:00`;
                    setReminderDate(val);
                    saveChange({ reminderDate: val });
                  }}
                  trigger={
                    (() => {
                      const relatedNotif = notifications.find(n => n.type === 'reminder' && n.taskId === task.id && (!n.targetId || n.targetId === task.id));
                      const isReminderSeen = task?.reminderType === 'seen' || (relatedNotif && relatedNotif.status !== 'unread');
                      const activeColorClass = isReminderSeen
                        ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20 hover:bg-emerald-400/20'
                        : 'text-amber-400 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20';

                      return (
                        <button
                          type="button"
                          className={`w-full inline-flex items-center justify-between gap-1.5 text-[10px] font-sans font-medium px-2 py-1 rounded border min-h-[26px] transition-colors ${reminderDate ? activeColorClass : 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20'}`}
                      onClick={(e) => {
                        if (isReminderSeen) {
                          e.stopPropagation();
                          setReminderDate(undefined);
                          saveChange({ reminderDate: undefined, reminderType: undefined });
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {reminderDate ? (
                          reminderDate.includes('T')
                            ? `${reminderDate.split('T')[0].split('-').reverse().join('/')} às ${reminderDate.split('T')[1]}`
                            : reminderDate.split('-').reverse().join('/')
                        ) : 'Adicionar lembrete'}
                      </div>
                      <span className="text-[10px] opacity-60 ml-1">▼</span>
                        </button>
                      );
                    })()
                  }
                />
              </div>

              <div id="section-routine" className="flex flex-col gap-1.5 relative min-w-[140px]">
                <span className="text-zinc-500 font-medium font-sans flex items-center gap-1.5"><Repeat size={13} className="opacity-60" /> Rotina</span>
                <RoutineProperties
                  routine={task?.routine}
                  onChange={(update) => {
                    if (update && update.active) {
                      update.originalSnapshot = {
                        title: titleRef.current,
                        description: descriptionRef.current,
                        labels: taskLabels,
                        projectId: projectId,
                        priority: priority
                      };
                    }
                    saveChange({ routine: update });
                  }}
                  align="left"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-zinc-900/50 pt-4 mt-1">
              <span className={`${missingLabel ? 'text-red-400' : 'text-zinc-500'} font-medium font-sans`}>Classificação</span>
              <div className="flex flex-wrap gap-1.5 items-center">
                
                {allLabels.filter(label => taskLabels.some(l => l?.id === label.id) || taskLabels.length === 0).map(label => {
                  const isSelected = taskLabels.some(l => l?.id === label.id);
                  let LabelIcon = TagIcon;
                  if (label.name === 'Design') LabelIcon = PenTool;
                  else if (label.name === 'Copy') LabelIcon = Type;
                  else if (label.name === 'Tarefa') LabelIcon = CheckSquare;
                  else if (label.name === 'Orçamento') LabelIcon = DollarSign;
                  else if (label.name === 'Social Media') LabelIcon = Share2;

                  return (
                    <button
                      key={label.id}
                      disabled={!!effectiveLock}
                      onClick={() => !effectiveLock && toggleLabel(label)}
                      className={`px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected 
                          ? label.color 
                          : 'bg-[#1f2937]/30 text-zinc-500 hover:text-zinc-300 hover:bg-[#1f2937]/60'
                      }`}
                    >
                      <LabelIcon size={12} className={isSelected ? 'opacity-100' : 'opacity-60'} />
                      <span>{label.name}</span>
                      {isSelected && <span className="text-[10px]">✓ </span>}
                    </button>
                  );
                })}

                {taskLabels.length > 0 && !isLabelsExpanded && (
                  <button
                    onClick={() => setIsLabelsExpanded(true)}
                    className="group flex items-center justify-center p-1.5 ml-0.5 text-zinc-500 hover:text-zinc-200 bg-zinc-900/40 hover:bg-[#1f2937]/60 rounded-full transition-all"
                    title="Exibir outras classificações"
                  >
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 group-hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-all" />
                  </button>
                )}
                {taskLabels.length > 0 && isLabelsExpanded && (
                  <button
                    onClick={() => setIsLabelsExpanded(false)}
                    className="group flex items-center justify-center p-1.5 ml-0.5 text-zinc-500 hover:text-zinc-200 bg-zinc-900/40 hover:bg-[#1f2937]/60 rounded-full transition-all animate-slide-in"
                    title="Ocultar classificações"
                  >
                    <ChevronLeft size={14} className="group-hover:-translate-x-0.5 group-hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-all" />
                  </button>
                )}

                {isLabelsExpanded && allLabels.filter(label => !taskLabels.some(l => l?.id === label.id)).map(label => {
                  let LabelIcon = TagIcon;
                  if (label.name === 'Design') LabelIcon = PenTool;
                  else if (label.name === 'Copy') LabelIcon = Type;
                  else if (label.name === 'Tarefa') LabelIcon = CheckSquare;
                  else if (label.name === 'Orçamento') LabelIcon = DollarSign;
                  else if (label.name === 'Social Media') LabelIcon = Share2;

                  return (
                    <button
                      key={label.id}
                      disabled={!!effectiveLock}
                      onClick={() => !effectiveLock && toggleLabel(label)}
                      className={`animate-slide-in px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1.5 font-medium bg-[#1f2937]/30 text-zinc-500 hover:text-zinc-300 hover:bg-[#1f2937]/60 border border-transparent disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <LabelIcon size={12} className="opacity-60" />
                      <span>{label.name}</span>
                    </button>
                  );
                })}
              </div>
              </div>
            </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleSection('description')}
                  className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${missingDesc ? 'text-red-400' : themeTextColor} hover:opacity-80 transition-opacity text-left`}
                >
                  {openSections.description ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Descrição
                </button>
                {openSections.description && (
                  <button 
                    onClick={() => setIsFullscreenDesc(true)} 
                    className="text-[10px] bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
                    title="Abrir descrição em tela cheia"
                  >
                    <Maximize2 size={12} /> Tela Cheia
                  </button>
                )}
              </div>
              {openSections.description && (
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className={`relative p-1.5 rounded transition-all duration-300 ${themeTextColor} hover:bg-zinc-800/50 hover:scale-110 hover:animate-pulse`}
                  title={isChatOpen ? "Ocultar Chat" : "Exibir Chat"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {!isChatOpen && task.chatMessages && task.chatMessages.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-[#0d1117] shadow-sm leading-none flex items-center justify-center min-w-[16px] h-[16px]">
                      {task.chatMessages.length}
                    </span>
                  )}
                </button>
              )}
            </div>
            {openSections.description && (
              <div className="flex animate-fade-in items-stretch h-[380px] gap-6 overflow-hidden relative w-full">
                <div className={`flex flex-col h-full transition-all duration-300 ease-in-out shrink-0 min-w-0 ${isChatOpen ? 'w-full md:w-[calc(66.666%-12px)]' : 'w-full'}`}>
                  <RichTextEditor
                    key={`desc-${descEditorKey}`}
                    taskId={task.id}
                    content={effectiveLock ? (task.description || '') : descriptionRef.current}
                    wrapperClassName="h-full"
                    columns={descColumns as 1|2|3}
                    readOnly={!!effectiveLock}
                    syncToken={descSyncToken}
                    onColumnsChange={(c) => setDescColumns(c)}
                    onChange={(newContent) => {
                      descriptionRef.current = newContent;
                      saveChange({ description: newContent });
                    }}
                  />
                </div>
                <div 
                  className={`flex flex-col h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
                    isChatOpen ? 'w-full md:w-[calc(33.333%-12px)] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10'
                  }`}
                >
                  <TaskChat 
                    task={task} 
                    onUpdate={(chatMessages) => !effectiveLock && saveChange({ chatMessages })}
                    baseColor={baseColor}
                    theme={theme}
                    readOnly={!!effectiveLock}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-row gap-4 items-start">
            {/* ═══ CHECKLIST — always visible, grows to fill ═══ */}
            <div id="section-checklist" className={`flex flex-col gap-3 transition-all duration-300 order-1 ${
              // Com a Hierarquia maximizada, é ela que absorve o espaço de Documentos —
              // o checklist mantém a largura que já tinha.
              isHierarchyMaximized ? 'flex-1' :
              !openSections.hierarchy && !openSections.attachments ? 'flex-[3]' :
              !openSections.hierarchy || !openSections.attachments ? 'flex-[2]' :
              'flex-1'
            } min-w-0`}>
              {/* Checklist — always open, cannot collapse */}
              <div className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${themeTextColor}`}>
                <CheckSquare size={14} />
                Checklist
                {subtasks.length > 0 && (
                  <span className="text-[10px] font-mono text-gray-500 bg-[#0d1117] px-1.5 rounded-full ml-auto">
                    {subtasks.filter(s => s.completed).length}/{subtasks.length}
                  </span>
                )}
              </div>

              <div className="space-y-0 mt-1">
                  {subtasks.length === 0 && newSubtaskTitle === '' && (
                    <p className="text-xs text-gray-500 italic py-1 pl-1 bg-[#1f2937]/20 rounded p-1 hidden">Nenhuma subtarefa adicionada.</p>
                  )}

                  <Reorder.Group
                    as="div"
                    axis="y"
                    values={subtasks.map(s => s.id)}
                    onReorder={(newIds: string[]) => {
                      const newSubtasks = newIds.map(id => subtasks.find(s => s.id === id)!).filter(Boolean);
                      setSubtasks(newSubtasks);
                    }}
                  >
                  <AnimatePresence initial={false}>
                  {subtasks.map((subtask, index) => (
                    <SubtaskRow
                      key={subtask.id}
                      subtask={subtask}
                      index={index}
                      effectiveLock={!!effectiveLock}
                      sortedUsers={sortedUsers}
                      subtaskAssigneeMenuOpenFor={subtaskAssigneeMenuOpenFor}
                      setSubtaskAssigneeMenuOpenFor={setSubtaskAssigneeMenuOpenFor}
                      onToggle={toggleSubtask}
                      onEditTitle={handleEditSubtaskTitle}
                      onKeyDown={handleSubtaskKeyDown}
                      onSetAssignee={handleSetSubtaskAssignee}
                      onSetReminder={handleSetSubtaskReminder}
                      onDelete={handleDeleteSubtask}
                    />
                  ))}
                  </AnimatePresence>
                  </Reorder.Group>

                  {/* Ghost inline input for adding subtasks */}
                  {!effectiveLock && (
                  <div className="flex items-center gap-2 py-1 px-1 -mx-1 opacity-50 hover:opacity-100 transition-opacity mt-1">
                    <Plus size={13} className="text-gray-500 shrink-0" />
                    <textarea
                      rows={1}
                      value={newSubtaskTitle}
                      onChange={(e) => {
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                        setNewSubtaskTitle(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newSubtaskTitle.trim()) {
                            const newId = `sub-${Date.now()}`;
                            setSubtasks(prev => [...prev, { id: newId, title: newSubtaskTitle.trim(), completed: false, level: 0 }]);
                            setNewSubtaskTitle('');
                          }
                        }
                      }}
                      placeholder="Escreva aqui..."
                      className="flex-1 bg-transparent border-0 ring-0 outline-none text-xs font-normal text-gray-400 focus:text-gray-200 resize-none overflow-hidden py-0"
                    />
                  </div>
                  )}
                </div>
            </div>

            {/* ═══ HIERARCHY — collapses to icon / maximizes over Documentos ═══ */}
            <div className={`flex flex-col gap-3 transition-all duration-300 order-3 ${
              isHierarchyMaximized ? 'flex-[2] min-w-0' :
              openSections.hierarchy ? 'flex-1 min-w-0' : 'w-auto shrink-0'
            }`}>
               <button
                  onClick={cycleHierarchy}
                  className={`text-xs font-semibold font-sans flex items-center uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-all ${openSections.hierarchy ? 'gap-1.5 w-full text-left' : 'flex-col gap-2 justify-center py-4 bg-[#08080a]/40 border border-zinc-900 rounded-md h-full min-h-[200px]'}`}
                  title={
                    !openSections.hierarchy ? 'Expandir Hierarquia'
                    : !isHierarchyMaximized ? 'Ampliar sobre o espaço de Documentos'
                    : 'Recolher Hierarquia'
                  }
                >
                  {openSections.hierarchy ? (
                    <>
                      <ChevronDown size={14} />
                      Hierarquia
                      <span className="ml-auto text-zinc-500 shrink-0">
                        {isHierarchyMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                      </span>
                    </>
                  ) : (
                    <>
                      <GitFork size={18} className="text-zinc-500" />
                      <span className="[writing-mode:vertical-lr] rotate-180 tracking-widest mt-2 text-zinc-500 font-medium whitespace-nowrap">HIERARQUIA</span>
                    </>
                  )}
                </button>
                {openSections.hierarchy && (
                  <div className="flex flex-col gap-4 animate-fade-in bg-[#08080a]/40 p-4 rounded-md border border-zinc-900">
                    
                    {(() => {
                      const parentTask = allTasks?.find(t => t.id === task.parentTaskId);
                      const eligibleTasksToLink = allTasks?.filter(t => 
                        t.id !== task.id &&
                        t.parentTaskId !== task.id &&
                        !allTasks.some(child => child.parentTaskId === t.id)
                      ) || [];

                      const renderTaskCard = (t: Task, isParent: boolean) => {
                         const assignee = USERS.find(u => u.id === t.assigneeId);
                         const assigneeInitials = assignee?.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'UN';
                         const assigneeName = assignee?.name || 'Não atribuído';
                         
                         const statusObj = statuses.find(s => s.value === t.status) || statuses[0];
                         
                         const primaryLabel = t.labels?.[0];
                         let SubIcon = TagIcon;
                         if (primaryLabel?.name === 'Design') SubIcon = PenTool;
                         else if (primaryLabel?.name === 'Copy') SubIcon = Type;
                         else if (primaryLabel?.name === 'Tarefa') SubIcon = CheckSquare;
                         else if (primaryLabel?.name === 'Orçamento') SubIcon = DollarSign;
                         else if (primaryLabel?.name === 'Social Media') SubIcon = Share2;

                         const iconColor = primaryLabel?.color?.match(/text-[a-z]+-\d+/)?.[0] || 'text-blue-500';

                         return (
                           <div 
                             onClick={() => onSelectTask && onSelectTask(t)}
                             className={`group flex items-center justify-between text-xs text-zinc-200 bg-zinc-800/40 p-1.5 rounded-lg border border-zinc-700/50 hover:border-zinc-500 hover:bg-zinc-800/80 cursor-pointer transition-all ${isParent ? 'shadow-md' : ''}`}
                           >
                             <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                               <SubIcon size={12} className={`${iconColor} shrink-0 opacity-90 group-hover:opacity-100 transition-opacity`} />
                               <span className="font-medium text-[11px] truncate tracking-wide">{t.title}</span>
                             </div>
                             
                             <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium shrink-0">
                               <span className="flex items-center gap-1" title={assigneeName}>
                                 {assignee?.avatarUrl ? (
                                   <img src={assignee.avatarUrl} alt={assigneeName} className="w-4 h-4 rounded-full object-cover border border-zinc-700 shadow-inner" />
                                 ) : (
                                   <span className="w-4 h-4 rounded-full bg-zinc-900 flex items-center justify-center text-[9px] text-zinc-300 border border-zinc-700 shadow-inner">
                                     {assigneeInitials}
                                   </span>
                                 )}
                               </span>
                               
                               {editingMap && editingMap[t.id] && (
                                 <span 
                                   className="flex items-center gap-1 opacity-90 border rounded-full px-1.5 py-0.5 shadow-sm"
                                   style={{ 
                                     background: `${editingMap[t.id].color}20`, 
                                     borderColor: `${editingMap[t.id].color}40`,
                                     color: editingMap[t.id].color
                                   }}
                                   title={`${editingMap[t.id].name} está editando`}
                                 >
                                   <Lock size={9} />
                                   {editingMap[t.id].avatarUrl ? (
                                      <img src={editingMap[t.id].avatarUrl} className="w-3.5 h-3.5 rounded-full object-cover" />
                                   ) : (
                                      <span className="text-[8px] font-bold">
                                        {editingMap[t.id].name.substring(0, 1).toUpperCase()}
                                      </span>
                                   )}
                                 </span>
                               )}

                               <span className={`flex items-center gap-1 whitespace-nowrap font-mono tracking-tighter text-[9px] ${(() => {
                                 if (!t.dueDate || t.status === 'done') return 'opacity-80';
                                 const msPerDay = 24 * 60 * 60 * 1000;
                                 const today = new Date(); today.setHours(0, 0, 0, 0);
                                 const due = new Date(t.dueDate + 'T00:00:00'); due.setHours(0, 0, 0, 0);
                                 const daysLeft = Math.round((due.getTime() - today.getTime()) / msPerDay);
                                 if (daysLeft < 0) return 'text-red-400 font-bold opacity-100';
                                 if (daysLeft <= 5) return 'text-yellow-400 font-bold opacity-100';
                                 return 'opacity-80';
                               })()}`}>
                                 {t.dueDate ? t.dueDate.split('-').reverse().join('/').slice(0, 5) : 'S/P'}
                               </span>
                               <span
                                 className={`flex items-center gap-1.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap ${statusObj.color}`}
                                 title={statusObj.label}
                               >
                                 <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusObj.dotColor}`} />
                                 {statusObj.label}
                               </span>
                               {!isParent && onUpdateTask && (
                                 <button
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     onUpdateTask({ ...t, parentTaskId: undefined } as unknown as Task);
                                   }}
                                   className="w-5 h-5 ml-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 flex items-center justify-center transition-colors border border-transparent hover:border-red-500/30"
                                   title="Desvincular Sub-tarefa"
                                 >
                                   <X size={12} />
                                 </button>
                               )}
                             </div>
                           </div>
                         );
                      };

                      return (
                        <div className="flex flex-col w-full">
                          {parentTask ? (
                            <div className="flex flex-col">
                              
                              
                              {/* Level 0: Parent */}
                              <div className="relative z-10">
                                {renderTaskCard(parentTask, true)}
                              </div>

                              <div className="flex flex-col pl-8 mt-2">
                                {/* Level 1: Current Task — as linhas ficam num wrapper que
                                    envolve só este card, senão top-1/2/bottom-1/2 tomam como
                                    referência a altura do bloco inteiro (com os filhos) e a
                                    conexão com "Esta Tarefa" some. */}
                                <div className="relative">
                                  <div className={`absolute top-[-8px] bottom-1/2 w-[2px] ${theme.line}`} style={{ left: '12px' }} />
                                  <div className={`absolute top-1/2 h-[2px] ${theme.line}`} style={{ left: '12px', width: '20px', transform: 'translateY(-50%)' }} />

                                  <div className="group flex items-center justify-between text-xs text-zinc-200 bg-zinc-800/40 p-1.5 rounded-lg border border-zinc-700/50 shadow-md relative z-10">
                                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                      <div className={`w-[12px] h-[12px] rounded-full ${theme.dotBg} border ${theme.dotBorder} flex items-center justify-center shrink-0`}>
                                        <div className={`w-1 h-1 rounded-full ${theme.dotInner}`} />
                                      </div>
                                      <span className={`font-medium tracking-widest text-[11px] uppercase ${theme.text} truncate`}>Esta Tarefa</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Level 2: Children */}
                                {childTasks.length > 0 && (
                                  <div className="relative mt-2 flex flex-col gap-2">
                                    {childTasks.map((ct, idx) => {
                                      const isLast = idx === childTasks.length - 1;
                                      const canDragChild = !effectiveLock && !!onUpdateTask;
                                      return (
                                        <div
                                          key={ct.id}
                                          className={`relative pl-8 transition-opacity ${draggedChildId === ct.id ? 'opacity-40' : ''} ${dragOverChildId === ct.id && draggedChildId && draggedChildId !== ct.id ? 'ring-1 ring-zinc-500/60 rounded-lg' : ''}`}
                                          draggable={canDragChild}
                                          onDragStart={() => canDragChild && setDraggedChildId(ct.id)}
                                          onDragOver={(e) => { if (canDragChild && draggedChildId) { e.preventDefault(); setDragOverChildId(ct.id); } }}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            if (canDragChild && draggedChildId) handleReorderChildTask(draggedChildId, ct.id);
                                            setDraggedChildId(null);
                                            setDragOverChildId(null);
                                          }}
                                          onDragEnd={() => { setDraggedChildId(null); setDragOverChildId(null); }}
                                        >
                                          <div className={`absolute w-[2px] ${theme.line}`} style={{ left: '12px', top: idx === 0 ? '-8px' : '0px', bottom: isLast ? '50%' : '-8px' }} />
                                          <div className={`absolute top-1/2 h-[2px] ${theme.line}`} style={{ left: '12px', width: '20px', transform: 'translateY(-50%)' }} />
                                          <div className={`relative z-10 ${canDragChild ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                                            {renderTaskCard(ct, false)}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              
                              
                              {/* Level 0: Current Task */}
                              <div className="relative z-10">
                                <div className="group flex items-center justify-between text-xs text-zinc-200 bg-zinc-800/40 p-1.5 rounded-lg border border-zinc-700/50 shadow-md">
                                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                    <div className={`w-[12px] h-[12px] rounded-full ${theme.dotBg} border ${theme.dotBorder} flex items-center justify-center shrink-0`}>
                                      <div className={`w-1 h-1 rounded-full ${theme.dotInner}`} />
                                    </div>
                                    <span className={`font-medium tracking-widest text-[11px] uppercase ${theme.text} truncate`}>Esta Tarefa</span>
                                  </div>
                                </div>
                              </div>

                              {/* Level 1: Children */}
                              {childTasks.length > 0 && (
                                <div className="relative mt-2 flex flex-col gap-2">
                                  {childTasks.map((ct, idx) => {
                                    const isLast = idx === childTasks.length - 1;
                                    const canDragChild = !effectiveLock && !!onUpdateTask;
                                    return (
                                      <div
                                        key={ct.id}
                                        className={`relative pl-8 transition-opacity ${draggedChildId === ct.id ? 'opacity-40' : ''} ${dragOverChildId === ct.id && draggedChildId && draggedChildId !== ct.id ? 'ring-1 ring-zinc-500/60 rounded-lg' : ''}`}
                                        draggable={canDragChild}
                                        onDragStart={() => canDragChild && setDraggedChildId(ct.id)}
                                        onDragOver={(e) => { if (canDragChild && draggedChildId) { e.preventDefault(); setDragOverChildId(ct.id); } }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          if (canDragChild && draggedChildId) handleReorderChildTask(draggedChildId, ct.id);
                                          setDraggedChildId(null);
                                          setDragOverChildId(null);
                                        }}
                                        onDragEnd={() => { setDraggedChildId(null); setDragOverChildId(null); }}
                                      >
                                        <div className={`absolute w-[2px] ${theme.line}`} style={{ left: '12px', top: idx === 0 ? '-8px' : '0px', bottom: isLast ? '50%' : '-8px' }} />
                                        <div className={`absolute top-1/2 h-[2px] ${theme.line}`} style={{ left: '12px', width: '20px', transform: 'translateY(-50%)' }} />
                                        <div className={`relative z-10 ${canDragChild ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                                          {renderTaskCard(ct, false)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              
                              {childTasks.length === 0 && (
                                <div className="pl-2 pt-3">
                                  <span className="text-xs text-zinc-600 italic">Esta tarefa não possui hierarquia.</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Add/Link Subtask Area */}
                          {!effectiveLock && (onAddTask || onUpdateTask) && (
                            <div className="mt-4 flex gap-2">
                              {onAddTask && (
                                <button 
                                  onClick={handleAddChildTask}
                                  className={`flex-1 text-[10px] text-zinc-400 hover:text-zinc-100 bg-zinc-900/50 ${theme.badgeHover} border border-transparent hover:${theme.badgeBorder} p-2 rounded-md transition-all flex items-center justify-center gap-1.5 font-medium`}
                                >
                                  <Plus size={13} /> Criar Nova
                                </button>
                              )}
                              {onUpdateTask && eligibleTasksToLink.length > 0 && (
                                <div className="flex-1 relative">
                                  <button 
                                    onClick={() => setIsLinkDropdownOpen(!isLinkDropdownOpen)}
                                    className={`w-full text-[10px] text-zinc-400 hover:text-zinc-100 bg-zinc-900/50 ${theme.badgeHover} border border-transparent hover:${theme.badgeBorder} p-2 rounded-md transition-all flex items-center justify-center gap-1.5 font-medium`}
                                  >
                                    <Link2 size={13} /> Vincular Existente
                                  </button>
                                  
                                  {isLinkDropdownOpen && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setIsLinkDropdownOpen(false)}></div>
                                      <div className="absolute bottom-full mb-1 left-0 w-[240px] bg-[#121214] border border-zinc-800 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in">
                                        <div className="p-2 border-b border-zinc-800/50">
                                          <input 
                                            autoFocus
                                            type="text"
                                            placeholder="Pesquisar tarefa..."
                                            value={linkSearchQuery}
                                            onChange={(e) => setLinkSearchQuery(e.target.value)}
                                            className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded p-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-600"
                                          />
                                        </div>
                                        <div className="max-h-[160px] overflow-y-auto no-scrollbar p-1 flex flex-col gap-0.5">
                                          {eligibleTasksToLink.filter(t => t.title.toLowerCase().includes(linkSearchQuery.toLowerCase())).length === 0 ? (
                                            <div className="p-2 text-[10px] text-zinc-500 text-center italic">Nenhuma tarefa encontrada</div>
                                          ) : (
                                            eligibleTasksToLink.filter(t => t.title.toLowerCase().includes(linkSearchQuery.toLowerCase())).map(t => (
                                              <button
                                                key={t.id}
                                                onClick={() => {
                                                  onUpdateTask({ ...t, parentTaskId: task.id });
                                                  setIsLinkDropdownOpen(false);
                                                  setLinkSearchQuery('');
                                                }}
                                                className="w-full shrink-0 text-left p-2 rounded hover:bg-zinc-800/80 text-[11px] text-zinc-300 hover:text-zinc-100 transition-colors truncate font-medium"
                                              >
                                                {t.title}
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

            {/* ═══ ATTACHMENTS — collapses to icon ═══ */}
            <div className={`flex flex-col gap-3 transition-all duration-300 order-2 ${
              openSections.attachments ? 'flex-1 min-w-0' : 'w-auto shrink-0'
            }`}>
              <button
                onClick={() => { setIsHierarchyMaximized(false); toggleSection('attachments'); }}
                className={`text-xs font-semibold font-sans flex items-center uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-all ${openSections.attachments ? 'gap-1.5 w-full text-left' : 'flex-col gap-2 justify-center py-4 bg-[#08080a]/40 border border-zinc-900 rounded-md h-full min-h-[200px]'}`}
                title={!openSections.attachments ? "Expandir Documentos" : undefined}
              >
                {openSections.attachments ? (
                  <>
                    <ChevronDown size={14} />
                    Documentos
                  </>
                ) : (
                  <>
                    <Paperclip size={18} className="text-zinc-500" />
                    <span className="[writing-mode:vertical-lr] rotate-180 tracking-widest mt-2 text-zinc-500 font-medium whitespace-nowrap">DOCUMENTOS</span>
                  </>
                )}
              </button>
              {openSections.attachments && (
                <div className="animate-fade-in">
                  <AttachmentsSection 
                    attachments={task.attachments} 
                    onUpdate={(atts) => saveChange({ attachments: atts })} 
                    taskId={task.id}
                    taskTitle={task.title}
                    taskAssigneeId={task.assigneeId}
                    disabled={!!effectiveLock}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Design Properties */}
          {taskLabels.some(l => l.name === 'Design') && (
            <div id="section-designProps" className="flex flex-col gap-3 scroll-mt-20">
              <button
                onClick={() => toggleSection('designProps')}
                className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-opacity w-full text-left`}
              >
                {openSections.designProps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Painel de Design & Aprovação
              </button>
              <div className={`animate-fade-in ${openSections.designProps ? 'block' : 'hidden'}`}>
                <DesignProperties task={task} allTasks={allTasks} saveChange={saveChange} themeColor={themeTextColor} disabled={!!effectiveLock} briefingsLoading={briefingsLoading} />
              </div>
            </div>
          )}

          {/* Dynamic Copy Properties */}
          {taskLabels.some(l => l.name === 'Copy') && (
            <div id="section-copyProps" className="flex flex-col gap-3 scroll-mt-20">
              <button
                onClick={() => toggleSection('copyProps')}
                className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-all`}
              >
                {openSections.copyProps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Painel de Copy & Aprovação
              </button>
              <div className={`animate-fade-in ${openSections.copyProps ? 'block' : 'hidden'}`}>
                <CopyProperties task={task} saveChange={saveChange} themeColor={themeTextColor} disabled={!!effectiveLock} />
              </div>
            </div>
          )}

          {/* Dynamic Budget Properties (Orçamento) */}
          {taskLabels.some(l => l.name === 'Orçamento') && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => toggleSection('budgetProps')}
                className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-opacity w-full text-left`}
              >
                {openSections.budgetProps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Painel de Orçamento
              </button>
              <div id="section-budgetProps" className={`animate-fade-in scroll-mt-20 ${openSections.budgetProps ? 'block' : 'hidden'}`}>
                <BudgetProperties task={task} saveChange={saveChange} themeColor={themeTextColor} />
              </div>
            </div>
          )}

          {/* Dynamic Social Media Approval */}
          {taskLabels.some(l => l.name === 'Social Media') && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => toggleSection('socialMediaProps')}
                className={`text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider ${themeTextColor} hover:opacity-80 transition-opacity w-full text-left`}
              >
                {openSections.socialMediaProps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Painel de Social Media
              </button>
              <div className={`animate-fade-in min-h-[600px] ${openSections.socialMediaProps ? 'block' : 'hidden'}`}>
                <SocialMediaApproval 
                  task={task} 
                  allTasks={allTasks || []} 
                  saveChange={saveChange}
                  currentUser={currentUser}
                />
              </div>
            </div>
          )}

        </div>

        {/* Compare Task Panel (Read Only) */}
        {compareTaskId && (() => {
          const cTask = allTasks.find(t => t.id === compareTaskId);
          if (!cTask) return null;
          
          return (
            <div className="flex-1 overflow-y-auto view-pad space-y-6 short:space-y-4 scrollbar-thin bg-[#0c0c0e] animate-slide-in relative">
              <div className="mb-2 flex items-start gap-3">
                <div className="mt-[2px] shrink-0 text-zinc-500">
                  <TagIcon size={28} />
                </div>
                <h2 className="text-2xl font-bold text-zinc-400 font-sans tracking-tight">
                  {cTask.title}
                </h2>
              </div>
              
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider text-zinc-500">
                  <ChevronDown size={14} />
                  Propriedades
                </div>
                <div className="bg-[#08080a]/40 p-5 rounded-md border border-zinc-900 flex flex-col gap-5 text-xs">
                  <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-medium">Status</span>
                    <span className="text-zinc-300 font-medium px-2 py-0.5 rounded bg-zinc-800">{statuses.find(s => s.value === cTask.status)?.label || cTask.status}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-medium">Prioridade</span>
                    <span className="text-zinc-300 font-medium px-2 py-0.5 rounded bg-zinc-800">{priorities.find(p => p.value === cTask.priority)?.label || cTask.priority}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-medium">Responsável</span>
                    <span className="text-zinc-300 font-medium px-2 py-0.5 rounded bg-zinc-800">{USERS.find(u => u.id === cTask.assigneeId)?.name || 'Não atribuído'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-medium">Vencimento</span>
                    <span className="text-zinc-300 font-medium px-2 py-0.5 rounded bg-zinc-800">{cTask.dueDate ? cTask.dueDate.split('-').reverse().join('/') : 'Sem prazo'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                    <span className="text-zinc-500 font-medium">Projeto</span>
                    <span className="text-zinc-300 font-medium px-2 py-0.5 rounded bg-zinc-800">{projects.find(p => p.id === cTask.projectId)?.name || 'Nenhum'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold font-sans flex items-center gap-1.5 uppercase tracking-wider text-zinc-500">
                  <ChevronDown size={14} />
                  Descrição
                </div>
                <div className="bg-[#08080a]/40 p-5 rounded-md border border-zinc-900 relative">
                  <div 
                    className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 text-zinc-400"
                    dangerouslySetInnerHTML={{ __html: cTask.description || '<p class="text-zinc-600 italic">Sem descrição fornecida.</p>' }}
                  />
                </div>
              </div>

            </div>
          );
        })()}
        </div> {/* <-- Closes the flex-1 flex overflow-hidden wrapper */}
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(false);
          }}
        >
          <div 
            className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 flex flex-col gap-3 w-full max-w-[360px] shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-100">
              Excluir Tarefa?
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Deseja realmente excluir esta tarefa? Esta ação não pode ser desfeita e todo o conteúdo (inclusive briefings e aprovações) será perdido.
            </p>
            <div className="flex justify-end gap-2 pt-3 mt-2">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                className="px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTask(task.id);
                }}
                className="px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-lg transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Justificativa para Solicitação de Alteração de Prazo */}
      {deadlineRequestDraft && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setDeadlineRequestDraft(null);
          }}
        >
          <div
            className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 flex flex-col gap-3 w-full max-w-[380px] shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-100">
              Solicitar alteração de prazo
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Novo prazo: <b className="text-zinc-200">{formatDeadlineForNotif(deadlineRequestDraft.date)}</b>.
              Essa mudança precisa da aprovação do Cidnei — explique o motivo antes de enviar.
            </p>
            <textarea
              value={deadlineRequestDraft.reason}
              onChange={(e) => setDeadlineRequestDraft(prev => prev ? { ...prev, reason: e.target.value } : prev)}
              placeholder="Motivo da alteração de prazo..."
              autoFocus
              className="w-full bg-[#121214] border border-zinc-700 rounded-md p-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none min-h-[80px]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeadlineRequestDraft(null);
                }}
                className="px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={!deadlineRequestDraft.reason.trim()}
                onClick={(e) => {
                  e.stopPropagation();
                  submitDeadlineChangeRequest();
                }}
                className="px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enviar para aprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de Histórico de Alterações */}
      {isHistoryOpen && (
        <TaskHistoryPanel
          taskId={task.id}
          taskCode={task.taskCode}
          projects={projects}
          users={USERS}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {/* Modal de Tela Cheia para a Descrição */}
      {isFullscreenDesc && (
        <div className="fixed inset-0 z-[150] bg-[#08080a] flex flex-col animate-fade-in">
          <div className="h-14 border-b border-zinc-900 flex items-center justify-between px-6 bg-[#0c0c0e]">
            <div className="flex items-center gap-3">
              <div className={`mt-[2px] shrink-0 ${themeTextColor}`}>
                <ThemeIcon size={20} />
              </div>
              <span className="text-zinc-200 font-bold truncate max-w-2xl">{titleRef.current || 'Sem título'}</span>
              <span className="text-[10px] bg-zinc-900 px-2 py-0.5 rounded font-mono text-zinc-400 font-semibold border border-zinc-800">
                DESCRIÇÃO EM TELA CHEIA
              </span>
            </div>
            <button
              onClick={() => { setIsFullscreenDesc(false); setDescEditorKey(k => k + 1); }}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 bg-zinc-900/50 hover:bg-zinc-800 px-3 py-1.5 rounded-md transition-colors text-xs font-semibold"
            >
              <Minimize2 size={14} /> Fechar Tela Cheia
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-8 max-w-5xl mx-auto w-full">
            <RichTextEditor
              taskId={task.id}
              content={effectiveLock ? (task.description || '') : descriptionRef.current}
              readOnly={!!effectiveLock}
              syncToken={descSyncToken}
              onChange={(newContent) => {
                descriptionRef.current = newContent;
                if (descTimerRef.current) clearTimeout(descTimerRef.current);
                descTimerRef.current = setTimeout(() => {
                  descTimerRef.current = null;
                  saveChange({ description: newContent });
                }, 800);
              }}
              variant="borderless"
            />
          </div>
        </div>
      )}
      {/* Elegent Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[200] animate-fade-in flex items-center gap-3 bg-[#0d1117]/95 backdrop-blur-md border border-blue-500/30 text-blue-200 px-4 py-3 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
             <AlertTriangle size={14} className="text-blue-400" />
          </div>
          <div className="text-xs font-medium tracking-wide">
             {toastMessage}
          </div>
        </div>
      )}
    </>
  );
}
