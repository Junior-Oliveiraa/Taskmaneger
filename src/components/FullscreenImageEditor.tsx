import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Undo2, Eraser, Pen, Check, Save } from 'lucide-react';

interface FullscreenImageEditorProps {
  imageUrls: string[];
  initialIndex?: number;
  initialAnnotatedDataUrls?: string[];
  onSave: (annotatedDataUrls: string[]) => void;
  onClose: () => void;
}

const COLORS = [
  { id: 'red', value: '#ef4444' },
  { id: 'yellow', value: '#eab308' },
  { id: 'green', value: '#22c55e' },
  { id: 'blue', value: '#3b82f6' },
  { id: 'purple', value: '#a855f7' },
  { id: 'white', value: '#ffffff' },
  { id: 'black', value: '#000000' },
];

export default function FullscreenImageEditor({
  imageUrls,
  initialIndex = 0,
  initialAnnotatedDataUrls = [],
  onSave,
  onClose
}: FullscreenImageEditorProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [annotations, setAnnotations] = useState<string[]>([...initialAnnotatedDataUrls]);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444');
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  // As imagens vêm de outro domínio: sem CORS o navegador não deixa salvar o desenho.
  const [semCors, setSemCors] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  useEffect(() => {
    setImageLoaded(false);
    setHistory([]);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [currentIndex]);

  // Esc fecha só o editor: sem isto fecharia o painel da tarefa por baixo.
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [onClose]);

  // Initialize canvas when image loads
  useEffect(() => {
    if (imageLoaded && canvasRef.current && imageRef.current) {
      canvasRef.current.width = imageRef.current.clientWidth;
      canvasRef.current.height = imageRef.current.clientHeight;
      
      saveState();

      const existingAnnotation = annotations[currentIndex];
      if (existingAnnotation) {
        const img = new Image();
        img.onload = () => {
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
              saveState();
            }
          }
        };
        img.src = existingAnnotation;
      }
    }
  }, [imageLoaded]);

  const saveState = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHistory(prev => [...prev, imageData]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return; // Cannot undo past the initial blank state
    
    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const previousState = newHistory[newHistory.length - 1];
    
    setHistory(newHistory);
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.putImageData(previousState, 0, 0);
      }
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      saveState(); // Save state after a stroke completes
    }
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    
    // Calculate the scale between the canvas logical size and its display size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = isEraser ? 20 : 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const getCurrentDataUrl = () => {
    if (!canvasRef.current || !imageRef.current) return null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasRef.current.width;
    tempCanvas.height = canvasRef.current.height;
    const tCtx = tempCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(imageRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvasRef.current, 0, 0);
      try {
        return tempCanvas.toDataURL('image/jpeg', 0.8);
      } catch {
        return null;
      }
    }
    return null;
  };

  const handleSave = () => {
    // Sem desenho, a imagem não vira uma anotação.
    if (history.length <= 1) return onSave(annotations);
    const currentUrl = getCurrentDataUrl();
    if (currentUrl) {
      const newAnnotations = [...annotations];
      newAnnotations[currentIndex] = currentUrl;
      onSave(newAnnotations);
    } else {
      setErro('Não foi possível salvar o desenho: o site desta imagem não permite. Descreva o ajuste na justificativa.');
    }
  };

  const changeImage = (newIndex: number) => {
    const currentUrl = getCurrentDataUrl();
    if (currentUrl && history.length > 1) { // Only save if there's drawing
      const newAnnotations = [...annotations];
      newAnnotations[currentIndex] = currentUrl;
      setAnnotations(newAnnotations);
    }
    setCurrentIndex(newIndex);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col animate-fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {erro && <p role="alert" className="px-4 py-2 text-body text-red-300 bg-red-950">{erro}</p>}
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-4 bg-zinc-950/80 border-b border-zinc-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
            <button
              onClick={() => setIsEraser(false)}
              className={`p-2 rounded-md transition-all ${!isEraser ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              title="Caneta"
            >
              <Pen size={18} />
            </button>
            <button
              onClick={() => setIsEraser(true)}
              className={`p-2 rounded-md transition-all ${isEraser ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              title="Borracha"
            >
              <Eraser size={18} />
            </button>
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          {/* Color Picker */}
          <div className="flex items-center gap-1.5">
            {COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setColor(c.value);
                  setIsEraser(false);
                }}
                className={`w-6 h-6 rounded-full border-2 transition-all ${color === c.value && !isEraser ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c.value }}
                title={`Cor ${c.id}`}
              />
            ))}
          </div>

          <div className="h-6 w-px bg-zinc-800" />

          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs font-medium"
            title="Desfazer"
          >
            <Undo2 size={18} />
            <span className="hidden sm:inline">Desfazer</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-full transition-colors"
            title="Fechar"
          >
            <X size={20} />
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold uppercase tracking-wider rounded-md border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors">
            <Save size={16} /> Salvar Anotações
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4 relative select-none">
        
        {imageUrls.length > 1 && (
          <button
            onClick={() => changeImage(currentIndex === 0 ? imageUrls.length - 1 : currentIndex - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 rounded-full transition-colors z-50 backdrop-blur-sm border border-zinc-700/50"
          >
            <Undo2 size={24} className="rotate-[-45deg]" /> {/* just a placeholder icon or import ChevronLeft */}
          </button>
        )}

        <div className="relative max-w-full max-h-full inline-flex justify-center items-center">
          <img 
            ref={imageRef}
            key={`${imageUrls[currentIndex]}-${semCors.includes(imageUrls[currentIndex])}`}
            src={imageUrls[currentIndex]} 
            crossOrigin={semCors.includes(imageUrls[currentIndex]) ? undefined : 'anonymous'}
            onError={() => setSemCors(v => v.includes(imageUrls[currentIndex]) ? v : [...v, imageUrls[currentIndex]])}
            alt={`Tela cheia ${currentIndex + 1}`} 
            className="max-w-full max-h-[calc(100vh-100px)] object-contain pointer-events-none shadow-2xl"
            onLoad={() => setImageLoaded(true)}
          />
          {imageLoaded && (
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchMove={draw}
              className={`absolute inset-0 z-10 touch-none ${isEraser ? 'cursor-cell' : 'cursor-crosshair'}`}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
        
        {imageUrls.length > 1 && (
          <button
            onClick={() => changeImage(currentIndex === imageUrls.length - 1 ? 0 : currentIndex + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-100 rounded-full transition-colors z-50 backdrop-blur-sm border border-zinc-700/50"
          >
            <Undo2 size={24} className="rotate-[135deg]" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
