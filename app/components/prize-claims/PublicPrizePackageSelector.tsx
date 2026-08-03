import { useState } from "react";
import type { PrizePackageOption } from "../../lib/prize-packages";

export function PublicPrizePackageSelector({ options }: { options: PrizePackageOption[] }) {
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
            <span><strong>{option.label}</strong><small>{option.ballCount} {option.ballType.toLowerCase()} bowling {option.ballCount === 1 ? "ball" : "balls"}</small></span>
          </label>
        ))}
      </div>
      {selected ? (
        <div className="prize-ball-selections">
          <h2>Your bowling ball {selected.ballCount === 1 ? "selection" : "selections"}</h2>
          {Array.from({ length: selected.ballCount }, (_, index) => (
            <div className="prize-ball-selection" key={`${selected.id}-${index}`}>
              <strong>Ball {index + 1}</strong>
              <label>Ball name<input name="ballName" maxLength={200} required /></label>
              <label>Product URL (optional)<input name="ballUrl" type="url" inputMode="url" placeholder="https://…" maxLength={2000} pattern="https://.*" /></label>
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
