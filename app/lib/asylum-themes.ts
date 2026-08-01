export type AsylumThemeKey =
  | "classic"
  | "halloween"
  | "christmas"
  | "fourth"
  | "st-patricks"
  | "neon";

export type AsylumTheme = {
  key: AsylumThemeKey;
  label: string;
  description: string;
  pageBackground: string;
  panel: string;
  panelBorder: string;
  primary: string;
  primaryDark: string;
  secondary: string;
  wheelDark: string;
  valuePrimary: string;
  valueDark: string;
  text: string;
  muted: string;
};

export const ASYLUM_THEMES: Record<AsylumThemeKey, AsylumTheme> = {
  classic: {
    key: "classic",
    label: "Classic Asylum",
    description: "Industrial black, institutional red, and steel.",
    pageBackground:
      "radial-gradient(circle at top right, rgba(155,22,34,.24), transparent 36%), linear-gradient(145deg,#09090b,#171719 52%,#0c0c0e)",
    panel: "rgba(27,27,30,.96)",
    panelBorder: "#2c2c31",
    primary: "#d94051",
    primaryDark: "#8f2431",
    secondary: "#26262b",
    wheelDark: "#17171a",
    valuePrimary: "#b47d24",
    valueDark: "#2a2520",
    text: "#f5f5f5",
    muted: "#96979d",
  },
  halloween: {
    key: "halloween",
    label: "Asylum Halloween",
    description: "Rust, warning orange, black steel, and distressed red.",
    pageBackground:
      "radial-gradient(circle at top right, rgba(190,76,17,.22), transparent 36%), linear-gradient(145deg,#080808,#171310 52%,#0b0908)",
    panel: "rgba(27,24,22,.96)",
    panelBorder: "#403129",
    primary: "#c94d1c",
    primaryDark: "#7a2b13",
    secondary: "#27221f",
    wheelDark: "#171310",
    valuePrimary: "#b88421",
    valueDark: "#302614",
    text: "#f6f1ec",
    muted: "#a59b92",
  },
  christmas: {
    key: "christmas",
    label: "Asylum Christmas",
    description: "Blackened steel, blood red, frozen white, and restrained green.",
    pageBackground:
      "radial-gradient(circle at top right, rgba(137,22,35,.24), transparent 34%), radial-gradient(circle at bottom left, rgba(20,82,56,.18), transparent 34%), linear-gradient(145deg,#08090a,#141719 52%,#0a0c0d)",
    panel: "rgba(24,27,29,.96)",
    panelBorder: "#344046",
    primary: "#b92d3d",
    primaryDark: "#741d29",
    secondary: "#21332b",
    wheelDark: "#161a1c",
    valuePrimary: "#b79546",
    valueDark: "#29251a",
    text: "#f5f7f7",
    muted: "#9ba5a7",
  },
  fourth: {
    key: "fourth",
    label: "Asylum Independence",
    description: "Muted red, cold white, navy steel, and institutional black.",
    pageBackground:
      "radial-gradient(circle at top right, rgba(121,24,38,.22), transparent 35%), radial-gradient(circle at bottom left, rgba(31,54,91,.22), transparent 35%), linear-gradient(145deg,#090a0d,#14171e 52%,#0b0d12)",
    panel: "rgba(24,27,34,.96)",
    panelBorder: "#343a49",
    primary: "#a92f42",
    primaryDark: "#6e2130",
    secondary: "#252c3a",
    wheelDark: "#141820",
    valuePrimary: "#b89b59",
    valueDark: "#2d291f",
    text: "#f4f5f7",
    muted: "#9ca2ae",
  },
  "st-patricks": {
    key: "st-patricks",
    label: "Asylum St. Patrick’s",
    description: "Charcoal facility steel with toxic green warning accents.",
    pageBackground:
      "radial-gradient(circle at top right, rgba(31,126,74,.22), transparent 35%), linear-gradient(145deg,#080a09,#141916 52%,#090c0a)",
    panel: "rgba(23,28,25,.96)",
    panelBorder: "#304137",
    primary: "#24864e",
    primaryDark: "#165331",
    secondary: "#202b24",
    wheelDark: "#131815",
    valuePrimary: "#9b8a35",
    valueDark: "#292613",
    text: "#f2f7f3",
    muted: "#97a39a",
  },
  neon: {
    key: "neon",
    label: "Asylum Neon",
    description: "Black facility walls with electric red and violet containment lights.",
    pageBackground:
      "radial-gradient(circle at top right, rgba(212,38,90,.22), transparent 34%), radial-gradient(circle at bottom left, rgba(95,45,179,.2), transparent 34%), linear-gradient(145deg,#07070a,#12121a 52%,#08080d)",
    panel: "rgba(22,22,31,.96)",
    panelBorder: "#39354d",
    primary: "#d82c63",
    primaryDark: "#861b3d",
    secondary: "#28233a",
    wheelDark: "#13131b",
    valuePrimary: "#9d6be3",
    valueDark: "#2a2037",
    text: "#f7f4fb",
    muted: "#9f98ae",
  },
};

export function isAsylumThemeKey(value: string): value is AsylumThemeKey {
  return value in ASYLUM_THEMES;
}
