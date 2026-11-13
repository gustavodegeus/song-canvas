import { useRef, useState } from 'react';
import { motifs, type Motif } from './artwork/motifs';
import { categories, motifIds, searchMotifs, type Category } from './artwork/catalog';

const PREVIEW_COUNT = 6;
interface Props { value: Motif; onChange: (value: Motif) => void; disabled?: boolean }

export default function DrawingPicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [expanded, setExpanded] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const filtered = query.trim() !== '' || category !== 'all';
  const matches = searchMotifs(query, category);
  const visible = expanded || filtered ? matches : matches.slice(0, PREVIEW_COUNT);
  const selectionVisible = visible.includes(value);

  function clearFilters() {
    setQuery(''); setCategory('all');
    search.current?.focus();
  }
  return <fieldset className="drawing-picker" disabled={disabled}>
    <legend>Choose a drawing</legend>
    <label className="sr-only" htmlFor="drawing-search">Search drawings</label>
    <input ref={search} id="drawing-search" type="search" value={query}
      placeholder="Try soccer, ocean, amor…" autoComplete="off" spellCheck={false}
      onChange={event => setQuery(event.target.value)} aria-describedby="drawing-search-help" />
    <p id="drawing-search-help" className="field-note">24 little stories. Search in English or Portuguese.</p>
    <div className="drawing-filter-row">
      <label className="sr-only" htmlFor="drawing-category">Drawing category</label>
      <select id="drawing-category" value={category} onChange={event => setCategory(event.target.value as Category)}>
        {Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {filtered && <button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}
    </div>
    <p className="drawing-count" role="status" aria-live="polite">{visible.length < matches.length
      ? `Showing ${visible.length} of ${matches.length} drawings`
      : `${matches.length} ${matches.length === 1 ? 'drawing' : 'drawings'}${filtered ? ' found' : ''}`}</p>
    {visible.length > 0 ? <div className={`motifs ${expanded || filtered ? 'motifs-scroll' : ''}`}>
      {visible.map(id => <label key={id} className="motif">
        <input type="radio" name="motif" value={id} checked={value === id} onChange={() => onChange(id)} />
        {/* Only locally bundled, trusted SVG markup. Never interpolate search text. */}
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: motifs[id].svg }} />
        <span>{motifs[id].label}</span>
      </label>)}
    </div> : <div className="drawing-empty"><strong>No drawings found.</strong><p>Try “nature,” “music,” or “futebol,” or choose another theme.</p><button type="button" className="text-button" onClick={clearFilters}>Show all themes</button></div>}
    {!filtered && matches.length > PREVIEW_COUNT && <button type="button" className="text-button drawing-expand"
      aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Show fewer drawings −' : `Explore all ${motifIds.length} drawings +`}
    </button>}
    <div className="drawing-selection">
      <span className="selection-thumbnail" aria-hidden="true" dangerouslySetInnerHTML={{ __html: motifs[value].svg }} />
      <span><span className="selection-label">On your notebook</span><strong>{motifs[value].label}</strong>{!selectionVisible && <span className="selection-hint">Your selection stays while you browse.</span>}</span>
    </div>
  </fieldset>;
}
