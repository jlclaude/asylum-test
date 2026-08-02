import { formatOrdinal } from "./ordinal.ts";

export const SECOND_CHANCE_NUMBER_VARIABLE = "{{SECOND_CHANCE_NUMBER}}";
export const SECOND_CHANCE_ORDINAL_VARIABLE = "{{SECOND_CHANCE_ORDINAL}}";

type GameInstructionVariables = {
  secondChanceNumber: number;
};

export function renderGameInstructionVariables(
  text: string,
  variables: GameInstructionVariables,
) {
  return text
    .replaceAll(SECOND_CHANCE_NUMBER_VARIABLE, String(variables.secondChanceNumber))
    .replaceAll(SECOND_CHANCE_ORDINAL_VARIABLE, formatOrdinal(variables.secondChanceNumber));
}
