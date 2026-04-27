import { motion } from 'framer-motion'

export function SplashScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <img
        src="/PPA_Round_Logo_White_Background.png"
        alt="Padel Players"
        className="h-24 w-24 rounded-2xl mb-8 shadow-sm"
      />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009688] border-t-transparent" />
    </motion.div>
  )
}
