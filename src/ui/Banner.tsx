import { useEffect, useState } from 'react';
import { useSim } from '../store/simStore';

export function Banner() {
  const banner = useSim((s) => s.banner);
  const [visible, setVisible] = useState<number | null>(null);

  useEffect(() => {
    if (!banner) return;
    setVisible(banner.id);
    const t = setTimeout(() => setVisible(null), banner.kind === 'end' ? 4000 : 7000);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner || visible !== banner.id) return null;
  const title = banner.kind === 'injected' ? '¡ÚLTIMA HORA!' : banner.kind === 'end' ? 'FIN' : 'SUCESO';
  return (
    <div className={`banner banner-${banner.kind}`} role="status" onClick={() => setVisible(null)}>
      <span className="banner-title">{title}</span>
      <span className="banner-text">
        {banner.text}
        {banner.location && <em> · {banner.location}</em>}
      </span>
    </div>
  );
}
