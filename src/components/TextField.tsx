/**
 * TextField — the one canonical text input for the app.
 *
 * Presentational only: it owns height, border, focus ring, placeholder,
 * disabled and error appearance (see the `.ui-field` block in styles.css) so
 * every text input renders at one consistent height per size variant. It bakes
 * in NO business logic — callers keep their own value/onChange/validation and
 * every native prop (onKeyDown, onBlur, onFocus, onMouseDown, name, inputMode,
 * maxLength, aria-*, …) is spread straight onto the underlying <input>, so
 * existing behaviors — including toolbar selection-preservation handlers — pass
 * through unchanged.
 *
 * Text inputs only. Leave textareas, selects, toggles, range/color inputs, and
 * the borderless inputs embedded inside composed widgets (Select/Menu) alone.
 */
import { forwardRef, useId, type ReactNode, type InputHTMLAttributes } from 'react';

export type TextFieldSize = 'sm' | 'md' | 'lg';

/** Text-like input types only — no checkbox/radio/range/color/file. */
type TextLikeType = 'text' | 'search' | 'url' | 'email' | 'tel' | 'password';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'prefix'> {
  /** Height variant. Defaults to `md` (34px). */
  size?: TextFieldSize;
  type?: TextLikeType;
  /** Invalid state → danger border/background + `aria-invalid`. */
  error?: boolean;
  /** Optional message rendered under the field (wired via `aria-describedby`). */
  errorMessage?: string;
  /** Leading adornment (icon/glyph). Never affects height. */
  icon?: ReactNode;
  /** Trailing adornment (e.g. a `.pdf` suffix). Never affects height. */
  suffix?: ReactNode;
  /** Stretch to the container width (default) or size to content. */
  fullWidth?: boolean;
  /** Class for the wrapper box — use for width/layout, never height/padding. */
  className?: string;
  /** Class for the inner <input> — e.g. `text-center`, `font-semibold`. */
  inputClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    size = 'md',
    type = 'text',
    error = false,
    errorMessage,
    icon,
    suffix,
    fullWidth = true,
    disabled,
    className,
    inputClassName,
    id,
    'aria-invalid': ariaInvalidProp,
    'aria-describedby': ariaDescribedByProp,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const errorId = errorMessage ? `${id ?? autoId}-error` : undefined;
  const describedBy = [ariaDescribedByProp, errorId].filter(Boolean).join(' ') || undefined;

  const wrapperClass = [
    'ui-field',
    `ui-field--${size}`,
    error && 'ui-field--error',
    disabled && 'ui-field--disabled',
    !fullWidth && 'ui-field--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const field = (
    <span className={wrapperClass}>
      {icon != null && (
        <span className="ui-field__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        type={type}
        disabled={disabled}
        className={['ui-field__input', inputClassName].filter(Boolean).join(' ')}
        aria-invalid={ariaInvalidProp ?? (error || undefined)}
        aria-describedby={describedBy}
        {...rest}
      />
      {suffix != null && <span className="ui-field__suffix">{suffix}</span>}
    </span>
  );

  // No message → return the bare field so callers can drop it into any layout.
  if (!errorMessage) return field;

  return (
    <span style={{ display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : undefined }}>
      {field}
      <span id={errorId} className="ui-field__error-msg" role="alert">
        {errorMessage}
      </span>
    </span>
  );
});
