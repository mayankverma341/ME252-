import React, { useState } from "react";
import FourPointPage from "./pages/FourPointPage";   // your existing page
import FivePointPage from "./pages/FivePointPage";

export default function App() {
  const [mode, setMode] = useState<"four" | "five">("four");

  return (
    <div className="flex flex-col h-screen">
      {/* Top nav */}
      <nav className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 z-30 flex-shrink-0">
        <span className="text-sm font-bold text-gray-700 mr-4">
          Four-Bar Synthesis
        </span>
        <button
          onClick={() => setMode("four")}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            mode === "four"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          4-Point
        </button>
        <button
          onClick={() => setMode("five")}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            mode === "five"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          5-Point
        </button>
      </nav>

      <div className="flex-1 overflow-hidden">
        {mode === "four" ? <FourPointPage /> : <FivePointPage />}
      </div>
    </div>
  );
}