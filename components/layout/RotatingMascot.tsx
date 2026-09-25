'use client';

import { useEffect, useState } from 'react';

const MASCOT_COUNT = 12;
const STORAGE_KEY = 're-portal:mascot';

function mascotSrc(id: number) {
  return `/mascots/${String(id).padStart(2, '0')}.svg`;
}

export default function RotatingMascot() {
  const [mascotId, setMascotId] = useState<number | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= MASCOT_COUNT;
    const next = valid ? parsed : 1 + Math.floor(Math.random() * MASCOT_COUNT);
    if (!valid) window.sessionStorage.setItem(STORAGE_KEY, String(next));
    setMascotId(next);
  }, []);

  return (
    <div className="app-mascot" aria-hidden="true">
      {mascotId !== null && (
        <img src={mascotSrc(mascotId)} alt="" width={36} height={36} draggable={false} />
      )}
    </div>
  );
}
