import React, { useId, useMemo } from 'react';

export interface WordCarouselLoaderProps {
  prefix?: string;
  words: string[];
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

/**
 * HorizonX Word Carousel Loader
 * Loop contínuo com repetição da primeira palavra ao final, keyframes dinâmicos para N palavras,
 * hold ~42%, overshoot elástico ~2.5% e alpha mask nas bordas superior e inferior.
 */
export function WordCarouselLoader({
  prefix,
  words,
  subtitle,
  size = 'md',
  className = '',
  ariaLabel
}: WordCarouselLoaderProps) {
  const safeWords = words && words.length > 0 ? words : ['Aguarde…'];
  const n = safeWords.length;
  const loopItems = useMemo(() => [...safeWords, safeWords[0]], [safeWords]);
  const animationName = `wcl-slide-dyn-${n}`;
  const durationSec = Math.max(2.4, n * 2.2);

  // Geração matemática das keyframes para qualquer quantidade N de palavras
  const keyframesCss = useMemo(() => {
    const d = 100 / n;
    const lines: string[] = [];
    for (let k = 0; k < n; k++) {
      const start = (k * d).toFixed(2);
      const hold = (k * d + d * 0.42).toFixed(2);
      const overshoot = (k * d + d * 0.88).toFixed(2);
      const end = ((k + 1) * d).toFixed(2);
      const pos = (-k * 1.6).toFixed(3);
      const posOvershoot = (-((k + 1) + 0.025) * 1.6).toFixed(3);
      const posNext = (-(k + 1) * 1.6).toFixed(3);

      lines.push(`${start}% { transform: translateY(${pos}em); }`);
      lines.push(`${hold}% { transform: translateY(${pos}em); }`);
      lines.push(`${overshoot}% { transform: translateY(${posOvershoot}em); }`);
      lines.push(`${end}% { transform: translateY(${posNext}em); }`);
    }
    return `@keyframes ${animationName} {\n${lines.join('\n')}\n}`;
  }, [n, animationName]);

  const computedAriaLabel = ariaLabel || `${prefix ? `${prefix} ` : ''}${safeWords[0]}`;

  return (
    <div
      className={`wcl-root wcl-size-${size} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={computedAriaLabel}
    >
      <style>{keyframesCss}</style>
      <div className="wcl-line">
        <span className="wcl-indicator" aria-hidden="true">
          <svg className="wcl-spinner" viewBox="0 0 16 16" fill="none">
            <circle
              className="wcl-spinner-track"
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeOpacity="0.2"
            />
            <path
              className="wcl-spinner-head"
              d="M14 8a6 6 0 0 0-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {prefix && <span className="wcl-prefix">{prefix}</span>}
        <div className="wcl-window" aria-hidden="true">
          <div
            className="wcl-track"
            style={{
              animationName,
              animationDuration: `${durationSec}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite'
            }}
          >
            {loopItems.map((word, idx) => (
              <div className="wcl-word" key={`${word}-${idx}`}>
                {word}
              </div>
            ))}
          </div>
        </div>
      </div>
      {subtitle && <p className="wcl-subtitle">{subtitle}</p>}
    </div>
  );
}

export interface SkeletonBlockProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonBlock({
  width,
  height,
  borderRadius,
  className = '',
  style
}: SkeletonBlockProps) {
  const combinedStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    ...style
  };

  return <div className={`wcl-skeleton-block ${className}`} style={combinedStyle} aria-hidden="true" />;
}

export function TableRowsSkeleton({
  rows = 5,
  cols = 6,
  className = ''
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <tbody className={`wcl-table-skeleton-body ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIdx) => (
        <tr key={rowIdx} className="wcl-skeleton-row">
          {Array.from({ length: cols }, (_, colIdx) => {
            const widthPct = colIdx === 0 ? 80 : colIdx === 1 ? 65 : colIdx === cols - 1 ? 50 : 70;
            return (
              <td key={colIdx}>
                <SkeletonBlock height={14} width={`${widthPct}%`} />
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );
}

export function OdooWorkspaceSkeleton() {
  return (
    <div className="odoo-workspace odoo-workspace-skeleton" aria-hidden="true">
      <main className="odoo-project-column">
        <section className="odoo-project-overview skeleton-card">
          <header className="odoo-project-heading">
            <SkeletonBlock width={36} height={36} borderRadius={8} />
            <div className="odoo-project-name" style={{ flex: 1, display: 'grid', gap: 6 }}>
              <SkeletonBlock width="25%" height={10} />
              <SkeletonBlock width="60%" height={18} />
            </div>
            <SkeletonBlock width={100} height={32} borderRadius={7} />
          </header>
          <div className="odoo-project-facts" style={{ marginTop: 14 }}>
            {Array.from({ length: 4 }, (_, idx) => (
              <div key={idx} style={{ display: 'grid', gap: 4 }}>
                <SkeletonBlock width="40%" height={9} />
                <SkeletonBlock width="75%" height={14} />
              </div>
            ))}
          </div>
          <div className="odoo-project-counts" style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <SkeletonBlock width={80} height={13} />
            <SkeletonBlock width={95} height={13} />
            <SkeletonBlock width={120} height={13} />
          </div>
        </section>

        <section className="odoo-project-section skeleton-card" style={{ marginTop: 14 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <SkeletonBlock width={80} height={16} />
            <SkeletonBlock width={60} height={12} />
          </header>
          <div className="odoo-task-list" style={{ display: 'grid', gap: 8 }}>
            {Array.from({ length: 3 }, (_, idx) => (
              <article key={idx} className="odoo-task-row skeleton-task-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
                <div style={{ flex: 1, display: 'grid', gap: 5 }}>
                  <SkeletonBlock width={`${55 + (idx % 2) * 20}%`} height={13} />
                  <SkeletonBlock width="35%" height={10} />
                </div>
                <SkeletonBlock width={70} height={12} />
              </article>
            ))}
          </div>
        </section>

        <section className="odoo-project-section skeleton-card" style={{ marginTop: 14 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <SkeletonBlock width={150} height={16} />
            <SkeletonBlock width={30} height={16} borderRadius={8} />
          </header>
          <div className="odoo-document-list" style={{ display: 'grid', gap: 8 }}>
            {Array.from({ length: 2 }, (_, idx) => (
              <article key={idx} className="odoo-document-row skeleton-doc-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <SkeletonBlock width={30} height={30} borderRadius={6} />
                <div style={{ flex: 1, display: 'grid', gap: 5 }}>
                  <SkeletonBlock width="60%" height={13} />
                  <SkeletonBlock width="40%" height={10} />
                </div>
                <SkeletonBlock width={75} height={28} borderRadius={6} />
              </article>
            ))}
          </div>
        </section>
      </main>

      <aside className="odoo-chatter-panel skeleton-card">
        <header className="odoo-chatter-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <SkeletonBlock width={70} height={16} />
            <SkeletonBlock width={110} height={10} />
          </div>
          <SkeletonBlock width={28} height={28} borderRadius={6} />
        </header>

        <div className="odoo-chatter-actions" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <SkeletonBlock width="50%" height={34} borderRadius={7} />
          <SkeletonBlock width="50%" height={34} borderRadius={7} />
        </div>

        <div className="odoo-chatter-feed" style={{ display: 'grid', gap: 14 }}>
          {Array.from({ length: 3 }, (_, idx) => (
            <article key={idx} className="odoo-chat-message skeleton-message" style={{ display: 'flex', gap: 10, padding: 10 }}>
              <SkeletonBlock width={32} height={32} borderRadius="50%" />
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <SkeletonBlock width="45%" height={12} />
                  <SkeletonBlock width={50} height={10} />
                </div>
                <SkeletonBlock width="90%" height={11} />
                <SkeletonBlock width="70%" height={11} />
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function BuildingDrawerSkeleton() {
  return (
    <div className="detail-content-grid building-drawer-skeleton" aria-hidden="true">
      <div className="detail-primary">
        <div className="detail-section-heading" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <SkeletonBlock width={120} height={10} />
            <SkeletonBlock width={160} height={18} />
          </div>
          <SkeletonBlock width={90} height={24} borderRadius={12} />
        </div>

        <div className="current-status-card fenix-status-card skeleton-card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="status-card-header-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <SkeletonBlock width={38} height={38} borderRadius={10} />
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <SkeletonBlock width={70} height={9} />
              <SkeletonBlock width="55%" height={15} />
              <SkeletonBlock width="75%" height={11} />
            </div>
            <SkeletonBlock width={110} height={30} borderRadius={7} />
          </div>

          <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 10, display: 'flex', gap: 8 }}>
            <SkeletonBlock width={120} height={28} borderRadius={6} />
            <SkeletonBlock width={110} height={28} borderRadius={6} />
          </div>
        </div>

        <div className="timeline-block skeleton-card" style={{ padding: 16 }}>
          <div className="timeline-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <SkeletonBlock width={100} height={16} />
            <SkeletonBlock width={110} height={26} borderRadius={6} />
          </div>
          <div className="timeline-steps-skeleton" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            {Array.from({ length: 4 }, (_, idx) => (
              <div key={idx} style={{ flex: 1, display: 'grid', gap: 8, justifyItems: 'start' }}>
                <SkeletonBlock width={16} height={16} borderRadius="50%" />
                <SkeletonBlock width="80%" height={11} />
                <SkeletonBlock width="60%" height={9} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="detail-ai-aside skeleton-card">
        <div className="ai-aside-head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <SkeletonBlock width={28} height={28} borderRadius={8} />
          <div style={{ flex: 1, display: 'grid', gap: 4 }}>
            <SkeletonBlock width={90} height={13} />
            <SkeletonBlock width={120} height={9} />
          </div>
          <SkeletonBlock width={6} height={6} borderRadius="50%" />
        </div>

        <div className="ai-answer-card" style={{ padding: 12, marginBottom: 12 }}>
          <SkeletonBlock width={80} height={10} style={{ marginBottom: 10 }} />
          <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
            <SkeletonBlock width="100%" height={12} />
            <SkeletonBlock width="94%" height={12} />
            <SkeletonBlock width="82%" height={12} />
            <SkeletonBlock width="65%" height={12} />
          </div>
          <SkeletonBlock width="50%" height={9} />
        </div>

        <div style={{ padding: '10px 0', display: 'grid', gap: 6 }}>
          <SkeletonBlock width={130} height={11} />
          <SkeletonBlock width="95%" height={12} />
          <SkeletonBlock width="80%" height={12} />
        </div>

        <SkeletonBlock width="100%" height={36} borderRadius={7} style={{ marginTop: 10 }} />
      </aside>
    </div>
  );
}
