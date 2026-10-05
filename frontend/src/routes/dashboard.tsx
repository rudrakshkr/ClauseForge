import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Dashboard } from "@/components/clauseforge/Dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "ClauseForge AI — Workspace" },
      {
        name: "description",
        content:
          "ClauseForge RFP workspace for evidence-backed proposal generation and adversarial compliance review.",
      },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 12,
        scale: 0.995,
        filter: "blur(5px)",
      }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
      }}
      transition={{
        duration: 0.34,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="min-h-screen origin-center"
    >
      <Dashboard
        onBack={() => navigate({ to: "/" })}
        onHistory={() => navigate({ to: "/history" })}
      />
    </motion.div>
  );
}
