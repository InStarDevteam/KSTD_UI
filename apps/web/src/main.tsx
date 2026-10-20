import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../../../packages/ui/tokens.css";
import "./styles.css";
const root = document.getElementById("root");
if (!root) throw new Error("앱을 시작할 수 없습니다. root 요소를 확인하세요.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
