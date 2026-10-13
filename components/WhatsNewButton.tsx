'use client';

export default function WhatsNewButton({ className = 'btn btn-ghost btn-sm text-xs' }: { className?: string }) {
  const handleClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('show_update_modal'));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="View what is new in this update"
      className={className}
    >
      <span>✨ Updates</span>
    </button>
  );
}
