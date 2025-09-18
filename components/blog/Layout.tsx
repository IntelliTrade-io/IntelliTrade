// import 'styles/tailwind.css'
// import 'pliny/search/algolia.css'
// import 'remark-github-blockquote-alert/alert.css'

// // import { Space_Grotesk } from 'next/font/google'
// import { SearchProvider, SearchConfig } from 'pliny/search'
// import Header from '@/components/blog/Header' // your main app header
// import Footer from '@/components/blog/Footer' // keep template footer
// import siteMetadata from '@/data/blog/siteMetadata'
// import { ThemeProvider } from "next-themes"
// import { Geist } from "next/font/google"
// import { Metadata } from 'next'

// // const space_grotesk = Space_Grotesk({
// //   subsets: ['latin'],
// //   display: 'swap',
// //   variable: '--font-space-grotesk',
// // })

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   display: "swap",
//   subsets: ["latin"],
// })

// export const metadata: Metadata = {
//   metadataBase: new URL(siteMetadata.siteUrl),
//   title: {
//     default: siteMetadata.title,
//     template: `%s | ${siteMetadata.title}`,
//   },
//   description: siteMetadata.description,
//   openGraph: {
//     title: siteMetadata.title,
//     description: siteMetadata.description,
//     url: './',
//     siteName: siteMetadata.title,
//     images: [siteMetadata.socialBanner],
//     locale: 'en_US',
//     type: 'website',
//   },
//   alternates: {
//     canonical: './',
//     types: {
//       'application/rss+xml': `${siteMetadata.siteUrl}/feed.xml`,
//     },
//   },
//   robots: {
//     index: true,
//     follow: true,
//     googleBot: {
//       index: true,
//       follow: true,
//       'max-video-preview': -1,
//       'max-image-preview': 'large',
//       'max-snippet': -1,
//     },
//   },
//   twitter: {
//     title: siteMetadata.title,
//     card: 'summary_large_image',
//     images: [siteMetadata.socialBanner],
//   },
// }

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html
//       lang={siteMetadata.language}
//       className={`${geistSans.className} scroll-smooth`}
//       suppressHydrationWarning
//     >
//       <body className="antialiased">
//         <ThemeProvider>
//           <SearchProvider searchConfig={siteMetadata.search as typeof SearchConfig}>
//             {/* MAIN APP HEADER */}
//             <Header />

//             {/* Blog content */}
//             <main className="w-full">
//               {children}
//             </main>

//             {/* FOOTER */}
//             <Footer/>
//           </SearchProvider>
//         </ThemeProvider>
//       </body>
//     </html>
//   )
// }
