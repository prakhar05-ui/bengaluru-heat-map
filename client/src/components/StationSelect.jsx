import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Check, ChevronDown, Search, Shield, X } from 'lucide-react';

const LIST_MAX_HEIGHT = 300; // px
const EMPTY = '__empty__';

/** "H.S.R.Layout Police Station" -> "hsrlayout" : ignores case, dots, spaces and the common suffix. */
const normalise = (s) => s.toLowerCase().replace(/police station/g, '').replace(/[^a-z0-9]/g, '');
const shortName = (name) => name.replace(/ Police Station$/, '');

/** Wrap the part of `text` that matches the (normalised) query in <mark>. */
function Highlight({ text, query }) {
  if (!query) return text;
  // Map normalised character positions back to the original string.
  const positions = [];
  for (let i = 0; i < text.length; i++) if (/[a-z0-9]/i.test(text[i])) positions.push(i);
  const hay = positions.map((i) => text[i].toLowerCase()).join('');
  const at = hay.indexOf(query);
  if (at === -1) return text;
  const start = positions[at];
  const end = positions[at + query.length - 1] + 1;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-brand-100 font-semibold text-inherit">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
Highlight.propTypes = { text: PropTypes.string.isRequired, query: PropTypes.string };

/**
 * Searchable police station picker (ARIA combobox + listbox). Keyboard accessible,
 * and the map alternative to tapping an area.
 *
 * @param {Object} props
 * @param {Array<{ properties: { id: string, name: string, division?: string } }>} props.stations
 * @param {string} props.value            selected station id, '' for none
 * @param {(id: string) => void} props.onChange
 * @param {string} props.label
 * @param {string} props.emptyLabel       placeholder text, or the label of the '' option when allowEmpty
 * @param {boolean} [props.allowEmpty]    offer emptyLabel as a selectable first option (e.g. "Bengaluru City")
 * @param {boolean} [props.disabled]
 */
export default function StationSelect({ stations, value, onChange, label, emptyLabel, allowEmpty = false, disabled = false }) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState(null);

  const selected = stations.find((f) => f.properties.id === value)?.properties;
  const q = normalise(query);

  const options = useMemo(() => {
    const list = stations
      .map((f) => f.properties)
      .filter((p) => !q || normalise(p.name).includes(q))
      // Names that start with the query first.
      .sort((a, b) => (q ? normalise(a.name).indexOf(q) - normalise(b.name).indexOf(q) : 0) || a.name.localeCompare(b.name));
    return allowEmpty && !q ? [{ id: EMPTY, name: emptyLabel }, ...list] : list;
  }, [stations, q, allowEmpty, emptyLabel]);

  const place = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const up = below < Math.min(LIST_MAX_HEIGHT, 220) && r.top > below;
    setRect({ left: r.left, width: r.width, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined, max: Math.min(LIST_MAX_HEIGHT, (up ? r.top : below) - 8) });
  }, []);

  const openList = () => {
    if (disabled) return;
    place();
    setOpen(true);
    const current = options.findIndex((o) => o.id === (value || (allowEmpty ? EMPTY : '')));
    setActive(Math.max(0, current));
  };
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  /** Pointer picks dismiss the on-screen keyboard; keyboard picks keep focus for further navigation. */
  const choose = (option, { viaPointer = false } = {}) => {
    onChange(option.id === EMPTY ? '' : option.id);
    close();
    if (viaPointer) inputRef.current?.blur();
  };

  // Keep the list attached to the input while the page or bottom sheet scrolls.
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!inputRef.current?.parentElement.contains(e.target) && !listRef.current?.contains(e.target)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the active option visible.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => setActive(0), [q]);

  const onKeyDown = (e) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !(e.key === ' ' && query)) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    const last = options.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(last, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  };

  const display = open ? query : selected ? shortName(selected.name) : allowEmpty ? emptyLabel : '';

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-500">
          {open ? <Search aria-hidden="true" className="h-4 w-4" /> : <Shield aria-hidden="true" className="h-4 w-4" />}
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={display}
          placeholder={open ? 'Type to search stations…' : emptyLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) openList();
          }}
          onFocus={openList}
          onClick={() => !open && openList()}
          onKeyDown={onKeyDown}
          className="field cursor-pointer pl-9 pr-16 placeholder:text-ink-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="absolute inset-y-0 right-2 flex items-center gap-0.5">
          {value && !open && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear selection"
              className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown aria-hidden="true" className={`pointer-events-none h-4 w-4 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>

      {open &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            style={{ position: 'fixed', left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom, maxHeight: rect.max }}
            className="z-[60] overflow-y-auto rounded-xl border border-ink-100 bg-white p-1 shadow-float"
          >
            {options.length === 0 && <li className="px-3 py-2.5 text-sm text-ink-500">No station matches “{query}”</li>}
            {options.map((o, i) => {
              const isSelected = o.id === EMPTY ? !value : o.id === value;
              return (
                <li
                  key={o.id}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(e) => e.preventDefault()} // keep focus in the input
                  onClick={() => choose(o, { viaPointer: true })}
                  onMouseMove={() => active !== i && setActive(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    i === active ? 'bg-brand-50 text-ink-900' : 'text-ink-700'
                  } ${o.id === EMPTY ? 'mb-1 border-b border-ink-100 font-medium' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <Highlight text={o.id === EMPTY ? o.name : shortName(o.name)} query={q} />
                    </span>
                    {o.division && <span className="block truncate text-[11px] text-ink-500">{o.division} division</span>}
                  </span>
                  {isSelected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}

StationSelect.propTypes = {
  stations: PropTypes.array.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  emptyLabel: PropTypes.string.isRequired,
  allowEmpty: PropTypes.bool,
  disabled: PropTypes.bool,
};
