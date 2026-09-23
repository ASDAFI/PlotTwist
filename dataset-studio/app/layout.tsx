import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"PlotTwist Studio — Dataset editor",description:"Review visual riddles, annotate clues, and compare model answers.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
