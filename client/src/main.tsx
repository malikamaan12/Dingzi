import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerPwaServiceWorker } from "./lib/mobileBridge";

// Auto-reload once if a background Vite rebuild rotated lazy chunk hashes
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("dingzi-chunk-reload")) {
    sessionStorage.setItem("dingzi-chunk-reload", "1");
    window.location.reload();
  }
});

void registerPwaServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
