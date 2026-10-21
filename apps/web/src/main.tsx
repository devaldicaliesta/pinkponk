import "@fontsource/anton/latin-400.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import { render } from "preact";
import { trackErrors } from "./analytics";
import { initSettings } from "./state/settings";
import { App } from "./ui/App";

initSettings();
trackErrors();

const root = document.getElementById("app");
if (root) render(<App />, root);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
