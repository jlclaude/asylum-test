import { useState } from "react";
import { DOMESTIC_BALL_WEIGHTS, isCollectionPrizeOption, type PrizePackageOption } from "../../lib/prize-packages";
import type { PublicPrizeProduct } from "../../lib/shopify-prize-products.server";

function ProductChoice({ products, position, ballType }: { products: PublicPrizeProduct[]; position: number; ballType: PrizePackageOption["ballType"] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PublicPrizeProduct | null>(null);
  const shown = products.filter((product) => product.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const label = `${ballType.charAt(0)}${ballType.slice(1).toLowerCase()} Ball ${position}`;
  return (
    <section className="prize-product-selection" aria-labelledby={`ball-${position}-heading`}>
      <h3 id={`ball-${position}-heading`}>{label}</h3>
      <input type="hidden" name="productId" value={selected?.id ?? ""} />
      {selected ? (
        <div className="prize-selected-product">
          {selected.imageUrl ? <img src={selected.imageUrl} alt={selected.imageAlt ?? ""} /> : null}
          <strong>{selected.title}</strong>
          <button type="button" onClick={() => setSelected(null)}>Change selection</button>
        </div>
      ) : (
        <div className="prize-product-picker">
          <label>Search this collection<input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></label>
          {shown.length ? <ul>{shown.map((product) => <li key={product.id}>{product.imageUrl ? <img src={product.imageUrl} alt={product.imageAlt ?? ""} /> : null}<strong>{product.title}</strong><button type="button" onClick={() => setSelected(product)}>Select</button></li>)}</ul> : <p>No available products match this search.</p>}
        </div>
      )}
      {ballType === "DOMESTIC" ? <label>Weight<select name="ballWeight" required defaultValue=""><option value="" disabled>Select weight</option>{DOMESTIC_BALL_WEIGHTS.map((weight) => <option value={weight} key={weight}>{weight} lb</option>)}</select></label> : null}
    </section>
  );
}

export function PublicPrizePackageSelector({ options, productsByOption }: { options: PrizePackageOption[]; productsByOption: Record<string, PublicPrizeProduct[]> }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = options.find((option) => option.id === selectedId) ?? null;
  return (
    <fieldset className="prize-public-options">
      <legend>CHOOSE YOUR PRIZE</legend>
      <div className="prize-option-choices">
        {options.map((option, index) => (
          <label className="prize-option-choice" key={option.id}>
            {index ? <span className="prize-option-or">OR</span> : null}
            <input type="radio" name="selectedPrizeOptionId" value={option.id} required checked={selectedId === option.id} onChange={() => setSelectedId(option.id)} />
            <span><strong>Prize Option {index + 1}: {option.label}</strong><small>{option.ballCount} {option.ballType.toLowerCase()} bowling {option.ballCount === 1 ? "ball" : "balls"}{option.collectionTitle ? ` · ${option.collectionTitle}` : ""}</small></span>
          </label>
        ))}
      </div>
      {selected ? isCollectionPrizeOption(selected) ? (
        <div className="prize-ball-selections">
          {Array.from({ length: selected.ballCount }, (_, index) => <ProductChoice key={`${selected.id}-${index}`} products={productsByOption[selected.id] ?? []} position={index + 1} ballType={selected.ballType} />)}
        </div>
      ) : (
        <div className="prize-ball-selections">
          <p>This legacy prize option uses the original selection form.</p>
          {Array.from({ length: selected.ballCount }, (_, index) => <div className="prize-ball-selection" key={`${selected.id}-${index}`}><strong>Ball {index + 1}</strong><label>Ball name<input name="ballName" maxLength={200} required /></label><label>Product URL (legacy, optional)<input name="ballUrl" type="url" pattern="https://.*" maxLength={2000} /></label></div>)}
        </div>
      ) : null}
    </fieldset>
  );
}
