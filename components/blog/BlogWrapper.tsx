// components/blog/BlogWrapper.tsx
import { ReactNode } from "react";
import { SearchProvider, SearchConfig } from "pliny/search";
import SectionContainer from "@/components/blog/SectionContainer";
import Footer from "@/components/blog/Footer"; // keep only 1 footer
import siteMetadata from "@/data/blog/siteMetadata";

export default function BlogWrapper({ children }: { children: ReactNode }) {
  return (
    <SectionContainer>
      <SearchProvider searchConfig={siteMetadata.search as typeof SearchConfig}>
        {/* ONLY the blog content goes here */}
        {children}
        <Footer /> {/* only 1 footer */}
      </SearchProvider>
    </SectionContainer>
  );
}
