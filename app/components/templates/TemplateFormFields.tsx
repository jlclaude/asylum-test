import type { GameTemplateFormValues } from "../../lib/game-template-validation";

type TemplateFormFieldsProps = {
  values?: Partial<GameTemplateFormValues>;
  errors?: Partial<Record<keyof GameTemplateFormValues | "form", string>>;
  idPrefix: string;
};

export function TemplateFormFields({ values, errors, idPrefix }: TemplateFormFieldsProps) {
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="template-fields">
      <label htmlFor={fieldId("name")}>Template name <span aria-hidden="true">*</span></label>
      <input id={fieldId("name")} name="name" maxLength={100} defaultValue={values?.name} required />
      {errors?.name ? <p className="template-error">{errors.name}</p> : null}

      <label htmlFor={fieldId("description")}>Template description</label>
      <textarea id={fieldId("description")} name="description" maxLength={500} defaultValue={values?.description} />
      {errors?.description ? <p className="template-error">{errors.description}</p> : null}

      <label htmlFor={fieldId("defaultGameTitle")}>Default game title</label>
      <input id={fieldId("defaultGameTitle")} name="defaultGameTitle" maxLength={150} defaultValue={values?.defaultGameTitle} />
      {errors?.defaultGameTitle ? <p className="template-error">{errors.defaultGameTitle}</p> : null}

      <label htmlFor={fieldId("defaultGameDescription")}>Default game description</label>
      <textarea id={fieldId("defaultGameDescription")} name="defaultGameDescription" maxLength={2000} defaultValue={values?.defaultGameDescription} />
      <small>Supported variable: {"{{SECOND_CHANCE_NUMBER}}"}. It remains saved in the template and resolves for each created game.</small>
      {errors?.defaultGameDescription ? <p className="template-error">{errors.defaultGameDescription}</p> : null}

      <div className="template-field-row">
        <div><label htmlFor={fieldId("totalSpots")}>Total spots</label><input id={fieldId("totalSpots")} name="totalSpots" type="number" min="1" max="100000" step="1" defaultValue={values?.totalSpots} required />{errors?.totalSpots ? <p className="template-error">{errors.totalSpots}</p> : null}</div>
        <div><label htmlFor={fieldId("pricePerSpot")}>Price per spot</label><input id={fieldId("pricePerSpot")} name="pricePerSpot" type="number" min="0" max="1000000" step="0.01" defaultValue={values?.pricePerSpot} required />{errors?.pricePerSpot ? <p className="template-error">{errors.pricePerSpot}</p> : null}</div>
        <div><label htmlFor={fieldId("wheelCount")}>Name wheels</label><input id={fieldId("wheelCount")} name="wheelCount" type="number" min="1" max="20" step="1" defaultValue={values?.wheelCount ?? "2"} required />{errors?.wheelCount ? <p className="template-error">{errors.wheelCount}</p> : null}</div>
      </div>

      <label htmlFor={fieldId("initialStatus")}>Initial game status</label>
      <select id={fieldId("initialStatus")} name="initialStatus" defaultValue={values?.initialStatus ?? "OPEN"}>
        <option value="OPEN">Open — accept claims</option>
        <option value="CLOSED">Closed — do not accept claims</option>
      </select>
      {errors?.initialStatus ? <p className="template-error">{errors.initialStatus}</p> : null}

      <label className="template-check" htmlFor={fieldId("isDefault")}>
        <input id={fieldId("isDefault")} name="isDefault" type="checkbox" value="true" defaultChecked={values?.isDefault} />
        Use as this shop’s default template
      </label>
    </div>
  );
}
