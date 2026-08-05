import { Prisma } from "@prisma/client";
import {
  gameTemplateValues,
  validateGameTemplate,
} from "../lib/game-template-validation";
import {
  createGameTemplate,
  deleteGameTemplate,
  duplicateGameTemplate,
  updateGameTemplate,
} from "../models/game-template.server";

export type GameTemplateActionData = {
  intent: string;
  templateId?: string;
  success?: string;
  errors?: ReturnType<typeof validateGameTemplate>["errors"];
  values?: ReturnType<typeof gameTemplateValues>;
};

export async function handleGameTemplateAction(
  shop: string,
  formData: FormData,
): Promise<GameTemplateActionData> {
  const intent = String(formData.get("intent") ?? "");
  const templateId = String(formData.get("templateId") ?? "");

  try {
    if (intent === "delete") {
      const result = await deleteGameTemplate(templateId, shop);
      return result.count
        ? { intent, success: "Template deleted." }
        : { intent, errors: { form: "Template not found." } };
    }
    if (intent === "duplicate") {
      const duplicated = await duplicateGameTemplate(templateId, shop);
      return duplicated
        ? { intent, success: `Created ${duplicated.name}.` }
        : { intent, errors: { form: "Template not found." } };
    }

    const values = gameTemplateValues(formData);
    const validation = validateGameTemplate(values);
    if (!validation.input)
      return { intent, templateId, errors: validation.errors, values };

    if (intent === "create") {
      await createGameTemplate(shop, validation.input);
      return { intent, success: "Template created." };
    }
    if (intent === "update") {
      const updated = await updateGameTemplate(
        templateId,
        shop,
        validation.input,
      );
      return updated
        ? { intent, templateId, success: "Template updated." }
        : {
            intent,
            templateId,
            errors: { form: "Template not found." },
            values,
          };
    }
    return { intent, errors: { form: "Unknown template action." }, values };
  } catch (error) {
    const duplicate =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (!duplicate) console.error("Template action failed:", error);
    return {
      intent,
      templateId,
      errors: {
        form: duplicate
          ? "A template with this name already exists for this shop."
          : "The template could not be saved.",
      },
      values:
        intent === "create" || intent === "update"
          ? gameTemplateValues(formData)
          : undefined,
    };
  }
}
