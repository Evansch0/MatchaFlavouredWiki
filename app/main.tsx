import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WikiApp } from "./components/WikiApp";
import "./globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The wiki root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <WikiApp />
  </StrictMode>,
);
