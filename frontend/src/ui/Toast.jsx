/** Small non-blocking messages, stacked above the colorbar. */
export default function Toast({ messages, onDismiss }) {
  if (!messages.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="toast">
          <span>{m.text}</span>
          <button onClick={() => onDismiss(m.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
