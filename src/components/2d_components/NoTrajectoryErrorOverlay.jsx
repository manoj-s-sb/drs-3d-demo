import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setTrajectoryComplete } from "../../store/slices/sessionSlice";

const NoTrajectoryErrorOverlay = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const timer = setTimeout(() => {
      // Mark trajectory as complete (even though it failed) to trigger pending video
      dispatch(setTrajectoryComplete());
    }, 3000);

    return () => clearTimeout(timer);
  }, [dispatch]);

  return (
    <div className="fixed inset-0 z-[999999] bg-transparent flex items-end justify-center pb-20">
      <p className="text-white text-2xl md:text-3xl font-medium">
        Ball trajectory not generated
      </p>
    </div>
  );
};

export default NoTrajectoryErrorOverlay;
