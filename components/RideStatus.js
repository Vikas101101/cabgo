const STEPS = [
  { key: "requested", label: "Requested" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

export default function RideStatus({ status }) {
  if (status === "cancelled") {
    return (
      <p className="rounded bg-red-100 px-3 py-2 text-center text-sm font-medium text-red-800">
        Ride cancelled
      </p>
    );
  }

  // Which step are we on? 0 = requested ... 3 = completed
  const current = STEPS.findIndex((s) => s.key === status);

  return (
    <ol className="flex">
      {STEPS.map((step, i) => {
        const done = i < current || status === "completed";
        const reached = i <= current;
        return (
          <li key={step.key} className="flex-1 text-center">
            <div
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                reached ? "bg-black text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <p className={`mt-1 text-xs ${i === current ? "font-semibold" : "text-gray-500"}`}>
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}