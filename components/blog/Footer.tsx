import Link from './Link'
import siteMetadata from '@/data/blog/siteMetadata'
import SocialIcon from '@/components/blog/social-icons'
// import NewsletterForm from '@/node_modules/pliny/ui/NewsletterForm'

export default function Footer() {
  return (
    <footer className='z-10 flex items-center justify-around relative text-white'>
      {siteMetadata.newsletter?.provider && (
        <div className="flex items-center justify-center pt-4">
          {/* <NewsletterForm />
           */}

            <iframe width="540" height="305" src="https://e2c25aa6.sibforms.com/serve/MUIFALejH0WZ43XeOwFP5k4uu3B4phdRbcSbjC2xLmQ_NVPvbuk87o2JO36zWeb_b5IVLpccOY9PC6pNmATaO-XfVCfSBQwB8VdHGngpqrriuoebC_dSo01maD799n9K_wcWEudHCx3jWMzk-denLSWoCbpVSOaN9BNj-a8KadQrMWZGjSkyxX3nT6CJsS8BESoNip1GUG3d2djf" frameBorder="0" scrolling="auto" allowFullScreen className="newsletterIFrame"></iframe>



        </div>
      )}
      <div className="mt-16 flex flex-col items-center">
        <div className="mb-3 flex space-x-4">
          <SocialIcon  kind="mail" href={`mailto:${siteMetadata.email}`} size={6} />
          {/* <SocialIcon kind="github" href={siteMetadata.github} size={6} /> */}
          <SocialIcon kind="facebook" href={siteMetadata.facebook} size={6} />
          {/* <SocialIcon kind="youtube" href={siteMetadata.youtube} size={6} /> */}
          <SocialIcon kind="linkedin" href={siteMetadata.linkedin} size={6} />
          {/* <SocialIcon kind="twitter" href={siteMetadata.twitter} size={6} /> */}
          {/* <SocialIcon kind="bluesky" href={siteMetadata.bluesky} size={6} /> */}
          <SocialIcon kind="x" href={siteMetadata.x} size={6} />
          <SocialIcon kind="instagram" href={siteMetadata.instagram} size={6} />
          <SocialIcon kind="threads" href={siteMetadata.threads} size={6} />
          {/* <SocialIcon kind="medium" href={siteMetadata.medium} size={6} /> */}
        </div>
        <div className="mb-2 flex space-x-2 text-sm">
          <div>{siteMetadata.author}</div>
          <div>{` • `}</div>
          <div>{`© ${new Date().getFullYear()}`}</div>
          <div>{` • `}</div>
          <Link href="/">{siteMetadata.title}</Link>
        </div>
        <div className="mb-8 text-sm">
         
        </div>
      </div>
    </footer>
  )
}
