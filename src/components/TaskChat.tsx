import React, { useState, useRef, useEffect } from 'react';
import { Send, User as UserIcon, Check } from 'lucide-react';
import { Task, ChatMessage, SiengeTitle } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

interface TaskChatProps {
  task?: Task;
  siengeTitle?: SiengeTitle;
  onUpdate: (chatMessages: ChatMessage[]) => void;
  baseColor?: string;
  theme?: any;
  readOnly?: boolean;
  hideHeader?: boolean;
  customTitle?: string;
}

export default function TaskChat({ task, siengeTitle, onUpdate, baseColor = 'blue', theme, readOnly = false, hideHeader = false, customTitle }: TaskChatProps) {
  const [text, setText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const { currentUser, allUsers } = useAuth();
  const { addNotification } = useNotifications();

  const chatMessages = task?.chatMessages || siengeTitle?.chatMessages || [];

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '32px';
      if (text) {
        const scrollHeight = inputRef.current.scrollHeight;
        inputRef.current.style.height = `${Math.min(scrollHeight, 100)}px`;
      }
    }
  }, [text]);

  const filteredUsers = allUsers.filter(u => 
    u.name.toLowerCase().includes(mentionQuery.toLowerCase()) && u.id !== currentUser?.id
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect mention trigger
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPosition);
    
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_ ]*)$/);
    if (match) {
      setShowMentions(true);
      setMentionQuery(match[1]);
    } else {
      setShowMentions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredUsers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedIndex = Math.max(0, mentionIndex);
        handleMentionSelect(filteredUsers[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMentionSelect = (user: any) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = text.substring(0, cursorPosition);
    const textAfterCursor = text.substring(cursorPosition);
    
    // Replace the @query part with the user's name
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    const newTextBefore = textBeforeCursor.substring(0, lastAtPos);
    
    const newText = `${newTextBefore}@${user.name} ${textAfterCursor}`;
    setText(newText);
    setShowMentions(false);
    setMentionQuery('');
    setMentionIndex(-1);
    
    // Focus back and adjust cursor
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        const newCursorPos = lastAtPos + user.name.length + 2;
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  const handleSend = () => {
    if (!text.trim() || !currentUser) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      senderId: currentUser.id,
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    const newMessages = [...chatMessages, newMessage];
    onUpdate(newMessages);

    // Parse text to find mentions and send notifications
    allUsers.forEach(user => {
      if (user.id !== currentUser.id && text.includes(`@${user.name}`)) {
        if (task) {
          addNotification({
            userId: user.id,
            actorId: currentUser.id,
            taskId: task.id,
            type: 'chat_mention',
            message: `${currentUser.name} marcou você no chat da tarefa: ${task.title}`,
            targetId: `task-chat-${task.id}`
          });
        } else if (siengeTitle) {
          addNotification({
            userId: user.id,
            actorId: currentUser.id,
            siengeTitleId: siengeTitle.id,
            type: 'chat_mention',
            message: `${currentUser.name} marcou você no chat do título: ${siengeTitle.titulo}`,
            targetId: `sienge-chat-${siengeTitle.id}`
          });
        }
      }
    });

    setText('');
    setShowMentions(false);
  };

  const handleResolveMessage = (msg: ChatMessage) => {
    if (!currentUser) return;
    
    const newMessages = chatMessages.map(m => 
      m.id === msg.id 
        ? { ...m, resolved: true, resolvedBy: currentUser.id }
        : m
    );
    
    onUpdate(newMessages);

    // Notify sender
    if (task) {
      addNotification({
        userId: msg.senderId,
        actorId: currentUser.id,
        taskId: task.id,
        type: 'status_changed',
        message: `${currentUser.name} marcou como resolvida a demanda no chat da tarefa: ${task.title}`,
        targetId: `task-chat-${task.id}`
      });
    } else if (siengeTitle) {
      addNotification({
        userId: msg.senderId,
        actorId: currentUser.id,
        siengeTitleId: siengeTitle.id,
        type: 'status_changed',
        message: `${currentUser.name} marcou como resolvida a demanda no chat do título: ${siengeTitle.titulo}`,
        targetId: `sienge-chat-${siengeTitle.id}`
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] border border-zinc-900 rounded-xl overflow-hidden font-sans">
      {!hideHeader && (
        <div className="flex items-center gap-1.5 px-4 h-10 shrink-0 border-b border-zinc-900">
          <h3 className="text-body font-medium text-zinc-300">{customTitle || 'Chat'}</h3>
        </div>
      )}

      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0"
      >
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-body font-medium text-zinc-200">Comece a conversa</p>
            <p className="mt-1 text-body text-zinc-400 max-w-[28ch]">Use @ para marcar alguém: a pessoa recebe um aviso.</p>
          </div>
        ) : (
          chatMessages.map((msg, index) => {
            const sender = allUsers.find(u => u.id === msg.senderId);
            const prevMsg = index > 0 ? chatMessages[index - 1] : null;
            const isSameSender = prevMsg && prevMsg.senderId === msg.senderId;
            // Check if messages are close in time (e.g., less than 5 minutes apart)
            const isCloseInTime = prevMsg && (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 5 * 60 * 1000;
            const groupMessages = isSameSender && isCloseInTime;
            
            const msgDate = new Date(msg.timestamp);
            const timeStr = msgDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + msgDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const isMentioned = currentUser && msg.text.includes(`@${currentUser.name}`);
            const canResolve = isMentioned && !msg.resolved && currentUser?.id !== msg.senderId;
            
            return (
              <div key={msg.id} className={`flex gap-3 w-full ${groupMessages ? 'mt-0' : 'mt-2'} group/msg`}>
                {/* Avatar area */}
                <div className="flex-shrink-0 w-6 flex flex-col items-center">
                  {!groupMessages ? (
                    sender?.avatarUrl ? (
                      <img src={sender.avatarUrl} alt={sender.name} className="w-6 h-6 rounded-full object-cover shadow-sm" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-semibold text-zinc-300 shadow-sm border border-zinc-700/50">
                        {sender?.initials || 'US'}
                      </div>
                    )
                  ) : (
                    <span className="text-caption text-zinc-600 opacity-0 group-hover/msg:opacity-100 transition-opacity whitespace-nowrap">
                      {timeStr}
                    </span>
                  )}
                </div>
                
                {/* Message Content */}
                <div className="flex flex-col min-w-0 flex-1">
                  {!groupMessages && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-body font-semibold text-zinc-200">
                        {sender?.name || 'Usuário Desconhecido'}
                      </span>
                      <span className="text-caption text-zinc-500 tabular-nums whitespace-nowrap">
                        {timeStr}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-body ${msg.resolved ? 'text-zinc-500' : 'text-zinc-300'} whitespace-pre-wrap break-words leading-relaxed flex-1`}>
                      {(() => {
                        if (!allUsers || allUsers.length === 0) return msg.text;
                        const names = allUsers.map(u => u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                        const regex = new RegExp(`(@(?:${names.join('|')}))`, 'g');
                        return msg.text.split(regex).map((part, i) => {
                          if (part.startsWith('@') && allUsers.some(u => `@${u.name}` === part)) {
                            return <span key={i} className={`font-semibold ${msg.resolved ? 'text-zinc-500' : (theme ? theme.text : 'text-blue-400')}`}>{part}</span>;
                          }
                          return <React.Fragment key={i}>{part}</React.Fragment>;
                        });
                      })()}
                    </p>
                    
                    {canResolve && !readOnly && (
                      <button
                        onClick={() => handleResolveMessage(msg)}
                        className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded text-caption font-medium shrink-0"
                        title="Marcar como resolvido"
                      >
                        <Check size={12} />
                        Resolvido
                      </button>
                    )}
                    {msg.resolved && (
                       <span className="flex items-center gap-1 text-caption text-emerald-500/50 shrink-0 select-none" title={`Resolvido por ${allUsers.find(u => u.id === msg.resolvedBy)?.name || 'alguém'}`}>
                         <Check size={12} /> Resolvido
                       </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!readOnly && (
        <div className="relative p-3 bg-zinc-900/10 border-t border-zinc-800/40">
          {showMentions && filteredUsers.length > 0 && (
            <div className="absolute bottom-full left-3 mb-2 w-64 max-h-48 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-10 flex flex-col p-1 animate-fade-in">
              {filteredUsers.map((u, i) => (
                <button
                  key={u.id}
                  onClick={() => handleMentionSelect(u)}
                  className={`flex items-center gap-2 px-3 py-2 text-caption rounded transition-colors text-left ${
                    i === mentionIndex || (mentionIndex === -1 && i === 0)
                      ? `bg-zinc-800 ${theme ? theme.text : 'text-blue-300'}` 
                      : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-semibold overflow-hidden shrink-0">
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : u.initials}
                  </div>
                  <span className="truncate">{u.name}</span>
                </button>
              ))}
            </div>
          )}
          
          <div className="flex items-end gap-2 relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={chatMessages.length ? 'Responder… (@ para marcar)' : 'Escreva uma mensagem… (@ para marcar)'}
              className="flex-1 bg-transparent border-0 px-1 py-1.5 text-body text-zinc-200 placeholder-zinc-500 focus:outline-none resize-none transition-colors"
              rows={1}
              style={{
                height: '32px',
                maxHeight: '100px',
                overflowY: text && inputRef.current && inputRef.current.scrollHeight > 100 ? 'auto' : 'hidden'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className={`flex-shrink-0 p-1.5 mb-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                text.trim() 
                  ? (theme ? `${theme.text} hover:bg-zinc-800` : 'text-blue-500 hover:bg-blue-500/10')
                  : 'text-zinc-600'
              }`}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


