/** Skeleton shown over the scene while the first slice is fetching. */
export default function Loading({ show, text }) {
  return (
    <div className={show ? "loading show" : "loading"} aria-hidden={!show}>
      <div className="loading-inner">
        <div className="spinner" />
        <p>{text}</p>
      </div>
    </div>
  );
}
