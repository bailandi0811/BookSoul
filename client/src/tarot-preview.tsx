import { createRoot } from "react-dom/client";
import { TarotPage } from "./components/Tarot/TarotPage";
import "./index.css";
import "./theme/scenic-ui.css";

createRoot(document.getElementById("root")!).render(
  <TarotPage onBack={() => undefined} />,
);
