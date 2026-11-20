import React from "react";
import { useSelector } from "react-redux";

const BlackOverlay = () => {
  const { isBattingDisplayBlacked } = useSelector((state) => state.session);

  if (!isBattingDisplayBlacked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999999] bg-black w-full h-full">
      {/* Completely black screen - simulates display being turned off */}
    </div>
  );
};

export default BlackOverlay;
