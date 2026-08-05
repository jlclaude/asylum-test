import {
  CollectionPicker,
  type CollectionPickerProps,
} from "./CollectionPicker";

export function EmbeddedCollectionPicker(props: CollectionPickerProps) {
  return <CollectionPicker {...props} resourceUrl="/app/prize-collections" />;
}
