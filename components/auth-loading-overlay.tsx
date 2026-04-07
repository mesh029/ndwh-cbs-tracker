"use client"

import { AnimatePresence, motion } from "framer-motion"

interface AuthLoadingOverlayProps {
  visible: boolean
}

export function AuthLoadingOverlay({ visible }: AuthLoadingOverlayProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-live="polite"
          aria-label="Authenticating"
          role="status"
        >
          <div className="relative h-24 w-24">
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-primary/20"
              animate={{ scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-2 rounded-full border-4 border-t-primary border-r-primary/60 border-b-transparent border-l-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            />
          </div>
          <motion.p
            className="mt-4 text-sm font-medium text-foreground/90"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
          >
            Loading PATH HIS...
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
