import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { MotionConfig } from "framer-motion";
import { ScenicBackground } from "./components/ScenicBackground";
import "./theme/scenic-ui.css";
import { useAppearanceStore } from "./store/useAppearanceStore";

const initialTheme = useAppearanceStore.getState().theme;
document.documentElement.classList.toggle("dark", initialTheme === "dark");
document.documentElement.style.colorScheme = initialTheme;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ScenicBackground />
      <App />
    </MotionConfig>
  </StrictMode>,
);
