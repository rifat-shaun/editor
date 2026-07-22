/**
 * Word-count dialog (Tools ▸ Word count). Reads counts already tracked in the
 * editor context — no new state. Same modal chrome as the other dialogs.
 */
import { createPortal } from 'react-dom';
import { getPortalHost } from '../components/portalHost';
import { useDismissable } from '../hooks/useDismissable';

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function WordCountDialog({
  words,
  chars,
  pages,
  onClose,
}: {
  words: number;
  chars: number;
  pages: number;
  onClose: () => void;
}) {
  const ref = useDismissable<HTMLDivElement>(true, onClose, { trapFocus: true });
  const rows: [string, string][] = [
    ['Words', words.toLocaleString()],
    ['Characters', chars.toLocaleString()],
    ['Pages', pages.toLocaleString()],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'var(--ui-scrim)' }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Word count"
        style={{ width: 280, background: 'var(--ui-surface)', borderRadius: 12, boxShadow: '0 12px 36px rgba(31,41,51,.2)', fontFamily: SYSTEM_FONT }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '15px 18px 4px' }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>Word count</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '8px 18px 16px' }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 12.5, color: 'var(--ui-text)' }}>
              <span>{label}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    getPortalHost(),
  );
}
