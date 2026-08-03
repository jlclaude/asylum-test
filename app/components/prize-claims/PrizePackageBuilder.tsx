import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { PrizeBallType } from "../../lib/prize-packages";
import type { PrizeCollectionChoice } from "../../lib/shopify-prize-products.server";

type DraftOption = { label: string; ballType: PrizeBallType; ballCount: number; collectionId: string; collectionTitle: string; collectionHandle: string };
const newOption = (): DraftOption => ({ label: "", ballType: "DOMESTIC", ballCount: 1, collectionId: "", collectionTitle: "", collectionHandle: "" });

export function PrizePackageBuilder() {
  const collectionFetcher = useFetcher<{ collections: PrizeCollectionChoice[]; pageInfo: { hasNextPage: boolean; endCursor: string | null }; scopeGranted: boolean; scopeNotice?: string | null; error: string | null }>();
  const [options, setOptions] = useState<DraftOption[]>([newOption()]);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collections, setCollections] = useState<PrizeCollectionChoice[]>([]);
  const appendPage = useRef(false);
  const update = (index: number, value: Partial<DraftOption>) =>
    setOptions((current) => current.map((option, position) => position === index ? { ...option, ...value } : option));
  const move = (index: number, direction: -1 | 1) => setOptions((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  useEffect(() => {
    if (!collectionFetcher.data) return;
    setCollections((current) => {
      const combined = appendPage.current ? [...current, ...collectionFetcher.data!.collections] : collectionFetcher.data!.collections;
      return [...new Map(combined.map((collection) => [collection.id, collection])).values()];
    });
  }, [collectionFetcher.data]);
  function loadCollections(search: string, after?: string | null, append = false) {
    appendPage.current = append;
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (after) query.set("after", after);
    collectionFetcher.load(`/app/prize-collections?${query.toString()}`);
  }
  function openCollectionPicker(index: number) {
    setPickerIndex(index);
    setCollectionSearch("");
    setCollections([]);
    loadCollections("");
  }
  function chooseCollection(collection: PrizeCollectionChoice) {
    if (pickerIndex === null) return;
    update(pickerIndex, { collectionId: collection.id, collectionTitle: collection.title, collectionHandle: collection.handle });
    setPickerIndex(null);
  }

  return (
    <fieldset className="prize-package-builder">
      <legend>HOW MANY PRIZE OPTIONS?</legend>
      <p>Build the choices this winner may select. Separate alternatives are shown with “OR”.</p>
      <input type="hidden" name="prizeOptionsJson" value={JSON.stringify(options)} />
      {options.map((option, index) => (
        <div className="prize-package-option" key={index}>
          {index ? <strong className="prize-package-or">OR</strong> : null}
          <span className="prize-package-number">Option {index + 1}</span>
          <label>Option label<input value={option.label} maxLength={200} required onChange={(event) => update(index, { label: event.currentTarget.value })} /></label>
          <label>Ball type<select value={option.ballType} onChange={(event) => update(index, { ballType: event.currentTarget.value as PrizeBallType })}><option value="DOMESTIC">Domestic</option><option value="OVERSEAS">Overseas</option><option value="CUSTOM">Custom</option></select></label>
          <label>Number of balls<input type="number" min={1} max={10} step={1} value={option.ballCount} required onChange={(event) => update(index, { ballCount: Number(event.currentTarget.value) })} /></label>
          <div className="prize-collection-choice"><span>Shopify collection</span><strong>{option.collectionTitle || "No collection selected"}</strong><button type="button" onClick={() => openCollectionPicker(index)}>{option.collectionId ? "Change collection" : "Choose collection"}</button></div>
          <div className="prize-package-controls">
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button>
            <button type="button" disabled={index === options.length - 1} onClick={() => move(index, 1)}>Move down</button>
            <button type="button" disabled={options.length === 1} onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}>Remove</button>
          </div>
        </div>
      ))}
      <button type="button" className="prize-add-option" onClick={() => setOptions((current) => [...current, newOption()])}>Add another option</button>
      <button type="button" onClick={() => setOptions([newOption()])}>Cancel</button>
      {pickerIndex !== null ? (
        <div className="prize-collection-picker" role="dialog" aria-modal="true" aria-labelledby="collection-picker-title">
          <div className="prize-collection-picker-panel">
            <header><div><small>Current Shopify store</small><h3 id="collection-picker-title">Choose collection</h3></div><button type="button" onClick={() => setPickerIndex(null)} aria-label="Close collection picker">×</button></header>
            <form onSubmit={(event) => { event.preventDefault(); setCollections([]); loadCollections(collectionSearch); }}>
              <label>Search collections<input type="search" value={collectionSearch} onChange={(event) => setCollectionSearch(event.currentTarget.value)} /></label>
              <button type="submit" disabled={collectionFetcher.state !== "idle"}>Search</button>
              <button type="button" onClick={() => { setCollectionSearch(""); setCollections([]); loadCollections(""); }}>Clear</button>
            </form>
            {collectionFetcher.data?.error ? <p className="prize-message prize-error" role="alert">{collectionFetcher.data.error}</p> : null}
            {collectionFetcher.data?.scopeNotice ? <p className="prize-message" role="status">{collectionFetcher.data.scopeNotice}</p> : null}
            {collectionFetcher.state !== "idle" && collections.length === 0 ? <p>Loading collections…</p> : null}
            {collectionFetcher.state === "idle" && !collectionFetcher.data?.error && collections.length === 0 ? <p>No Shopify collections match this search.</p> : null}
            <ul>{collections.map((collection) => <li key={collection.id}>{collection.imageUrl ? <img src={collection.imageUrl} alt={collection.imageAlt ?? ""} /> : <span className="prize-collection-placeholder" aria-hidden="true">◆</span>}<div><strong>{collection.title}</strong><small>/{collection.handle}</small><span>{collection.productCount === null ? "Product count unavailable" : `${collection.productCount} ${collection.productCount === 1 ? "product" : "products"}`}</span></div><button type="button" onClick={() => chooseCollection(collection)}>Select</button></li>)}</ul>
            {collectionFetcher.data?.pageInfo.hasNextPage ? <button type="button" disabled={collectionFetcher.state !== "idle"} onClick={() => loadCollections(collectionSearch, collectionFetcher.data?.pageInfo.endCursor, true)}>Load more</button> : null}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
