'use client';

import { useEffect, useRef } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  delay: number;
}

export default function StatCard({ label, value, icon, delay }: StatCardProps) {
  const countRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof value === 'number' && !label.includes('Cost')) {
      // Count up animation for numbers
      const target = value;
      let current = 0;
      const duration = 600;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        current = Math.floor(target * progress);

        if (countRef.current) {
          countRef.current.textContent = current.toLocaleString();
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          if (countRef.current) {
            countRef.current.textContent = target.toLocaleString();
          }
        }
      };

      animate();
    }
  }, [value, label]);

  return (
    <div
      className="stat-card"
      style={{
        animationDelay: `${delay}s`,
      }}
    >
      <div className="card-chrome">
        <div className="card-traffic-lights">
          <div className="traffic-light-dot red"></div>
          <div className="traffic-light-dot yellow"></div>
          <div className="traffic-light-dot green"></div>
        </div>
      </div>

      <div className="card-content">
        <div className="card-icon">{icon}</div>
        <div className="card-body">
          <div className="card-label">{label}</div>
          <div className="card-value" ref={countRef}>
            {typeof value === 'number' && !label.includes('Cost')
              ? value.toLocaleString()
              : value}
          </div>
        </div>
      </div>

      <div className="card-glow"></div>
    </div>
  );
}
