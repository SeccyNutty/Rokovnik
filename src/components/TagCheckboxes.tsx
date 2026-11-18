import { TAGS } from "@/lib/tags";

/** Izbor oznaka (tema) kvačicama; šalje se kao više vrijednosti istog imena. */
export function TagCheckboxes({ name, selected, idPrefix }: { name: string; selected: string[]; idPrefix: string }) {
  return (
    <div className="tagpick">
      {TAGS.map((t) => (
        <label key={t.key} className="tagpick__item" htmlFor={`${idPrefix}-${t.key}`}>
          <input id={`${idPrefix}-${t.key}`} type="checkbox" name={name} value={t.key} defaultChecked={selected.includes(t.key)} />
          <span>{t.label}</span>
        </label>
      ))}
    </div>
  );
}
