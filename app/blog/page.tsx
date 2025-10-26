
// import Main from "@/app/blog/Main";
// import ParticlesBackground from "@/components/particles";


// export default async function BlogPage() {

//   // Fetch ALL posts without any limit
//   const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
//     | order(coalesce(publishedAt, "1970-01-01") desc){
//       _id,
//       title,
//       slug,
//       publishedAt,
//       summary,
//       tags
//   }`;

//   let posts: {
//     slug: string;
//     date: string;
//     title: string;
//     summary: string;
//     tags: string[];
//   }[] = [];


//   return (
//     <main className="relative min-h-screen flex flex-col">
//       {/* Particle background */}
//       <div className="absolute inset-0 -z-10">
//         <ParticlesBackground />
//       </div>

//       {/* Header */}
//       <div className="flex-1 w-full flex flex-col justify-content items-center">
//         {/* Blog content */}
//         <div className="flex-1 w-full flex flex-col items-center mt-8 relative z-10 pb-20">
//           <div className="w-full max-w-5xl px-4">
//             {/* Debug info - remove this after fixing */}
//             <p className="text-sm text-gray-400 mb-4">
//               Showing {posts.length} post(s)
//             </p>
            
//             {posts.length > 0 ? (
//               <Main posts={posts} />
//             ) : (
//               <p className="text-center mt-20">
//                 No posts found. Check your Sanity content or make sure posts have slugs.
//               </p>
//             )}
//           </div>
//         </div>
//       </div>
//     </main>
//   );
// }