import {
  CollectionPicker,
  type CollectionPickerProps,
} from "./CollectionPicker";

export function HostCollectionPicker(props: CollectionPickerProps) {
  return (
    <CollectionPicker {...props} resourceUrl="/host/resources/collections" />
  );
}
