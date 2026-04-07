import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'Laborativo Preguntas',
  description: 'Sistema de preguntas en tiempo real',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={dmSans.className}>{children}</body>
    </html>
  )
}
