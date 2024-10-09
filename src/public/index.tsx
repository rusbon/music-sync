import { createRoot } from "react-dom/client";
import React from "react";

function App() {
  return <h1>Hello from React!!</h1>;
}

const domNode = document.getElementById("app")!;

const root = createRoot(domNode);
root.render(<App />);
