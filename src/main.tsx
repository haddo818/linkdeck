import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import App from "./app/App.tsx";
import "./styles/index.css";
import { initThemeFromStorage } from "./theme-storage.ts";

initThemeFromStorage();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Toaster richColors position="bottom-center" closeButton />
  </>
);
  