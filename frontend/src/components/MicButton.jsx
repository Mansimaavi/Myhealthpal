export default function MicButton({ listening, onStart, onStop, disabled }) {
  return (
    <button
      type="button"
      className={`mic ${listening ? 'mic--listening' : ''}`}
      onClick={listening ? onStop : onStart}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stop voice input' : 'Speak your message'}
      title={listening ? 'Stop listening' : 'Speak your message'}
    >
      <span className="mic__ring" aria-hidden="true" />
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.59a6 6 0 0 0 5-5.91Z"
        />
      </svg>
    </button>
  );
}
