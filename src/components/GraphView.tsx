import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { NoteIndexEntry } from '../types/vault';

interface GraphViewProps {
  notes: NoteIndexEntry[];
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
}

interface SimNode {
  id: string;
  title: string;
  folderPath: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}

interface SimEdge {
  source: string;
  target: string;
}

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [folderFilter, setFolderFilter] = useState('ALL');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeNotes = useMemo(
    () =>
      notes.filter(
        (n) => !n.deleted && (folderFilter === 'ALL' || n.folderPath.startsWith(folderFilter))
      ),
    [notes, folderFilter]
  );

  const folders = useMemo(() => {
    const set = new Set<string>();
    notes.filter((n) => !n.deleted).forEach((n) => set.add(n.folderPath.split('/')[0]));
    return Array.from(set).sort();
  }, [notes]);

  const { simNodes, simEdges } = useMemo(() => {
    const titleToId = new Map<string, string>();
    activeNotes.forEach((n) => titleToId.set(n.title.toLowerCase(), n.id));

    const edges: SimEdge[] = [];
    const degreeMap = new Map<string, number>();

    for (const n of activeNotes) {
      for (const link of n.outboundLinks) {
        const targetId = titleToId.get(link.toLowerCase());
        if (targetId && targetId !== n.id) {
          edges.push({ source: n.id, target: targetId });
          degreeMap.set(n.id, (degreeMap.get(n.id) ?? 0) + 1);
          degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + 1);
        }
      }
    }

    const radius = 160;
    const nodes: SimNode[] = activeNotes.map((n, idx) => {
      const angle = (idx / Math.max(1, activeNotes.length)) * Math.PI * 2;
      return {
        id: n.id,
        title: n.title,
        folderPath: n.folderPath,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        degree: degreeMap.get(n.id) ?? 0,
      };
    });

    // Run deterministic force-directed layout iterations
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (let iter = 0; iter < 120; iter++) {
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const distSq = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(distSq);
          const force = 2600 / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Spring attraction along edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 125) * 0.04;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Center gravity + damping
      for (const node of nodes) {
        node.vx = (node.vx - node.x * 0.012) * 0.82;
        node.vy = (node.vy - node.y * 0.012) * 0.82;
        node.x += node.vx;
        node.y += node.vy;
      }
    }

    return { simNodes: nodes, simEdges: edges };
  }, [activeNotes]);

  // Draw graph onto Canvas with DPR scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const inkColor = styles.getPropertyValue('--fv-ink').trim() || '#18181b';
    const mutedColor = styles.getPropertyValue('--fv-muted').trim() || '#64646d';
    const accentColor = styles.getPropertyValue('--fv-accent').trim() || '#1d4ed8';
    const borderColor = styles.getPropertyValue('--fv-border').trim() || '#e4e2dc';
    const surfaceColor = styles.getPropertyValue('--fv-surface').trim() || '#ffffff';

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.translate(rect.width / 2 + pan.x, rect.height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    // Draw edges
    for (const edge of simEdges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const isHighlighted = hoveredId === a.id || hoveredId === b.id;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isHighlighted ? accentColor : borderColor;
      ctx.lineWidth = isHighlighted ? 2 : 1.2;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of simNodes) {
      const isActive = node.id === activeNoteId;
      const isHover = node.id === hoveredId;
      const r = 7 + Math.min(8, node.degree * 2);

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive || isHover ? accentColor : surfaceColor;
      ctx.fill();
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.strokeStyle = isActive || isHover ? accentColor : inkColor;
      ctx.stroke();

      // Label
      ctx.font = `${isActive || isHover ? '600' : '500'} 11.5px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = isActive || isHover ? accentColor : mutedColor;
      ctx.fillText(node.title, node.x, node.y + r + 15);
    }

    ctx.restore();
  }, [simNodes, simEdges, zoom, pan, activeNoteId, hoveredId]);

  const draggingRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    moved: boolean;
  }>({ active: false, lastX: 0, lastY: 0, moved: false });

  const findNodeAtClientPos = (clientX: number, clientY: number): SimNode | null => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;
    const rect = container.getBoundingClientRect();
    const wx = (clientX - rect.left - rect.width / 2 - pan.x) / zoom;
    const wy = (clientY - rect.top - rect.height / 2 - pan.y) / zoom;

    for (const node of simNodes) {
      const dist = Math.hypot(node.x - wx, node.y - wy);
      if (dist <= 20) return node;
    }
    return null;
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: 'var(--fv-canvas)', color: 'var(--fv-ink)' }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold">Knowledge Graph</h2>
          <span className="text-xs tabular-nums" style={{ color: 'var(--fv-muted)' }}>
            {simNodes.length} nodes · {simEdges.length} backlinks
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="min-h-[38px] rounded-lg border px-2.5 text-xs outline-none"
            style={{
              borderColor: 'var(--fv-border)',
              backgroundColor: 'var(--fv-canvas)',
            }}
          >
            <option value="ALL">All Folders</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--fv-border)' }}
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--fv-border)' }}
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--fv-border)' }}
            aria-label="Reset graph view"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            draggingRef.current = {
              active: true,
              lastX: e.clientX,
              lastY: e.clientY,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            if (draggingRef.current.active) {
              const dx = e.clientX - draggingRef.current.lastX;
              const dy = e.clientY - draggingRef.current.lastY;
              if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                draggingRef.current.moved = true;
              }
              draggingRef.current.lastX = e.clientX;
              draggingRef.current.lastY = e.clientY;
              setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
            } else {
              const hit = findNodeAtClientPos(e.clientX, e.clientY);
              setHoveredId(hit?.id ?? null);
            }
          }}
          onPointerUp={(e) => {
            const wasClick = !draggingRef.current.moved;
            draggingRef.current.active = false;
            if (wasClick) {
              const hit = findNodeAtClientPos(e.clientX, e.clientY);
              if (hit) onSelectNote(hit.id);
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            setZoom((z) => Math.min(2.5, Math.max(0.35, z + delta)));
          }}
        />
        <div
          className="absolute bottom-3 left-4 text-xs pointer-events-none"
          style={{ color: 'var(--fv-muted)' }}
        >
          Drag to pan · Scroll or pinch to zoom · Tap any node to open document
        </div>
      </div>
    </div>
  );
};
