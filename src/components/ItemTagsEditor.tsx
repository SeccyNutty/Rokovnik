import { setItemTagsAction } from "@/app/community-actions";
import { tagLabel } from "@/lib/tags";
import { SubmitButton } from "./SubmitButton";
import { TagCheckboxes } from "./TagCheckboxes";

/** Oznake jedne objave u tablici: prikaz i ispravak (administrator ili upravitelj zajednice). */
export function ItemTagsEditor({ itemId, tags, from }: { itemId: string; tags: string[]; from: "admin" | "organizacija" }) {
  return (
    <details className="tagedit">
      <summary>{tags.length ? tags.map(tagLabel).join(", ") : "bez oznaka"}</summary>
      <form action={setItemTagsAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="povratak" value={from} />
        <TagCheckboxes name="tags" selected={tags} idPrefix={`it-${itemId.slice(0, 8)}`} />
        <SubmitButton className="btn btn--small" pending="Spremam…">
          Spremi oznake
        </SubmitButton>
      </form>
    </details>
  );
}
