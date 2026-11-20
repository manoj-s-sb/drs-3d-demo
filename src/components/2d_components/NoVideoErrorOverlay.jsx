import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setVideoComplete } from "../../store/slices/sessionSlice";

const NoVideoErrorOverlay = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Auto-dismiss after 3 seconds and mark video as complete to trigger pending trajectory
    const timer = setTimeout(() => {
      dispatch(setVideoComplete());
    }, 3000);

    return () => clearTimeout(timer);
  }, [dispatch]);

  return (
    <div className="fixed inset-0 z-[999999] bg-transparent flex items-end justify-center pb-20">
      <p className="text-white text-2xl md:text-3xl font-medium">
        Video not Generated
      </p>
    </div>
  );
};

export default NoVideoErrorOverlay;
