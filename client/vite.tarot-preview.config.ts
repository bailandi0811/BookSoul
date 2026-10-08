import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [
    {
      name: "tarot-preview-state",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "./useTarotRound" && importer?.endsWith("TarotPage.tsx")) {
          return path.resolve(
            __dirname,
            "src/components/Tarot/useTarotRound.preview.ts",
          );
        }
      },
    },
    react(),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
