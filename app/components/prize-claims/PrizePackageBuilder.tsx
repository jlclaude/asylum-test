import { useState } from "react";
import type { GameControlRouteMode } from "../../lib/game-control-routes";
import type { PrizeBallType } from "../../lib/prize-packages";
import { EmbeddedCollectionPicker } from "./EmbeddedCollectionPicker";
import { HostCollectionPicker } from "./HostCollectionPicker";

type DraftOption = {
  label: string;
  ballType: PrizeBallType;
  ballCount: number;
  collectionId: string;
  collectionTitle: string;
  collectionHandle: string;
};

const newOption = (): DraftOption => ({
  label: "",
  ballType: "DOMESTIC",
  ballCount: 1,
  collectionId: "",
  collectionTitle: "",
  collectionHandle: "",
});

export function PrizePackageBuilder({
  routeMode,
}: {
  routeMode: GameControlRouteMode;
}) {
  const [options, setOptions] = useState<DraftOption[]>([newOption()]);
  const CollectionPicker =
    routeMode === "HOST_PORTAL"
      ? HostCollectionPicker
      : EmbeddedCollectionPicker;
  const update = (index: number, value: Partial<DraftOption>) =>
    setOptions((current) =>
      current.map((option, position) =>
        position === index ? { ...option, ...value } : option,
      ),
    );
  const move = (index: number, direction: -1 | 1) =>
    setOptions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <fieldset className="prize-package-builder">
      <legend>HOW MANY PRIZE OPTIONS?</legend>
      <p>
        Build the choices this winner may select. Separate alternatives are
        shown with “OR”.
      </p>
      <input
        type="hidden"
        name="prizeOptionsJson"
        value={JSON.stringify(options)}
      />
      {options.map((option, index) => (
        <div className="prize-package-option" key={index}>
          {index ? <strong className="prize-package-or">OR</strong> : null}
          <span className="prize-package-number">Option {index + 1}</span>
          <label>
            Option label
            <input
              value={option.label}
              maxLength={200}
              required
              onChange={(event) =>
                update(index, { label: event.currentTarget.value })
              }
            />
          </label>
          <label>
            Ball type
            <select
              value={option.ballType}
              onChange={(event) =>
                update(index, {
                  ballType: event.currentTarget.value as PrizeBallType,
                })
              }
            >
              <option value="DOMESTIC">Domestic</option>
              <option value="OVERSEAS">Overseas</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
          <label>
            Number of balls
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={option.ballCount}
              required
              onChange={(event) =>
                update(index, { ballCount: Number(event.currentTarget.value) })
              }
            />
          </label>
          <CollectionPicker
            selectedCollection={
              option.collectionId
                ? {
                    id: option.collectionId,
                    title: option.collectionTitle,
                    handle: option.collectionHandle,
                    imageUrl: null,
                    imageAlt: null,
                    productCount: null,
                  }
                : null
            }
            onSelect={(collection) =>
              update(index, {
                collectionId: collection.id,
                collectionTitle: collection.title,
                collectionHandle: collection.handle,
              })
            }
            onClear={() =>
              update(index, {
                collectionId: "",
                collectionTitle: "",
                collectionHandle: "",
              })
            }
          />
          <div className="prize-package-controls">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              Move up
            </button>
            <button
              type="button"
              disabled={index === options.length - 1}
              onClick={() => move(index, 1)}
            >
              Move down
            </button>
            <button
              type="button"
              disabled={options.length === 1}
              onClick={() =>
                setOptions((current) =>
                  current.filter((_, position) => position !== index),
                )
              }
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="prize-add-option"
        onClick={() => setOptions((current) => [...current, newOption()])}
      >
        Add another option
      </button>
      <button type="button" onClick={() => setOptions([newOption()])}>
        Cancel
      </button>
    </fieldset>
  );
}
