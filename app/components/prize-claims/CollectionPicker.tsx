import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
export type CollectionSummary = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string | null;
  productCount: number | null;
};

export type CollectionPickerProps = {
  selectedCollection?: CollectionSummary | null;
  onSelect: (collection: CollectionSummary) => void;
  onClear?: () => void;
  disabled?: boolean;
};

type CollectionResponse = {
  collections: CollectionSummary[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  scopeGranted: boolean;
  scopeNotice?: string | null;
  error: string | null;
};

export function CollectionPicker({
  selectedCollection = null,
  onSelect,
  onClear,
  disabled = false,
  resourceUrl,
}: CollectionPickerProps & { resourceUrl: string }) {
  const fetcher = useFetcher<CollectionResponse>();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const appendPage = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!fetcher.data) return;
    setCollections((current) => {
      const combined = appendPage.current
        ? [...current, ...fetcher.data!.collections]
        : fetcher.data!.collections;
      return [
        ...new Map(
          combined.map((collection) => [collection.id, collection]),
        ).values(),
      ];
    });
  }, [fetcher.data]);

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function loadCollections(
    searchValue: string,
    after?: string | null,
    append = false,
  ) {
    appendPage.current = append;
    const query = new URLSearchParams();
    if (searchValue.trim()) query.set("search", searchValue.trim());
    if (after) query.set("after", after);
    fetcher.load(`${resourceUrl}?${query.toString()}`);
  }

  function openPicker() {
    setOpen(true);
    setSearch("");
    setCollections([]);
    loadCollections("");
  }

  return (
    <div className="prize-collection-choice">
      <span>Shopify collection</span>
      <strong>
        {selectedCollection?.title || "No collection selected"}
      </strong>
      <div>
        <button type="button" disabled={disabled} onClick={openPicker}>
          {selectedCollection ? "Change collection" : "Choose collection"}
        </button>
        {selectedCollection && onClear ? (
          <button type="button" disabled={disabled} onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          className="prize-collection-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-picker-title"
        >
          <div className="prize-collection-picker-panel">
            <header>
              <div>
                <small>Current Shopify store</small>
                <h3 id="collection-picker-title">Choose collection</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close collection picker"
              >
                ×
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setCollections([]);
                loadCollections(search);
              }}
            >
              <label>
                Search collections
                <input
                  ref={searchInput}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </label>
              <button type="submit" disabled={fetcher.state !== "idle"}>
                Search
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCollections([]);
                  loadCollections("");
                }}
              >
                Clear
              </button>
            </form>
            {fetcher.data?.error ? (
              <p className="prize-message prize-error" role="alert">
                {fetcher.data.error}
              </p>
            ) : null}
            {fetcher.data?.scopeNotice ? (
              <p className="prize-message" role="status">
                {fetcher.data.scopeNotice}
              </p>
            ) : null}
            {fetcher.state !== "idle" && collections.length === 0 ? (
              <p>Loading collections…</p>
            ) : null}
            {fetcher.state === "idle" &&
            fetcher.data &&
            !fetcher.data.error &&
            collections.length === 0 ? (
              <p>No Shopify collections match this search.</p>
            ) : null}
            <ul>
              {collections.map((collection) => (
                <li key={collection.id}>
                  {collection.imageUrl ? (
                    <img
                      src={collection.imageUrl}
                      alt={collection.imageAlt ?? ""}
                    />
                  ) : (
                    <span
                      className="prize-collection-placeholder"
                      aria-hidden="true"
                    >
                      ◆
                    </span>
                  )}
                  <div>
                    <strong>{collection.title}</strong>
                    <small>/{collection.handle}</small>
                    <span>
                      {collection.productCount === null
                        ? "Product count unavailable"
                        : `${collection.productCount} ${collection.productCount === 1 ? "product" : "products"}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(collection);
                      setOpen(false);
                    }}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
            {fetcher.data?.pageInfo.hasNextPage ? (
              <button
                type="button"
                disabled={fetcher.state !== "idle"}
                onClick={() =>
                  loadCollections(
                    search,
                    fetcher.data?.pageInfo.endCursor,
                    true,
                  )
                }
              >
                Load more
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
