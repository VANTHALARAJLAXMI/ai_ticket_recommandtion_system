export default function LoadingSpinner({ label = 'Loading' }) {
  return (
    <div className="loading-block" role="status">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}
