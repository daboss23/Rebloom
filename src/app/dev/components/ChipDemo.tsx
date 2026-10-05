"use client";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";

export function ChipDemo() {
  const [on, setOn] = useState(["Texture"]);
  return (
    <div className="flex flex-wrap gap-2">
      {["Uneven tone", "Texture", "Pores", "Redness"].map((label) => (
        <Chip key={label} selected={on.includes(label)} onClick={() => setOn((s) => (s.includes(label) ? s.filter((x) => x !== label) : [...s, label]))}>
          {label}
        </Chip>
      ))}
    </div>
  );
}
