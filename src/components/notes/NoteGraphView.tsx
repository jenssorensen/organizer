import { useEffect, useRef, useState } from "react";

export function GraphView({
  nodes,
  links,
  onSelectNode,
}: {
  nodes: Array<{ id: string; title: string; sourcePath: string; linkCount: number }>;
  links: Array<{ source: string; target: string }>;
  onSelectNode: (sourcePath: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const canvasContext = context;

    const width = canvas.parentElement?.clientWidth ?? 600;
    const height = canvas.parentElement?.clientHeight ?? 400;
    canvas.width = width;
    canvas.height = height;

    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / nodes.length;
      positions.set(node.id, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      });
    });

    const nodeIds = new Set(nodes.map((node) => node.id));
    const validLinks = links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target));

    let animationFrame = 0;
    let iterations = 0;
    const maxIterations = 120;

    function draw() {
      canvasContext.clearRect(0, 0, width, height);

      canvasContext.strokeStyle = "rgba(255,255,255,0.15)";
      canvasContext.lineWidth = 1;
      for (const link of validLinks) {
        const source = positions.get(link.source);
        const target = positions.get(link.target);
        if (!source || !target) {
          continue;
        }

        canvasContext.beginPath();
        canvasContext.moveTo(source.x, source.y);
        canvasContext.lineTo(target.x, target.y);
        canvasContext.stroke();
      }

      for (const node of nodes) {
        const position = positions.get(node.id);
        if (!position) {
          continue;
        }

        const radiusValue = 4 + Math.min(node.linkCount * 2, 12);
        const isHovered = hoveredNode === node.id;

        canvasContext.beginPath();
        canvasContext.arc(position.x, position.y, radiusValue, 0, 2 * Math.PI);
        canvasContext.fillStyle = isHovered ? "#58a6ff" : "#78e6c6";
        canvasContext.fill();

        if (isHovered) {
          canvasContext.font = "12px system-ui";
          canvasContext.fillStyle = "#e6edf3";
          canvasContext.textAlign = "center";
          canvasContext.fillText(node.title, position.x, position.y - radiusValue - 6);
        }
      }
    }

    function simulate() {
      if (iterations >= maxIterations) {
        for (const [id, position] of positions) {
          positionsRef.current.set(id, { x: position.x, y: position.y });
        }
        draw();
        return;
      }

      iterations += 1;

      for (const left of positions.values()) {
        for (const right of positions.values()) {
          if (left === right) {
            continue;
          }

          const deltaX = left.x - right.x;
          const deltaY = left.y - right.y;
          const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 1);
          const force = 800 / (distance * distance);
          left.vx += (deltaX / distance) * force;
          left.vy += (deltaY / distance) * force;
        }
      }

      for (const link of validLinks) {
        const source = positions.get(link.source);
        const target = positions.get(link.target);
        if (!source || !target) {
          continue;
        }

        const deltaX = target.x - source.x;
        const deltaY = target.y - source.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const force = distance * 0.01;
        source.vx += (deltaX / distance) * force;
        source.vy += (deltaY / distance) * force;
        target.vx -= (deltaX / distance) * force;
        target.vy -= (deltaY / distance) * force;
      }

      for (const position of positions.values()) {
        position.vx += (centerX - position.x) * 0.002;
        position.vy += (centerY - position.y) * 0.002;
        position.x += position.vx * 0.3;
        position.y += position.vy * 0.3;
        position.vx *= 0.85;
        position.vy *= 0.85;
      }

      for (const [id, position] of positions) {
        positionsRef.current.set(id, { x: position.x, y: position.y });
      }

      draw();
      animationFrame = requestAnimationFrame(simulate);
    }

    simulate();

    return () => cancelAnimationFrame(animationFrame);
  }, [hoveredNode, links, nodes]);

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    for (const node of nodes) {
      const position = positionsRef.current.get(node.id);
      if (!position) {
        continue;
      }

      const radius = 4 + Math.min(node.linkCount * 2, 12);
      const deltaX = mouseX - position.x;
      const deltaY = mouseY - position.y;
      if (deltaX * deltaX + deltaY * deltaY < (radius + 4) * (radius + 4)) {
        onSelectNode(node.sourcePath);
        return;
      }
    }
  }

  function handleCanvasMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    for (const node of nodes) {
      const position = positionsRef.current.get(node.id);
      if (!position) {
        continue;
      }

      const radius = 4 + Math.min(node.linkCount * 2, 12);
      const deltaX = mouseX - position.x;
      const deltaY = mouseY - position.y;
      if (deltaX * deltaX + deltaY * deltaY < (radius + 4) * (radius + 4)) {
        setHoveredNode(node.id);
        return;
      }
    }

    setHoveredNode(null);
  }

  return (
    <div className="graph-view">
      <div className="graph-view__header">
        <p className="eyebrow">Knowledge graph</p>
        <h4>Note connections</h4>
        <span className="muted">{nodes.length} notes · {links.length} links</span>
      </div>
      <div className="graph-view__canvas-wrapper">
        <canvas className="graph-view__canvas" onClick={handleCanvasClick} onMouseMove={handleCanvasMove} ref={canvasRef} />
      </div>
    </div>
  );
}