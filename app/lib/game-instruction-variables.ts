export const SECOND_CHANCE_NUMBER_VARIABLE = "{{SECOND_CHANCE_NUMBER}}";

type GameInstructionVariables = {
  secondChanceNumber: number;
};

export function renderGameInstructionVariables(
  text: string,
  variables: GameInstructionVariables,
) {
  return text.replaceAll(
    SECOND_CHANCE_NUMBER_VARIABLE,
    String(variables.secondChanceNumber),
  );
}
