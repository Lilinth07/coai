import { ReactNode } from "react";
import { motion, useReducedMotion, Variants } from "framer-motion";

export const apiPageVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: "easeOut",
      when: "beforeChildren",
      staggerChildren: 0.07,
    },
  },
};

export const apiItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: "easeOut" },
  },
};

export const apiStaggerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

export const apiSectionVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: "easeOut" },
  },
};

export const apiCardHover = {
  y: -3,
  scale: 1.01,
  transition: { type: "spring" as const, stiffness: 350, damping: 25 },
};

export function ApiTabMotion({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
